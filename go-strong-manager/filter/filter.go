package filter

import (
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/models"
)

var (
	// Cache for active filter rules
	filterRuleCache     []models.FilterRule
	filterRuleCacheLock sync.RWMutex
	cacheLastUpdated    time.Time
)

// Initialize sets up the filter system
func Initialize() {
	refreshFilterCache()
	log.Println("Filter system initialized")
}

// RefreshFilterCache refreshes the filter rules cache
func RefreshFilterCache() {
	refreshFilterCache()
}

// refreshFilterCache loads active filter rules from database into cache
func refreshFilterCache() {
	rows, err := database.DB.Query(`
		SELECT 
			id, name, match_type, match_value, action_type, action_value, 
			status_code, is_active, priority, created_at, updated_at
		FROM 
			filter_rules 
		WHERE 
			is_active = 1 
		ORDER BY 
			priority DESC, id ASC
	`)
	if err != nil {
		log.Printf("Error refreshing filter cache: %v", err)
		return
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
			log.Printf("Error scanning filter rule: %v", err)
			continue
		}
		rules = append(rules, rule)
	}

	filterRuleCacheLock.Lock()
	filterRuleCache = rules
	cacheLastUpdated = time.Now()
	filterRuleCacheLock.Unlock()

	log.Printf("Filter cache refreshed with %d active rules", len(rules))
}

// FilterRequest checks if a request should be filtered and returns the appropriate response
func FilterRequest(r *http.Request) (*FilterResult, error) {
	filterRuleCacheLock.RLock()
	rules := make([]models.FilterRule, len(filterRuleCache))
	copy(rules, filterRuleCache)
	filterRuleCacheLock.RUnlock()

	clientIP := getClientIP(r)
	hostname := r.Host
	requestPath := r.URL.Path
	userAgent := r.Header.Get("User-Agent")

	// Check each rule in priority order
	for _, rule := range rules {
		if matchesRule(rule, clientIP, hostname, requestPath) {
			// Log the filtered request
			go logFilteredRequest(clientIP, hostname, requestPath, userAgent, rule)

			return &FilterResult{
				Filtered:    true,
				Rule:        rule,
				StatusCode:  getStatusCodeForAction(rule),
				Response:    getResponseForAction(rule),
				RedirectURL: getRedirectURLForAction(rule),
			}, nil
		}
	}

	return &FilterResult{Filtered: false}, nil
}

// FilterResult represents the result of filtering a request
type FilterResult struct {
	Filtered    bool
	Rule        models.FilterRule
	StatusCode  int
	Response    string
	RedirectURL string
}

// matchesRule checks if a request matches a filter rule
func matchesRule(rule models.FilterRule, clientIP, hostname, requestPath string) bool {
	switch rule.MatchType {
	case models.FilterMatchTypeIP:
		return matchesIP(rule.MatchValue, clientIP)
	case models.FilterMatchTypePath:
		return matchesPath(rule.MatchValue, requestPath)
	case models.FilterMatchTypeDNS:
		return matchesDNS(rule.MatchValue, hostname)
	default:
		return false
	}
}

// matchesIP checks if client IP matches the rule pattern
func matchesIP(pattern, clientIP string) bool {
	// Support CIDR notation
	if strings.Contains(pattern, "/") {
		_, ipNet, err := net.ParseCIDR(pattern)
		if err != nil {
			log.Printf("Invalid CIDR pattern: %s", pattern)
			return false
		}
		ip := net.ParseIP(clientIP)
		if ip == nil {
			return false
		}
		return ipNet.Contains(ip)
	}

	// Support wildcard patterns
	if strings.Contains(pattern, "*") {
		return matchesWildcard(pattern, clientIP)
	}

	// Exact match
	return strings.Contains(clientIP, pattern)
}

// matchesPath checks if request path matches the rule pattern
func matchesPath(pattern, requestPath string) bool {
	// Support wildcard patterns
	if strings.Contains(pattern, "*") {
		return matchesWildcard(pattern, requestPath)
	}

	// Support prefix matching
	if strings.HasSuffix(pattern, "/") {
		return strings.HasPrefix(requestPath, pattern)
	}

	// Exact match
	return strings.Contains(requestPath, pattern)
}

// matchesDNS checks if hostname matches the rule pattern
func matchesDNS(pattern, hostname string) bool {
	// Support wildcard patterns
	if strings.Contains(pattern, "*") {
		return matchesWildcard(pattern, hostname)
	}

	// Exact match
	return strings.Contains(hostname, pattern)
}

// matchesWildcard performs wildcard matching
func matchesWildcard(pattern, text string) bool {
	// Simple wildcard implementation
	// Convert pattern to regex-like matching
	if pattern == "*" {
		return true
	}

	if strings.HasPrefix(pattern, "*") && strings.HasSuffix(pattern, "*") {
		// *substring*
		substring := pattern[1 : len(pattern)-1]
		return strings.Contains(text, substring)
	}

	if strings.HasPrefix(pattern, "*") {
		// *suffix
		suffix := pattern[1:]
		return strings.HasSuffix(text, suffix)
	}

	if strings.HasSuffix(pattern, "*") {
		// prefix*
		prefix := pattern[:len(pattern)-1]
		return strings.HasPrefix(text, prefix)
	}

	return pattern == text
}

// getStatusCodeForAction returns the appropriate status code for an action
func getStatusCodeForAction(rule models.FilterRule) int {
	switch rule.ActionType {
	case models.FilterActionRedirect:
		return http.StatusFound // 302
	case models.FilterActionBadRequest:
		return http.StatusBadRequest // 400
	case models.FilterActionTooMany:
		return http.StatusTooManyRequests // 429
	case models.FilterActionCustom:
		if rule.StatusCode > 0 {
			return rule.StatusCode
		}
		return http.StatusForbidden // 403
	default:
		return http.StatusForbidden // 403
	}
}

// getResponseForAction returns the appropriate response text for an action
func getResponseForAction(rule models.FilterRule) string {
	switch rule.ActionType {
	case models.FilterActionRedirect:
		return ""
	case models.FilterActionBadRequest:
		if rule.ActionValue != "" {
			return rule.ActionValue
		}
		return "Bad Request"
	case models.FilterActionTooMany:
		if rule.ActionValue != "" {
			return rule.ActionValue
		}
		return "Too Many Requests"
	case models.FilterActionCustom:
		if rule.ActionValue != "" {
			return rule.ActionValue
		}
		return "Request Blocked"
	default:
		return "Request Blocked"
	}
}

// getRedirectURLForAction returns the redirect URL for redirect actions
func getRedirectURLForAction(rule models.FilterRule) string {
	if rule.ActionType == models.FilterActionRedirect {
		return rule.ActionValue
	}
	return ""
}

// getClientIP extracts the client IP from the request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first IP in the list
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// logFilteredRequest logs a filtered request to the database
func logFilteredRequest(clientIP, hostname, requestPath, userAgent string, rule models.FilterRule) {
	_, err := database.DB.Exec(`
		INSERT INTO filter_logs (
			client_ip, hostname, request_path, user_agent, filter_id,
			match_type, match_value, action_type, status_code
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, clientIP, hostname, requestPath, userAgent, rule.ID,
		string(rule.MatchType), rule.MatchValue, string(rule.ActionType),
		getStatusCodeForAction(rule))

	if err != nil {
		log.Printf("Error logging filtered request: %v", err)
	}
}
