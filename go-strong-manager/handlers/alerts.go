package handlers

import (
	"database/sql"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/models"
	"github.com/gofiber/fiber/v2"
)

// GetAlerts returns all alerts
func GetAlerts(c *fiber.Ctx) error {
	// Query all alerts with DNS rule info
	rows, err := database.DB.Query(`
		SELECT 
			a.id, 
			a.dns_rule_id,
			a.type, 
			a.destination, 
			a.threshold, 
			a.enabled,
			a.created_at,
			d.hostname
		FROM 
			alerts a
		LEFT JOIN
			dns_rules d ON a.dns_rule_id = d.id
		ORDER BY 
			a.id
	`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch alerts",
		})
	}
	defer rows.Close()

	// Process results
	alerts := []models.Alert{}
	for rows.Next() {
		var alert models.Alert
		var typeStr string
		var createdAtStr string
		var hostname sql.NullString

		if err := rows.Scan(
			&alert.ID,
			&alert.DNSRuleID,
			&typeStr,
			&alert.Destination,
			&alert.Threshold,
			&alert.Enabled,
			&createdAtStr,
			&hostname,
		); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to scan alert row",
			})
		}

		// Parse alert type
		alert.Type = models.AlertType(typeStr)

		// Get hostname if available
		if hostname.Valid {
			alert.Hostname = hostname.String
		}

		// Parse created_at
		if createdAt, err := time.Parse("2006-01-02 15:04:05", createdAtStr); err == nil {
			alert.CreatedAt = createdAt
		} else {
			alert.CreatedAt = time.Now() // Fallback
		}

		// Get recent alert events for this alert
		eventsRows, err := database.DB.Query(`
			SELECT 
				id, 
				message, 
				timestamp, 
				sent 
			FROM 
				alert_events 
			WHERE 
				alert_id = ? 
			ORDER BY 
				timestamp DESC 
			LIMIT 5
		`, alert.ID)
		if err == nil {
			for eventsRows.Next() {
				var event models.AlertEvent
				var timestampStr string

				if err := eventsRows.Scan(&event.ID, &event.Message, &timestampStr, &event.Sent); err == nil {
					event.AlertID = alert.ID

					// Parse timestamp
					if timestamp, err := time.Parse("2006-01-02 15:04:05", timestampStr); err == nil {
						event.Timestamp = timestamp
					} else {
						event.Timestamp = time.Now() // Fallback
					}
				}
			}
			eventsRows.Close()
		}

		alerts = append(alerts, alert)
	}

	return c.Status(fiber.StatusOK).JSON(alerts)
}

// GetDNSRules returns all DNS rules for alert selection dropdown
func GetDNSRulesForAlerts(c *fiber.Ctx) error {
	// Query all DNS rules
	rows, err := database.DB.Query(`
		SELECT 
			id, 
			hostname
		FROM 
			dns_rules
		ORDER BY
			hostname
	`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch DNS rules",
		})
	}
	defer rows.Close()

	// Process results
	dnsRules := []map[string]interface{}{}

	// First add a "Global" option
	dnsRules = append(dnsRules, map[string]interface{}{
		"id":       0,
		"hostname": "Global (All Hosts)",
	})

	// Then add actual DNS rules
	for rows.Next() {
		var id int
		var hostname string

		if err := rows.Scan(&id, &hostname); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to scan DNS rule",
			})
		}

		dnsRules = append(dnsRules, map[string]interface{}{
			"id":       id,
			"hostname": hostname,
		})
	}

	return c.Status(fiber.StatusOK).JSON(dnsRules)
}

