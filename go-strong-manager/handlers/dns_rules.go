package handlers

import (
	"database/sql"
	"fmt"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/middleware"
	"github.com/arifur/strong-reverse-proxy/models"
	"github.com/arifur/strong-reverse-proxy/proxy"
	"github.com/gofiber/fiber/v2"
)

// GetDNSRules returns all DNS rules
func GetDNSRules(c *fiber.Ctx) error {
	// Query all DNS rules
	rows, err := database.DB.Query(`
		SELECT 
			d.id, 
			d.hostname,
			d.rate_limit_enabled,
			d.rate_limit_quota,
			d.rate_limit_period,
			d.log_retention_days,
			d.health_check_enabled
		FROM 
			dns_rules d
	`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}
	defer rows.Close()

	// Map to store DNS rules
	dnsRules := []models.DNSRule{}

	// Iterate through DNS rules
	for rows.Next() {
		var rule models.DNSRule
		if err := rows.Scan(
			&rule.ID,
			&rule.Hostname,
			&rule.RateLimitEnabled,
			&rule.RateLimitQuota,
			&rule.RateLimitPeriod,
			&rule.LogRetentionDays,
			&rule.HealthCheckEnabled,
		); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Error scanning DNS rule",
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
		`, rule.ID)
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
		dnsRules = append(dnsRules, rule)
	}

	return c.JSON(dnsRules)
}

// CreateDNSRule creates a new DNS rule
func CreateDNSRule(c *fiber.Ctx) error {
	// Parse request body
	var req models.DNSRule
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate inputs
	if req.Hostname == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Hostname is required",
		})
	}

	// Log the hostname being processed
	fmt.Printf("Processing DNS rule creation for hostname: %q\n", req.Hostname)

	if len(req.TargetBackendURLs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "At least one backend URL is required",
		})
	}

	// Set default values for rate limiting and log retention if not provided
	if req.RateLimitQuota <= 0 {
		req.RateLimitQuota = 100 // Default 100 requests per period
	}
	if req.RateLimitPeriod <= 0 {
		req.RateLimitPeriod = 60 // Default 60 seconds
	}
	if req.LogRetentionDays <= 0 {
		req.LogRetentionDays = 30 // Default 30 days
	}

	// Start a transaction
	tx, err := database.DB.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}
	defer tx.Rollback()

	// Insert DNS rule
	result, err := tx.Exec(
		"INSERT INTO dns_rules (hostname, rate_limit_enabled, rate_limit_quota, rate_limit_period, log_retention_days, health_check_enabled) VALUES (?, ?, ?, ?, ?, ?)",
		req.Hostname, req.RateLimitEnabled, req.RateLimitQuota, req.RateLimitPeriod, req.LogRetentionDays, req.HealthCheckEnabled,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create DNS rule",
		})
	}

	// Get the inserted DNS rule ID
	dnsRuleID, _ := result.LastInsertId()

	// Insert backends and mappings
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
		}

		// Create mapping
		_, err = tx.Exec(
			"INSERT INTO dns_backend_map (dns_rule_id, backend_id) VALUES (?, ?)",
			dnsRuleID, backendID,
		)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to create DNS-backend mapping",
			})
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to commit transaction",
		})
	}

	// Set the ID in the response
	req.ID = int(dnsRuleID)

	// After successful creation, immediately refresh the DNS rules cache
	proxy.RefreshDNSRulesCache()

	// Also refresh rate limiter configurations
	middleware.RefreshRateLimiterConfigs()

	return c.Status(fiber.StatusCreated).JSON(req)
}
