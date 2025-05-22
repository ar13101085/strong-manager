package handlers

import (
	"database/sql"
	"strconv"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/models"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
)

// GetUsers returns all users
func GetUsers(c *fiber.Ctx) error {
	// Query all users
	rows, err := database.DB.Query("SELECT id, email, role FROM users")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}
	defer rows.Close()

	// Collect users
	var users []fiber.Map
	for rows.Next() {
		var user models.User
		if err := rows.Scan(&user.ID, &user.Email, &user.Role); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Error scanning user",
			})
		}

		users = append(users, fiber.Map{
			"id":    user.ID,
			"email": user.Email,
			"role":  user.Role,
		})
	}

	return c.JSON(users)
}

// CreateUser creates a new user
func CreateUser(c *fiber.Ctx) error {
	// Parse request body
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate inputs
	if req.Email == "" || req.Password == "" || req.Role == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Email, password, and role are required",
		})
	}

	// Validate role
	if req.Role != "admin" && req.Role != "operator" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Role must be 'admin' or 'operator'",
		})
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to hash password",
		})
	}

	// Insert user
	result, err := database.DB.Exec(
		"INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
		req.Email, string(hashedPassword), req.Role,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create user",
		})
	}

	// Get the inserted user ID
	id, _ := result.LastInsertId()

	// Return user data
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":    id,
		"email": req.Email,
		"role":  req.Role,
	})
}

// UpdateUser updates a user
func UpdateUser(c *fiber.Ctx) error {
	// Get user ID from URL
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}

	// Parse request body
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Check if user exists
	var exists bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)", id).Scan(&exists)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}

	if !exists {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	// Build update query
	query := "UPDATE users SET"
	args := []interface{}{}
	needsComma := false

	if req.Email != "" {
		query += " email = ?"
		args = append(args, req.Email)
		needsComma = true
	}

	if req.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to hash password",
			})
		}

		if needsComma {
			query += ","
		}
		query += " password_hash = ?"
		args = append(args, string(hashedPassword))
		needsComma = true
	}

	if req.Role != "" {
		// Validate role
		if req.Role != "admin" && req.Role != "operator" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Role must be 'admin' or 'operator'",
			})
		}

		if needsComma {
			query += ","
		}
		query += " role = ?"
		args = append(args, req.Role)
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
	_, err = database.DB.Exec(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update user",
		})
	}

	// Get updated user
	var user models.User
	err = database.DB.QueryRow("SELECT id, email, role FROM users WHERE id = ?", id).Scan(
		&user.ID, &user.Email, &user.Role,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "User not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
		})
	}

	// Return updated user
	return c.JSON(fiber.Map{
		"id":    user.ID,
		"email": user.Email,
		"role":  user.Role,
	})
}

// DeleteUser deletes a user
func DeleteUser(c *fiber.Ctx) error {
	// Get user ID from URL
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}

	// Delete user
	result, err := database.DB.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete user",
		})
	}

	// Check if any rows were affected
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	// Return success
	return c.SendStatus(fiber.StatusNoContent)
}
