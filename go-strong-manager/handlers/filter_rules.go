package handlers

import (
	"strconv"
	"strings"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/filter"
	"github.com/arifur/strong-reverse-proxy/models"
	"github.com/gofiber/fiber/v2"
)

// GetFilterRules returns all filter rules
func GetFilterRules(c *fiber.Ctx) error {
	rows, err := database.DB.Query(`
		SELECT 
			id, name, match_type, match_value, action_type, action_value, 
			status_code, is_active, priority, created_at, updated_at
		FROM 
			filter_rules 
		ORDER BY 
			priority DESC, id ASC
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch filter rules"})
	}
	defer rows.Close()

	var rules []models.FilterRule
	for rows.Next() {
		var rule models.FilterRule
		err := rows.Scan(
			&rule.ID, &rule.Name, &rule.MatchType, &rule.MatchValue,
			&rule.ActionType, &rule.ActionValue, &rule.StatusCode,
			&rule.IsActive, &rule.Priority, &rule.CreatedAt, &rule.UpdatedAt,
		)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to scan filter rule"})
		}
		rules = append(rules, rule)
	}

	return c.JSON(rules)
}

// CreateFilterRule creates a new filter rule
func CreateFilterRule(c *fiber.Ctx) error {
	var rule models.FilterRule
	if err := c.BodyParser(&rule); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Validate required fields
	if rule.Name == "" || rule.MatchType == "" || rule.MatchValue == "" || rule.ActionType == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing required fields"})
	}

	// Set default values
	if rule.StatusCode == 0 {
		rule.StatusCode = 200
	}
	if rule.Priority == 0 {
		rule.Priority = 0
	}

	// Insert into database
	result, err := database.DB.Exec(`
		INSERT INTO filter_rules (
			name, match_type, match_value, action_type, action_value, 
			status_code, is_active, priority, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, rule.Name, string(rule.MatchType), rule.MatchValue, string(rule.ActionType),
		rule.ActionValue, rule.StatusCode, rule.IsActive, rule.Priority,
		time.Now(), time.Now())

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create filter rule"})
	}

	id, _ := result.LastInsertId()
	rule.ID = int(id)
	rule.CreatedAt = time.Now()
	rule.UpdatedAt = time.Now()

	// Refresh filter cache
	filter.RefreshFilterCache()

	return c.Status(201).JSON(rule)
}

// UpdateFilterRule updates an existing filter rule
func UpdateFilterRule(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid rule ID"})
	}

	var rule models.FilterRule
	if err := c.BodyParser(&rule); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Validate required fields
	if rule.Name == "" || rule.MatchType == "" || rule.MatchValue == "" || rule.ActionType == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing required fields"})
	}

	// Update in database
	_, err = database.DB.Exec(`
		UPDATE filter_rules 
		SET name = ?, match_type = ?, match_value = ?, action_type = ?, 
		    action_value = ?, status_code = ?, is_active = ?, priority = ?, updated_at = ?
		WHERE id = ?
	`, rule.Name, string(rule.MatchType), rule.MatchValue, string(rule.ActionType),
		rule.ActionValue, rule.StatusCode, rule.IsActive, rule.Priority,
		time.Now(), id)

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update filter rule"})
	}

	rule.ID = id
	rule.UpdatedAt = time.Now()

	// Refresh filter cache
	filter.RefreshFilterCache()

	return c.JSON(rule)
}

// DeleteFilterRule deletes a filter rule
func DeleteFilterRule(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid rule ID"})
	}

	_, err = database.DB.Exec("DELETE FROM filter_rules WHERE id = ?", id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete filter rule"})
	}

	// Refresh filter cache
	filter.RefreshFilterCache()

	return c.JSON(fiber.Map{"message": "Filter rule deleted successfully"})
}

// ToggleFilterRule toggles the active status of a filter rule
func ToggleFilterRule(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid rule ID"})
	}

	// Get current status
	var isActive bool
	err = database.DB.QueryRow("SELECT is_active FROM filter_rules WHERE id = ?", id).Scan(&isActive)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Filter rule not found"})
	}

	// Toggle status
	newStatus := !isActive
	_, err = database.DB.Exec("UPDATE filter_rules SET is_active = ?, updated_at = ? WHERE id = ?", newStatus, time.Now(), id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to toggle filter rule"})
	}

	// Refresh filter cache
	filter.RefreshFilterCache()

	return c.JSON(fiber.Map{"is_active": newStatus})
}

