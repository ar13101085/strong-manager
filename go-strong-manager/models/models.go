package models

import "time"

// User represents a user in the system
type User struct {
	ID           int    `json:"id"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	Role         string `json:"role"`
}

// LoginRequest represents the login request payload
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse represents the login response payload
type LoginResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken"`
}

// Backend represents a backend server
type Backend struct {
	ID       int     `json:"id"`
	URL      string  `json:"url"`
	Weight   int     `json:"weight"`
	IsActive bool    `json:"isActive"`
	Ratio    float64 `json:"-"` // For weighted distribution calculation
}

// DNSRule represents a DNS rule for proxy routing
type DNSRule struct {
	ID                int       `json:"id"`
	Hostname          string    `json:"hostname"`
	TargetBackendURLs []Backend `json:"target_backend_urls"`
	// Rate limiting settings - per-IP quotas
	RateLimitEnabled bool `json:"rate_limit_enabled"`
	RateLimitQuota   int  `json:"rate_limit_quota"`  // Requests per interval
	RateLimitPeriod  int  `json:"rate_limit_period"` // Period in seconds
	// Log retention settings
	LogRetentionDays int `json:"log_retention_days"` // Number of days to keep logs, 0 = use default
	// Health check settings
	HealthCheckEnabled bool `json:"health_check_enabled"` // Whether to enable health checks
}

// RequestLog represents a log entry for a proxied request
type RequestLog struct {
	ID          int       `json:"id"`
	Timestamp   time.Time `json:"timestamp"`
	ClientIP    string    `json:"client_ip"`
	Hostname    string    `json:"hostname"`
	RequestPath string    `json:"request_path"`
	BackendID   int       `json:"backend_id"`
	LatencyMS   int       `json:"latency_ms"`
	StatusCode  int       `json:"status_code"`
	IsSuccess   bool      `json:"is_success"`
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status string `json:"status"`
	Uptime int64  `json:"uptime"`
	DB     string `json:"db"`
}

// AlertType represents the type of alert
type AlertType string

const (
	AlertTypeEmail   AlertType = "email"
	AlertTypeWebhook AlertType = "webhook"
)

// Alert represents an alert configuration
type Alert struct {
	ID          int       `json:"id"`
	DNSRuleID   int       `json:"dns_rule_id"` // ID of DNS rule this alert is associated with (0 = global)
	Type        AlertType `json:"type"`
	Destination string    `json:"destination"` // Email address or webhook URL
	Threshold   int       `json:"threshold"`   // Threshold to trigger alert (e.g., error count)
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	// DNS rule info for UI (only populated when needed)
	Hostname string `json:"hostname,omitempty"`
}

// AlertEvent represents an alert event
type AlertEvent struct {
	ID        int       `json:"id"`
	AlertID   int       `json:"alert_id"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Sent      bool      `json:"sent"`
}