// CreateAlert creates a new alert
func CreateAlert(c *fiber.Ctx) error {
	// Parse request body
	var alert models.Alert
	if err := c.BodyParser(&alert); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate alert
	if alert.Type != models.AlertTypeEmail && alert.Type != models.AlertTypeWebhook {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid alert type. Must be 'email' or 'webhook'",
		})
	}

	if alert.Destination == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Destination is required",
		})
	}

	// Ensure threshold is positive
	if alert.Threshold <= 0 {
		alert.Threshold = 5 // Default
	}

	// If dns_rule_id is provided and not 0, verify it exists
	if alert.DNSRuleID > 0 {
		var exists bool
		err := database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM dns_rules WHERE id = ?)", alert.DNSRuleID).Scan(&exists)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Database error when checking DNS rule",
			})
		}
		if !exists {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "The specified DNS rule does not exist",
			})
		}
	} else {
		// Ensure it's 0 for global alerts
		alert.DNSRuleID = 0
	}

	// Insert alert
	result, err := database.DB.Exec(`
		INSERT INTO alerts (
			dns_rule_id,
			type, 
			destination, 
			threshold, 
			enabled
		) VALUES (?, ?, ?, ?, ?)
	`, alert.DNSRuleID, string(alert.Type), alert.Destination, alert.Threshold, alert.Enabled)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create alert",
		})
	}

	// Get inserted ID
	id, _ := result.LastInsertId()
	alert.ID = int(id)
	alert.CreatedAt = time.Now()

	// Get hostname if associated with a DNS rule
	if alert.DNSRuleID > 0 {
		err := database.DB.QueryRow("SELECT hostname FROM dns_rules WHERE id = ?", alert.DNSRuleID).Scan(&alert.Hostname)
		if err != nil {
			// Just log, don't fail the request
			alert.Hostname = ""
		}
	} else {
		alert.Hostname = "Global (All Hosts)"
	}

	return c.Status(fiber.StatusCreated).JSON(alert)
}

// UpdateAlert updates an existing alert
func UpdateAlert(c *fiber.Ctx) error {
	// Get alert ID from URL
	id, err := c.ParamsInt("id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid alert ID",
		})
	}

	// Parse request body
	var alert models.Alert
	if err := c.BodyParser(&alert); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Check if alert exists
	var exists bool
	err = database.DB.QueryRow("SELECT 1 FROM alerts WHERE id = ?", id).Scan(&exists)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Alert not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}

	// If dns_rule_id is provided and not 0, verify it exists
	if alert.DNSRuleID > 0 {
		var exists bool
		err := database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM dns_rules WHERE id = ?)", alert.DNSRuleID).Scan(&exists)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Database error when checking DNS rule",
			})
		}
		if !exists {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "The specified DNS rule does not exist",
			})
		}
	} else if alert.DNSRuleID < 0 {
		// Make sure negative values become 0
		alert.DNSRuleID = 0
	}

	// Update alert
	_, err = database.DB.Exec(`
		UPDATE alerts 
		SET 
			dns_rule_id = COALESCE(?, dns_rule_id),
			type = COALESCE(?, type),
			destination = COALESCE(?, destination),
			threshold = COALESCE(?, threshold),
			enabled = COALESCE(?, enabled)
		WHERE 
			id = ?
	`, alert.DNSRuleID, string(alert.Type), alert.Destination, alert.Threshold, alert.Enabled, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update alert",
		})
	}

	// Get updated alert
	updatedAlert := models.Alert{ID: id}
	var typeStr string
	var createdAtStr string
	var hostname sql.NullString
	err = database.DB.QueryRow(`
		SELECT 
			dns_rule_id,
			type, 
			destination, 
			threshold, 
			enabled,
			created_at,
			(SELECT hostname FROM dns_rules WHERE id = alerts.dns_rule_id)
		FROM 
			alerts 
		WHERE 
			id = ?
	`, id).Scan(
		&updatedAlert.DNSRuleID,
		&typeStr,
		&updatedAlert.Destination,
		&updatedAlert.Threshold,
		&updatedAlert.Enabled,
		&createdAtStr,
		&hostname,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch updated alert",
		})
	}

	updatedAlert.Type = models.AlertType(typeStr)

	// Get hostname if available
	if hostname.Valid {
		updatedAlert.Hostname = hostname.String
	} else if updatedAlert.DNSRuleID == 0 {
		updatedAlert.Hostname = "Global (All Hosts)"
	}

	// Parse created_at
	if createdAt, err := time.Parse("2006-01-02 15:04:05", createdAtStr); err == nil {
		updatedAlert.CreatedAt = createdAt
	} else {
		updatedAlert.CreatedAt = time.Now() // Fallback
	}

	return c.Status(fiber.StatusOK).JSON(updatedAlert)
}

// DeleteAlert deletes an alert
func DeleteAlert(c *fiber.Ctx) error {
	// Get alert ID from URL
	id, err := c.ParamsInt("id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid alert ID",
		})
	}

	// Check if alert exists
	var exists bool
	err = database.DB.QueryRow("SELECT 1 FROM alerts WHERE id = ?", id).Scan(&exists)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Alert not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}

	// Delete alert
	_, err = database.DB.Exec("DELETE FROM alerts WHERE id = ?", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete alert",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}