// GetFilterLogs returns filter logs with pagination and filtering
func GetFilterLogs(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	offset := (page - 1) * limit

	// Get filter parameters
	clientIP := c.Query("client_ip")
	hostname := c.Query("hostname")
	requestPath := c.Query("request_path")
	matchType := c.Query("match_type")
	actionType := c.Query("action_type")
	statusCode := c.Query("status_code")
	filterID := c.Query("filter_id")
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	// Build WHERE clause for filters
	whereConditions := []string{}
	args := []interface{}{}

	if clientIP != "" {
		whereConditions = append(whereConditions, "fl.client_ip LIKE ?")
		args = append(args, "%"+clientIP+"%")
	}
	if hostname != "" {
		whereConditions = append(whereConditions, "fl.hostname LIKE ?")
		args = append(args, "%"+hostname+"%")
	}
	if requestPath != "" {
		whereConditions = append(whereConditions, "fl.request_path LIKE ?")
		args = append(args, "%"+requestPath+"%")
	}
	if matchType != "" {
		whereConditions = append(whereConditions, "fl.match_type = ?")
		args = append(args, matchType)
	}
	if actionType != "" {
		whereConditions = append(whereConditions, "fl.action_type = ?")
		args = append(args, actionType)
	}
	if statusCode != "" {
		whereConditions = append(whereConditions, "fl.status_code = ?")
		args = append(args, statusCode)
	}
	if filterID != "" {
		whereConditions = append(whereConditions, "fl.filter_id = ?")
		args = append(args, filterID)
	}
	if startDate != "" {
		whereConditions = append(whereConditions, "fl.timestamp >= ?")
		args = append(args, startDate)
	}
	if endDate != "" {
		whereConditions = append(whereConditions, "fl.timestamp <= ?")
		args = append(args, endDate)
	}

	whereClause := ""
	if len(whereConditions) > 0 {
		whereClause = "WHERE " + strings.Join(whereConditions, " AND ")
	}

	// Get total count with filters
	countQuery := "SELECT COUNT(*) FROM filter_logs fl " + whereClause
	var total int
	err := database.DB.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to get total count"})
	}

	// Calculate total pages
	totalPages := (total + limit - 1) / limit

	// Get logs with pagination and filters
	query := `
		SELECT 
			fl.id, fl.timestamp, fl.client_ip, fl.hostname, fl.request_path,
			fl.user_agent, fl.filter_id, fl.match_type, fl.match_value,
			fl.action_type, fl.status_code, fr.name as filter_name
		FROM 
			filter_logs fl
		LEFT JOIN 
			filter_rules fr ON fl.filter_id = fr.id
		` + whereClause + `
		ORDER BY 
			fl.timestamp DESC
		LIMIT ? OFFSET ?`

	// Add limit and offset to args
	queryArgs := append(args, limit, offset)

	rows, err := database.DB.Query(query, queryArgs...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch filter logs"})
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var log models.FilterLog
		var filterName *string
		err := rows.Scan(
			&log.ID, &log.Timestamp, &log.ClientIP, &log.Hostname,
			&log.RequestPath, &log.UserAgent, &log.FilterID,
			&log.MatchType, &log.MatchValue, &log.ActionType,
			&log.StatusCode, &filterName,
		)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to scan filter log"})
		}

		logMap := map[string]interface{}{
			"id":           log.ID,
			"timestamp":    log.Timestamp,
			"client_ip":    log.ClientIP,
			"hostname":     log.Hostname,
			"request_path": log.RequestPath,
			"user_agent":   log.UserAgent,
			"filter_id":    log.FilterID,
			"match_type":   log.MatchType,
			"match_value":  log.MatchValue,
			"action_type":  log.ActionType,
			"status_code":  log.StatusCode,
			"filter_name":  filterName,
		}
		logs = append(logs, logMap)
	}

	// Return response in format similar to stats logs
	return c.JSON(fiber.Map{
		"data": logs,
		"pagination": fiber.Map{
			"total_items":  total,
			"total_pages":  totalPages,
			"current_page": page,
			"limit":        limit,
		},
		"filters": fiber.Map{
			"client_ip":    clientIP,
			"hostname":     hostname,
			"request_path": requestPath,
			"match_type":   matchType,
			"action_type":  actionType,
			"status_code":  statusCode,
			"filter_id":    filterID,
			"start_date":   startDate,
			"end_date":     endDate,
		},
	})
}

// DeleteAllFilterLogs deletes all filter logs
func DeleteAllFilterLogs(c *fiber.Ctx) error {
	_, err := database.DB.Exec("DELETE FROM filter_logs")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete filter logs"})
	}

	return c.JSON(fiber.Map{"message": "All filter logs deleted successfully"})
}
