package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/handlers"
	"github.com/arifur/strong-reverse-proxy/middleware"
	"github.com/arifur/strong-reverse-proxy/proxy"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file
	err := godotenv.Load()
	if err != nil {
		log.Println("Warning: .env file not found, using default values")
	}

	// Create admin API server with Fiber
	app := fiber.New(fiber.Config{
		AppName:   "Strong Reverse Proxy - Admin API",
		BodyLimit: 1024 * 1024 * 100, // 10MB
	})

	// Admin server middleware
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PATCH, DELETE",
	}))

	// Initialize DB first, before creating rate limiter
	database.Initialize()
	defer database.Close()

	// Initialize buffered logger for better performance
	database.InitBufferedLogger()

	// Clean up any orphaned backends
	handlers.CleanupOrphanedBackends()

	// Initialize periodic backend cleanup
	initBackendCleanup()

	// Initialize rate limiter - no longer used in the main HTTP server,
	// but can be used in the admin API if needed
	middleware.NewRateLimiter(100, time.Minute)

	// Initialize proxy and DNS cache
	proxy.Initialize()

	// Initialize log retention (prune logs based on DNS rule settings)
	initLogRetention()

	// Initialize health checker for DNS rules with health_check_enabled
	handlers.InitHealthChecker()

	// Admin API routes
	setupAdminRoutes(app)

	// Get ports from environment variables
	adminPort := getEnv("ADMIN_PORT", "8089")
	proxyPort := getEnv("PROXY_PORT", "89")

	// Set up graceful shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	// Start the admin server on a different port
	go func() {
		log.Printf("Starting admin server on port %s", adminPort)
		if err := app.Listen(":" + adminPort); err != nil {
			log.Printf("Admin server error: %v", err)
		}
	}()

	// Start the HTTP proxy server on the standard port in a goroutine
	go func() {
		log.Printf("Starting proxy server on port %s", proxyPort)
		if err := proxy.StartProxyServer(":" + proxyPort); err != nil {
			log.Printf("Proxy server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	<-c
	log.Println("Shutting down gracefully...")

	// Flush any remaining logs
	database.FlushNow()

	// Stop the buffered logger
	database.StopBufferedLogger()

	// Close database
	database.Close()

	log.Println("Shutdown complete")
}

// getEnv gets an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func setupAdminRoutes(app *fiber.App) {
	// Admin API prefix
	adminAPI := app.Group("/admin")

	// Health check
	adminAPI.Get("/health", handlers.HealthCheck)

	// Authentication routes
	auth := adminAPI.Group("/api")
	auth.Post("/signup", handlers.Signup)
	auth.Post("/login", handlers.Login)

	// Protected routes
	api := adminAPI.Group("/api", middleware.JWTMiddleware)

	// User management
	users := api.Group("/users")
	users.Get("/", handlers.GetUsers)
	users.Post("/", handlers.CreateUser)
	users.Patch("/:id", handlers.UpdateUser)
	users.Delete("/:id", handlers.DeleteUser)

	// Configuration
	config := api.Group("/config")

	// DNS Rules
	dnsRules := config.Group("/dns_rules")
	dnsRules.Get("/", handlers.GetDNSRules)
	dnsRules.Post("/", handlers.CreateDNSRule)
	dnsRules.Patch("/:id", handlers.UpdateDNSRule)
	dnsRules.Delete("/:id", handlers.DeleteDNSRule)

	// Backends
	backends := config.Group("/backends")
	backends.Get("/", handlers.GetBackends)
	backends.Post("/", handlers.CreateBackend)
	backends.Patch("/:id", handlers.UpdateBackend)
	backends.Delete("/:id", handlers.DeleteBackend)

	// Metrics
	adminAPI.Get("/metrics", handlers.GetMetrics)
	adminAPI.Get("/metrics/logs", handlers.GetRecentLogs)
	adminAPI.Get("/metrics/system", handlers.GetSystemResources)
	adminAPI.Delete("/metrics/logs/delete-all", handlers.DeleteAllLogs)

	// Database operations
	dbOps := adminAPI.Group("/database")
	dbOps.Get("/backups", handlers.GetBackups)
	dbOps.Post("/backup", handlers.BackupDatabase)
	dbOps.Post("/restore", handlers.RestoreDatabase)
	dbOps.Post("/reset", handlers.ResetDatabase)
	dbOps.Delete("/backups", handlers.DeleteBackup)
	dbOps.Get("/download", handlers.DownloadBackup)
	dbOps.Post("/upload", handlers.UploadBackup)

	// Alerts
	alerts := api.Group("/alerts")
	alerts.Get("/", handlers.GetAlerts)
	alerts.Get("/dns-rules", handlers.GetDNSRulesForAlerts)
	alerts.Post("/", handlers.CreateAlert)
	alerts.Patch("/:id", handlers.UpdateAlert)
	alerts.Delete("/:id", handlers.DeleteAlert)
}

// initLogRetention initializes the log retention mechanism
func initLogRetention() {
	go func() {
		ticker := time.NewTicker(24 * time.Hour) // Run once a day
		defer ticker.Stop()

		// Run once at startup
		pruneOldLogs()

		for range ticker.C {
			pruneOldLogs()
		}
	}()
}

// pruneOldLogs removes logs based on DNS rule specific retention settings
func pruneOldLogs() {
	// First, get all DNS rules and their log retention periods
	rows, err := database.DB.Query(`
		SELECT 
			hostname, 
			log_retention_days 
		FROM 
			dns_rules
	`)
	if err != nil {
		log.Printf("Error fetching DNS rules for log pruning: %v", err)
		return
	}
	defer rows.Close()

	// Track total rows pruned
	var totalRowsPruned int64

	// Process each DNS rule
	for rows.Next() {
		var hostname string
		var retentionDays int
		if err := rows.Scan(&hostname, &retentionDays); err != nil {
			log.Printf("Error scanning DNS rule: %v", err)
			continue
		}

		// Use default retention period if not set
		if retentionDays <= 0 {
			retentionDays = 30 // Default 30 days
		}

		// Calculate cutoff date for this hostname
		cutoffDate := time.Now().AddDate(0, 0, -retentionDays).Format("2006-01-02 15:04:05")

		// Delete logs for this hostname older than the cutoff date
		result, err := database.DB.Exec(
			"DELETE FROM request_logs WHERE hostname = ? AND timestamp < ?",
			hostname, cutoffDate,
		)
		if err != nil {
			log.Printf("Error pruning logs for hostname %s: %v", hostname, err)
			continue
		}

		rowsAffected, _ := result.RowsAffected()
		totalRowsPruned += rowsAffected

		if rowsAffected > 0 {
			log.Printf("Pruned %d log entries for hostname %s (retention: %d days)", rowsAffected, hostname, retentionDays)
		}
	}

	// Also prune logs with no hostname (fallback) using default 30 days
	defaultCutoffDate := time.Now().AddDate(0, 0, -30).Format("2006-01-02 15:04:05")
	result, err := database.DB.Exec(
		"DELETE FROM request_logs WHERE (hostname IS NULL OR hostname = '') AND timestamp < ?",
		defaultCutoffDate,
	)
	if err != nil {
		log.Printf("Error pruning default logs: %v", err)
	} else {
		rowsAffected, _ := result.RowsAffected()
		totalRowsPruned += rowsAffected
		if rowsAffected > 0 {
			log.Printf("Pruned %d default log entries (retention: 30 days)", rowsAffected)
		}
	}

	log.Printf("Log pruning completed: %d total entries removed", totalRowsPruned)
}

// initBackendCleanup initializes the backend cleanup mechanism
func initBackendCleanup() {
	go func() {
		ticker := time.NewTicker(24 * time.Hour) // Run once a day
		defer ticker.Stop()

		// Run once at startup
		cleanupOrphanedBackends()

		for range ticker.C {
			cleanupOrphanedBackends()
		}
	}()
}

// cleanupOrphanedBackends removes orphaned backends
func cleanupOrphanedBackends() {
	handlers.CleanupOrphanedBackends()
}
