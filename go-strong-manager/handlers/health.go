package handlers

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/gofiber/fiber/v2"
)

var startTime = time.Now()

// Health status map stores health status for each backend
var (
	healthStatus     = make(map[string]bool)
	healthStatusLock sync.RWMutex
)

// HealthCheck handles health check requests
func HealthCheck(c *fiber.Ctx) error {
	// Check database connection
	dbStatus := "connected"
	if err := database.DB.Ping(); err != nil {
		dbStatus = "disconnected"
	}

	// Calculate uptime in seconds
	uptime := time.Since(startTime).Seconds()

	// Get health status for all backends
	healthStatusLock.RLock()
	status := make(map[string]bool)
	for backend, isHealthy := range healthStatus {
		status[backend] = isHealthy
	}
	healthStatusLock.RUnlock()

	return c.JSON(fiber.Map{
		"status":          "ok",
		"uptime":          int64(uptime),
		"db":              dbStatus,
		"backends_health": status,
	})
}

// InitHealthChecker starts the health check system
func InitHealthChecker() {
	go func() {
		for {
			checkHealthForEnabledDNSRules()
			time.Sleep(30 * time.Second) // Check every 30 seconds
		}
	}()
}

// checkHealthForEnabledDNSRules checks health for all backends in DNS rules with health_check_enabled=true
func checkHealthForEnabledDNSRules() {
	// First, get all backends for DNS rules with health_check_enabled=true
	rows, err := database.DB.Query(`
		SELECT 
			d.id, 
			d.hostname,
			b.url
		FROM 
			dns_rules d
		JOIN 
			dns_backend_map m ON d.id = m.dns_rule_id
		JOIN 
			backends b ON m.backend_id = b.id
		WHERE 
			d.health_check_enabled = 1 AND b.isActive = 1
	`)

	if err != nil {
		log.Printf("Error querying DNS rules for health check: %v", err)
		return
	}
	defer rows.Close()

	// Get a list of all URLs that need health checking
	var urlsToCheck []string
	var urlMap = make(map[string]bool)

	for rows.Next() {
		var dnsID int
		var hostname, backendURL string

		if err := rows.Scan(&dnsID, &hostname, &backendURL); err != nil {
			log.Printf("Error scanning DNS rule: %v", err)
			continue
		}

		urlsToCheck = append(urlsToCheck, backendURL)
		urlMap[backendURL] = true
	}

	// Clear health status entries for URLs that don't need health checking anymore
	// (their DNS rules have health_check_enabled=false or they're no longer active)
	healthStatusLock.Lock()
	for url := range healthStatus {
		if !urlMap[url] {
			// Remove status for URLs that don't need monitoring
			delete(healthStatus, url)
		}
	}
	healthStatusLock.Unlock()

	// Now check health for all backends that need checking
	var wg sync.WaitGroup
	for _, url := range urlsToCheck {
		wg.Add(1)
		go func(url string) {
			defer wg.Done()
			isHealthy := checkBackendHealth(url)

			healthStatusLock.Lock()
			healthStatus[url] = isHealthy
			healthStatusLock.Unlock()

			log.Printf("Health check for %s: %v", url, isHealthy)
		}(url)
	}

	wg.Wait()
}

// checkBackendHealth performs a health check on a backend URL
func checkBackendHealth(url string) bool {
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode >= 200 && resp.StatusCode < 500
}
