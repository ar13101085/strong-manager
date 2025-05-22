package handlers

import (
	"database/sql"
	"fmt"
	"strconv"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/middleware"
	"github.com/arifur/strong-reverse-proxy/models"
	"github.com/arifur/strong-reverse-proxy/proxy"
	"github.com/gofiber/fiber/v2"
)

// UpdateDNSRule updates a DNS rule
func UpdateDNSRule(c *fiber.Ctx) error {
	// Get DNS rule ID from URL
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid DNS rule ID",
		})
	}

	// Parse request body
	var req models.DNSRule
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Log hostname if provided
	if req.Hostname != "" {
		fmt.Printf("Processing DNS rule update with hostname: %q\n", req.Hostname)
	}

	// Start a transaction
	tx, err := database.DB.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}
	defer tx.Rollback()

	// Check if the DNS rule exists
	var exists bool
	err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM dns_rules WHERE id = ?)", id).Scan(&exists)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}

	if !exists {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "DNS rule not found",
		})
	}

	// Build the update query
	query := "UPDATE dns_rules SET "
	var params []interface{}
	var needsComma bool

	// Add the fields to update
	if req.Hostname != "" {
		query += "hostname = ?"
		params = append(params, req.Hostname)
		needsComma = true
	}

	// Rate limiting fields - check if the fields were set in the request body
	// We can safely always update rate_limit_enabled as it's a boolean
	if needsComma {
		query += ", "
	}
	query += "rate_limit_enabled = ?"
	params = append(params, req.RateLimitEnabled)
	needsComma = true

	if req.RateLimitQuota > 0 {
		if needsComma {
			query += ", "
		}
		query += "rate_limit_quota = ?"
		params = append(params, req.RateLimitQuota)
		needsComma = true
	}

	if req.RateLimitPeriod > 0 {
		if needsComma {
			query += ", "
		}
		query += "rate_limit_period = ?"
		params = append(params, req.RateLimitPeriod)
		needsComma = true
	}

	// Log retention field
	if req.LogRetentionDays > 0 {
		if needsComma {
			query += ", "
		}
		query += "log_retention_days = ?"
		params = append(params, req.LogRetentionDays)
		needsComma = true
	}

	// Health check field - boolean field can be safely updated
	if needsComma {
		query += ", "
	}
	query += "health_check_enabled = ?"
	params = append(params, req.HealthCheckEnabled)
	needsComma = true

	// Add WHERE clause and execute if we have parameters to update
	if len(params) > 0 {
		query += " WHERE id = ?"
		params = append(params, id)

		_, err := tx.Exec(query, params...)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to update DNS rule",
			})
		}
	}

	// Update backends if provided
	if len(req.TargetBackendURLs) > 0 {
		// Get the list of current backend IDs for this DNS rule
		rows, err := tx.Query("SELECT backend_id FROM dns_backend_map WHERE dns_rule_id = ?", id)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to query current backend mappings",
			})
		}

		// Collect backend IDs
		var oldBackendIDs []int
		for rows.Next() {
			var backendID int
			if err := rows.Scan(&backendID); err != nil {
				rows.Close()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "Error scanning backend ID",
				})
			}
			oldBackendIDs = append(oldBackendIDs, backendID)
		}
		rows.Close()

		// Remove existing mappings
		_, err = tx.Exec("DELETE FROM dns_backend_map WHERE dns_rule_id = ?", id)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to update DNS-backend mappings",
			})
		}

		// Add new mappings
		for _, backend := range req.TargetBackendURLs {
			// Check if the backend already exists
			var backendID int64
			err := tx.QueryRow("SELECT id FROM backends WHERE url = ?", backend.URL).Scan(&backendID)
			if err != nil {
				if err == sql.ErrNoRows {
					// Insert new backend
					backendResult, err := tx.Exec(
						"INSERT INTO backends (url, weight, isActive) VALUES (?, ?, ?)",
						backend.URL, backend.Weight, backend.IsActive,
					)
					if err != nil {
						return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
							"error": "Failed to create backend",
						})
					}
					backendID, _ = backendResult.LastInsertId()
				} else {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
						"error": "Database error",
					})
				}
			} else if backend.Weight > 0 || backend.IsActive {
				// Update backend if needed
				_, err := tx.Exec(
					"UPDATE backends SET weight = ?, isActive = ? WHERE id = ?",
					backend.Weight, backend.IsActive, backendID,
				)
				if err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
						"error": "Failed to update backend",
					})
				}
			}

			// Create mapping
			_, err = tx.Exec(
				"INSERT INTO dns_backend_map (dns_rule_id, backend_id) VALUES (?, ?)",
				id, backendID,
			)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "Failed to create DNS-backend mapping",
				})
			}
		}

		// For each old backend ID, check if it's still used by any DNS rule
		// If not, delete it
		for _, backendID := range oldBackendIDs {
			var count int
			err := tx.QueryRow("SELECT COUNT(*) FROM dns_backend_map WHERE backend_id = ?", backendID).Scan(&count)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "Failed to check backend usage",
				})
			}

			// If backend is not used by any other DNS rule, delete it
			if count == 0 {
				_, err := tx.Exec("DELETE FROM backends WHERE id = ?", backendID)
				if err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
						"error": "Failed to delete unused backend",
					})
				}
				fmt.Printf("Deleted unused backend ID: %d during DNS rule update\n", backendID)
			}
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to commit transaction",
		})
	}

	// Get updated DNS rule for response
	var rule models.DNSRule
	rule.ID = id

	err = database.DB.QueryRow(`
		SELECT 
			hostname, 
			rate_limit_enabled, 
			rate_limit_quota, 
			rate_limit_period, 
			log_retention_days,
			health_check_enabled
		FROM dns_rules 
		WHERE id = ?`,
		id,
	).Scan(
		&rule.Hostname,
		&rule.RateLimitEnabled,
		&rule.RateLimitQuota,
		&rule.RateLimitPeriod,
		&rule.LogRetentionDays,
		&rule.HealthCheckEnabled,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}

	// Get backends for this DNS rule
	backendRows, err := database.DB.Query(`
		SELECT 
			b.id, 
			b.url, 
			b.weight, 
			b.isActive
		FROM 
			backends b
		JOIN 
			dns_backend_map m ON b.id = m.backend_id
		WHERE 
			m.dns_rule_id = ?
	`, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}
	defer backendRows.Close()

	// Collect backends
	backends := []models.Backend{}
	for backendRows.Next() {
		var backend models.Backend
		if err := backendRows.Scan(&backend.ID, &backend.URL, &backend.Weight, &backend.IsActive); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Error scanning backend",
			})
		}
		backends = append(backends, backend)
	}
	rule.TargetBackendURLs = backends

	// After successful update, immediately refresh the DNS rules cache
	proxy.RefreshDNSRulesCache()

	// Also refresh rate limiter configurations
	middleware.RefreshRateLimiterConfigs()

	return c.JSON(rule)
}

