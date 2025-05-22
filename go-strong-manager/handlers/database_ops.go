package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/middleware"
	"github.com/arifur/strong-reverse-proxy/proxy"
	"github.com/gofiber/fiber/v2"
)

// BackupDatabase creates a backup of the SQLite database
func BackupDatabase(c *fiber.Ctx) error {
	// Create backups directory if it doesn't exist
	backupDir := "./backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create backup directory: %v", err),
		})
	}

	// Generate backup filename with timestamp
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	backupPath := filepath.Join(backupDir, fmt.Sprintf("backup_%s.db", timestamp))

	// Copy the database file
	err := copyFile("./strong-proxy.db", backupPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create backup: %v", err),
		})
	}

	// Create a metadata file with timestamp and version info
	metadataPath := backupPath + ".json"
	metadata := map[string]interface{}{
		"timestamp":  time.Now().Format(time.RFC3339),
		"db_version": "1.0", // Update with your actual version
		"filename":   filepath.Base(backupPath),
	}

	metadataJSON, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create backup metadata: %v", err),
		})
	}

	if err := ioutil.WriteFile(metadataPath, metadataJSON, 0644); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to save backup metadata: %v", err),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Database backup created successfully",
		"backup": fiber.Map{
			"filename": filepath.Base(backupPath),
			"path":     backupPath,
			"size":     getFileSize(backupPath),
			"created":  metadata["timestamp"],
		},
	})
}

// RestoreDatabase restores the database from a backup
func RestoreDatabase(c *fiber.Ctx) error {
	// Get backup filename from request
	var req struct {
		Filename string `json:"filename"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request format",
		})
	}

	if req.Filename == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Backup filename is required",
		})
	}

	// Validate the filename to prevent directory traversal
	if filepath.Base(req.Filename) != req.Filename {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid backup filename",
		})
	}

	// Check if backup file exists
	backupPath := filepath.Join("./backups", req.Filename)
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Backup file not found",
		})
	}

	// First close the database connection
	database.Close()

	// Make a backup of the current database before restoring
	currentBackupPath := "./strong-proxy.db.bak"
	err := copyFile("./strong-proxy.db", currentBackupPath)
	if err != nil {
		// Reopen the database before returning
		database.Initialize()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to backup current database: %v", err),
		})
	}

	// Copy the backup file to the main database file
	err = copyFile(backupPath, "./strong-proxy.db")
	if err != nil {
		// Try to restore the original
		copyFile(currentBackupPath, "./strong-proxy.db")

		// Reopen the database before returning
		database.Initialize()

		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to restore database: %v", err),
		})
	}

	// Reinitialize the database connection
	database.Initialize()

	// Refresh caches and configuration
	proxy.RefreshDNSRulesCache()
	middleware.RefreshRateLimiterConfigs()

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Database restored successfully",
	})
}

// ResetDatabase resets the database to default state
func ResetDatabase(c *fiber.Ctx) error {
	// First close the database connection
	database.Close()

	// Make a backup of the current database before resetting
	backupDir := "./backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		// Reopen the database before returning
		database.Initialize()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create backup directory: %v", err),
		})
	}

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	backupPath := filepath.Join(backupDir, fmt.Sprintf("before_reset_%s.db", timestamp))

	// Backup current database
	err := copyFile("./strong-proxy.db", backupPath)
	if err != nil {
		// Reopen the database before returning
		database.Initialize()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to backup current database: %v", err),
		})
	}

	// Delete the current database file
	if err := os.Remove("./strong-proxy.db"); err != nil && !os.IsNotExist(err) {
		// Reopen the database before returning
		database.Initialize()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to delete current database: %v", err),
		})
	}

	// Reinitialize the database - this will create a new empty database with the schema
	database.Initialize()

	// Refresh caches and configuration
	proxy.RefreshDNSRulesCache()
	middleware.RefreshRateLimiterConfigs()

	return c.JSON(fiber.Map{
		"success":     true,
		"message":     "Database reset successfully. A backup of the previous database was created.",
		"backup_path": backupPath,
	})
}

// GetBackups returns a list of available database backups
func GetBackups(c *fiber.Ctx) error {
	backupDir := "./backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to access backup directory: %v", err),
		})
	}

	// Read backup directory
	files, err := ioutil.ReadDir(backupDir)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to read backups: %v", err),
		})
	}

	// Filter only database files
	var backups []map[string]interface{}
	for _, file := range files {
		if filepath.Ext(file.Name()) == ".db" {
			// Check for metadata file
			metadataPath := filepath.Join(backupDir, file.Name()+".json")
			metadata := map[string]interface{}{
				"filename": file.Name(),
				"size":     file.Size(),
				"created":  file.ModTime().Format(time.RFC3339),
			}

			// If metadata file exists, read it
			if metadataData, err := ioutil.ReadFile(metadataPath); err == nil {
				var metadataMap map[string]interface{}
				if err := json.Unmarshal(metadataData, &metadataMap); err == nil {
					for k, v := range metadataMap {
						metadata[k] = v
					}
				}
			}

			backups = append(backups, metadata)
		}
	}

	return c.JSON(fiber.Map{
		"backups": backups,
	})
}

// DeleteBackup deletes a database backup
func DeleteBackup(c *fiber.Ctx) error {
	// Get backup filename from request
	var req struct {
		Filename string `json:"filename"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request format",
		})
	}

	if req.Filename == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Backup filename is required",
		})
	}

	// Validate the filename to prevent directory traversal
	if filepath.Base(req.Filename) != req.Filename {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid backup filename",
		})
	}

	// Check if backup file exists
	backupPath := filepath.Join("./backups", req.Filename)
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Backup file not found",
		})
	}

	// Delete the backup file
	if err := os.Remove(backupPath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to delete backup: %v", err),
		})
	}

	// Also delete metadata file if it exists
	metadataPath := backupPath + ".json"
	if _, err := os.Stat(metadataPath); err == nil {
		os.Remove(metadataPath) // Ignore errors for metadata deletion
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup deleted successfully",
	})
}

