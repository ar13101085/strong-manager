package handlers

import (
	"database/sql"
	"strconv"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/models"
	"github.com/gofiber/fiber/v2"
)

// GetBackends returns all backends
func GetBackends(c *fiber.Ctx) error {
	// Query all backends
	rows, err := database.DB.Query("SELECT id, url, weight, isActive FROM backends")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}
	defer rows.Close()

	// Collect backends
	var backends []models.Backend
	for rows.Next() {
		var backend models.Backend
		if err := rows.Scan(&backend.ID, &backend.URL, &backend.Weight, &backend.IsActive); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Error scanning backend",
			})
		}
		backends = append(backends, backend)
	}

	return c.JSON(backends)
}

// CreateBackend creates a new backend
func CreateBackend(c *fiber.Ctx) error {
	// Parse request body
	var backend models.Backend
	if err := c.BodyParser(&backend); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate inputs
	if backend.URL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "URL is required",
		})
	}

	// Insert backend
	result, err := database.DB.Exec(
		"INSERT INTO backends (url, weight, isActive) VALUES (?, ?, ?)",
		backend.URL, backend.Weight, backend.IsActive,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create backend",
		})
	}

	// Get the inserted backend ID
	id, _ := result.LastInsertId()
	backend.ID = int(id)

	// Return backend data
	return c.Status(fiber.StatusCreated).JSON(backend)
}

// UpdateBackend updates a backend
func UpdateBackend(c *fiber.Ctx) error {
	// Get backend ID from URL
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid backend ID",
		})
	}

	// Parse request body
	var req models.Backend
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Build update query
	query := "UPDATE backends SET"
	args := []interface{}{}
	needsComma := false

	if req.URL != "" {
		query += " url = ?"
		args = append(args, req.URL)
		needsComma = true
	}

	if req.Weight > 0 {
		if needsComma {
			query += ","
		}
		query += " weight = ?"
		args = append(args, req.Weight)
		needsComma = true
	}

	// IsActive is a boolean, so we need to check if it's explicitly provided
	if c.Body() != nil && c.Body()[0] != 0 {
		if needsComma {
			query += ","
		}
		query += " isActive = ?"
		args = append(args, req.IsActive)
	}

	// If no fields to update
	if len(args) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "No fields to update",
		})
	}

	// Add WHERE clause
	query += " WHERE id = ?"
	args = append(args, id)

	// Execute update
	result, err := database.DB.Exec(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update backend",
		})
	}

	// Check if any rows were affected
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Backend not found",
		})
	}

	// Get updated backend
	var backend models.Backend
	err = database.DB.QueryRow(
		"SELECT id, url, weight, isActive FROM backends WHERE id = ?", id,
	).Scan(&backend.ID, &backend.URL, &backend.Weight, &backend.IsActive)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Backend not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}

	// Return updated backend
	return c.JSON(backend)
}

// DeleteBackend deletes a backend
func DeleteBackend(c *fiber.Ctx) error {
	// Get backend ID from URL
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid backend ID",
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

	// Delete mappings first
	_, err = tx.Exec("DELETE FROM dns_backend_map WHERE backend_id = ?", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete backend mappings",
		})
	}

	// Delete backend
	result, err := tx.Exec("DELETE FROM backends WHERE id = ?", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete backend",
		})
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
			"error": "Backend not found",
		})
	}

	// Return success
	return c.SendStatus(fiber.StatusNoContent)
}