// DeleteDNSRule deletes a DNS rule
func DeleteDNSRule(c *fiber.Ctx) error {
	// Get DNS rule ID from URL
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid DNS rule ID",
		})
	}

	// Start a transaction
	tx, err := database.DB.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}
	defer tx.Rollback()

	// First, get the list of backend IDs associated with this DNS rule
	rows, err := tx.Query("SELECT backend_id FROM dns_backend_map WHERE dns_rule_id = ?", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to query backend mappings",
		})
	}

	// Collect backend IDs
	var backendIDs []int
	for rows.Next() {
		var backendID int
		if err := rows.Scan(&backendID); err != nil {
			rows.Close()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Error scanning backend ID",
			})
		}
		backendIDs = append(backendIDs, backendID)
	}
	rows.Close()

	// Delete mappings
	_, err = tx.Exec("DELETE FROM dns_backend_map WHERE dns_rule_id = ?", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete DNS rule mappings",
		})
	}

	// Delete DNS rule
	result, err := tx.Exec("DELETE FROM dns_rules WHERE id = ?", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete DNS rule",
		})
	}

	// For each backend ID, check if it's still used by other DNS rules
	// If not, delete it
	for _, backendID := range backendIDs {
		var count int
		err := tx.QueryRow("SELECT COUNT(*) FROM dns_backend_map WHERE backend_id = ?", backendID).Scan(&count)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to check backend usage",
			})
		}

		// If backend is not used by any other DNS rule, delete it
		if count == 0 {
			_, err := tx.Exec("DELETE FROM backends WHERE id = ?", backendID)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "Failed to delete unused backend",
				})
			}
			fmt.Printf("Deleted unused backend ID: %d\n", backendID)
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to commit transaction",
		})
	}

	// Check if any rows were affected
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "DNS rule not found",
		})
	}

	// After successful deletion, immediately refresh the DNS rules cache
	proxy.RefreshDNSRulesCache()

	// Also refresh rate limiter configurations
	middleware.RefreshRateLimiterConfigs()

	// Return success
	return c.SendStatus(fiber.StatusNoContent)
}

// CleanupOrphanedBackends removes any backends that aren't associated with any DNS rule
// This can be called periodically to clean up any backends that somehow weren't
// caught by the delete or update operations
func CleanupOrphanedBackends() {
	fmt.Println("Cleaning up orphaned backends...")

	// Find all backend IDs that aren't in the dns_backend_map table
	query := `
		DELETE FROM backends 
		WHERE id NOT IN (
			SELECT DISTINCT backend_id 
			FROM dns_backend_map
		)
	`

	result, err := database.DB.Exec(query)
	if err != nil {
		fmt.Printf("Error cleaning up orphaned backends: %v\n", err)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	fmt.Printf("Deleted %d orphaned backends\n", rowsAffected)
}