// DownloadBackup allows downloading a database backup file
func DownloadBackup(c *fiber.Ctx) error {
	// Get backup filename from query parameter
	filename := c.Query("filename")
	if filename == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Backup filename is required",
		})
	}

	// Validate the filename to prevent directory traversal
	if filepath.Base(filename) != filename {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid backup filename",
		})
	}

	// Check if backup file exists
	backupPath := filepath.Join("./backups", filename)
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Backup file not found",
		})
	}

	// Set appropriate headers
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Set("Content-Type", "application/octet-stream")

	// Return the file
	return c.SendFile(backupPath)
}

// UploadBackup handles uploading a database backup file
func UploadBackup(c *fiber.Ctx) error {
	// Get the file from form
	file, err := c.FormFile("backup")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to get uploaded file: %v", err),
		})
	}

	// Validate file extension
	if filepath.Ext(file.Filename) != ".db" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid file type. Only .db files are allowed.",
		})
	}

	// Create backups directory if it doesn't exist
	backupDir := "./backups"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create backup directory: %v", err),
		})
	}

	// Generate a unique filename with timestamp
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	filename := fmt.Sprintf("uploaded_%s.db", timestamp)
	savePath := filepath.Join(backupDir, filename)

	// Save the file
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to save uploaded file: %v", err),
		})
	}

	// Create a metadata file with timestamp and version info
	metadataPath := savePath + ".json"
	metadata := map[string]interface{}{
		"timestamp":         time.Now().Format(time.RFC3339),
		"db_version":        "1.0", // Default version
		"filename":          filename,
		"original_filename": file.Filename,
		"is_uploaded":       true,
	}

	metadataJSON, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create backup metadata: %v", err),
		})
	}

	if err := ioutil.WriteFile(metadataPath, metadataJSON, 0644); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to save backup metadata: %v", err),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup file uploaded successfully",
		"backup": fiber.Map{
			"filename": filename,
			"path":     savePath,
			"size":     file.Size,
			"created":  metadata["timestamp"],
		},
	})
}

// Helper functions
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	if err != nil {
		return err
	}
	return out.Sync()
}

func getFileSize(path string) int64 {
	fileInfo, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return fileInfo.Size()
}
