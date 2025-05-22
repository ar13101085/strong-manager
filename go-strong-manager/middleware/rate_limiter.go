package middleware

import (
	"log"
	"sync"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/gofiber/fiber/v2"
)

// Package-level variable to store the global rate limiter instance
var globalRateLimiter *RateLimiter

// DNSRateLimitConfig stores rate limit settings for a specific hostname
type DNSRateLimitConfig struct {
	Hostname    string
	Enabled     bool
	Quota       int
	PeriodSecs  int
	LastUpdated time.Time
}

// RateLimiter defines the configuration for the rate limiter middleware
type RateLimiter struct {
	// Maps IP addresses to their request counts
	ipMap     map[string]*IPLimit
	ipMapLock sync.RWMutex

	// Maps hostnames to their rate limit configuration
	dnsConfigMap     map[string]*DNSRateLimitConfig
	dnsConfigMapLock sync.RWMutex

	// Default values
	defaultMaxRequests int
	defaultInterval    time.Duration
}

// IPLimit represents the limit for a specific IP
type IPLimit struct {
	count      int                   // Current request count
	lastSeen   time.Time             // Last request time
	hostCounts map[string]*HostCount // Per-hostname counts
}

// HostCount tracks requests for a specific host
type HostCount struct {
	count    int
	lastSeen time.Time
}

// NewRateLimiter creates a new rate limiter middleware
func NewRateLimiter(defaultMaxRequests int, defaultInterval time.Duration) *RateLimiter {
	// Create new rate limiter instance
	rl := &RateLimiter{
		ipMap:              make(map[string]*IPLimit),
		dnsConfigMap:       make(map[string]*DNSRateLimitConfig),
		defaultMaxRequests: defaultMaxRequests,
		defaultInterval:    defaultInterval,
	}

	// Start cleanup routine
	go rl.cleanup()

	// Start configuration refresh routine
	go rl.refreshDNSConfigs()

	// Store the instance in the global variable
	globalRateLimiter = rl

	return rl
}

// refreshDNSConfigs periodically refreshes DNS rate limit configurations from the database
func (rl *RateLimiter) refreshDNSConfigs() {
	// Initial load
	rl.loadDNSConfigs()

	ticker := time.NewTicker(1 * time.Minute) // Refresh every minute
	defer ticker.Stop()

	for range ticker.C {
		rl.loadDNSConfigs()
	}
}

// loadDNSConfigs loads DNS rate limit configurations from the database
func (rl *RateLimiter) loadDNSConfigs() {
	rows, err := database.DB.Query(`
		SELECT 
			hostname, 
			rate_limit_enabled, 
			rate_limit_quota, 
			rate_limit_period 
		FROM 
			dns_rules
	`)
	if err != nil {
		log.Printf("Error loading DNS rate limit configs: %v", err)
		return
	}
	defer rows.Close()

	newConfigs := make(map[string]*DNSRateLimitConfig)

	for rows.Next() {
		var config DNSRateLimitConfig
		if err := rows.Scan(&config.Hostname, &config.Enabled, &config.Quota, &config.PeriodSecs); err != nil {
			log.Printf("Error scanning DNS rate limit config: %v", err)
			continue
		}

		// Set reasonable defaults if values are invalid
		if config.Quota <= 0 {
			config.Quota = rl.defaultMaxRequests
		}
		if config.PeriodSecs <= 0 {
			config.PeriodSecs = int(rl.defaultInterval.Seconds())
		}

		config.LastUpdated = time.Now()
		newConfigs[config.Hostname] = &config
	}

	// Update the DNS config map
	rl.dnsConfigMapLock.Lock()
	rl.dnsConfigMap = newConfigs
	rl.dnsConfigMapLock.Unlock()

	log.Printf("Loaded %d DNS rate limit configurations", len(newConfigs))
}

// RefreshRateLimitConfigs immediately refreshes the rate limit configurations
// This can be called from other packages after DNS rules are modified
func (rl *RateLimiter) RefreshRateLimitConfigs() {
	log.Println("Refreshing rate limit configurations on demand")
	rl.loadDNSConfigs()
}

// RefreshRateLimiterConfigs immediately refreshes the rate limit configurations from anywhere
// This is a package-level function that can be called from other packages
func RefreshRateLimiterConfigs() {
	if globalRateLimiter != nil {
		log.Println("Refreshing global rate limiter configurations")
		globalRateLimiter.RefreshRateLimitConfigs()
	} else {
		log.Println("Warning: Global rate limiter not initialized yet")
	}
}

// RateLimiterMiddleware limits the number of requests from an IP address based on DNS rules
func (rl *RateLimiter) RateLimiterMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Skip rate limiting for admin API routes
		if c.Path() != "/" && len(c.Path()) >= 6 && c.Path()[:6] == "/admin" {
			return c.Next()
		}

		// Get client IP
		ip := c.IP()

		// Get the requested hostname
		hostname := c.Hostname()

		// Check if there is a DNS-specific rate limit configuration
		rl.dnsConfigMapLock.RLock()
		config, exists := rl.dnsConfigMap[hostname]
		rl.dnsConfigMapLock.RUnlock()

		// Use default values if no specific config exists or rate limiting is disabled
		maxRequests := rl.defaultMaxRequests
		interval := rl.defaultInterval

		// If a config exists and rate limiting is enabled, use its values
		if exists && config.Enabled {
			maxRequests = config.Quota
			interval = time.Duration(config.PeriodSecs) * time.Second
		} else if exists && !config.Enabled {
			// If there's a config but rate limiting is disabled, skip limiting
			return c.Next()
		}

		// Check if IP is rate limited
		rl.ipMapLock.Lock()
		limit, exists := rl.ipMap[ip]

		// If IP not in map, create new limit
		now := time.Now()
		if !exists {
			limit = &IPLimit{
				count:      1,
				lastSeen:   now,
				hostCounts: make(map[string]*HostCount),
			}

			// Initialize host count
			limit.hostCounts[hostname] = &HostCount{
				count:    1,
				lastSeen: now,
			}

			rl.ipMap[ip] = limit
			rl.ipMapLock.Unlock()
			return c.Next()
		}

		// Update the global count for this IP
		limit.count++
		limit.lastSeen = now

		// Check or create host-specific count
		hostCount, hostExists := limit.hostCounts[hostname]
		if !hostExists {
			hostCount = &HostCount{
				count:    1,
				lastSeen: now,
			}
			limit.hostCounts[hostname] = hostCount
			rl.ipMapLock.Unlock()
			return c.Next()
		}

		// Check if we should reset the counter (new interval)
		if now.Sub(hostCount.lastSeen) > interval {
			hostCount.count = 1
			hostCount.lastSeen = now
			rl.ipMapLock.Unlock()
			return c.Next()
		}

		// Increment host-specific counter and check if limit exceeded
		hostCount.count++
		hostCount.lastSeen = now

		// If limit exceeded, return error
		if hostCount.count > maxRequests {
			rl.ipMapLock.Unlock()
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Rate limit exceeded for this hostname. Please try again later.",
			})
		}

		rl.ipMapLock.Unlock()
		return c.Next()
	}
}

// cleanup periodically removes old IP records
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		rl.ipMapLock.Lock()
		now := time.Now()

		// Remove IPs that haven't been seen in a while
		for ip, limit := range rl.ipMap {
			if now.Sub(limit.lastSeen) > 3*rl.defaultInterval {
				delete(rl.ipMap, ip)
				continue
			}

			// Also clean up per-host counters
			for hostname, hostCount := range limit.hostCounts {
				// Get the interval for this hostname
				interval := rl.defaultInterval

				rl.dnsConfigMapLock.RLock()
				if config, exists := rl.dnsConfigMap[hostname]; exists && config.Enabled {
					interval = time.Duration(config.PeriodSecs) * time.Second
				}
				rl.dnsConfigMapLock.RUnlock()

				// Remove host counts that haven't been seen in a while
				if now.Sub(hostCount.lastSeen) > 3*interval {
					delete(limit.hostCounts, hostname)
				}
			}
		}

		rl.ipMapLock.Unlock()
	}
}
