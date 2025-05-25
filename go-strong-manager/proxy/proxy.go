package proxy

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sync"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/arifur/strong-reverse-proxy/models"
)

var (
	// Cache for DNS rules
	dnsRuleCache     = make(map[string][]models.Backend)
	dnsRuleCacheLock = sync.RWMutex{}

	// HTTP server instance
	httpServer *http.Server

	// Track selected counts for each backend
	backendCountMap     = make(map[string]int) // map[backendID]selectedCount
	backendCountMapLock = sync.Mutex{}
)

// Initialize sets up the proxy functionality
func Initialize() {
	// Load DNS rules into cache initially
	refreshCache()

	/* // Start a goroutine to periodically refresh the cache
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			refreshCache()
		}
	}() */
}

// refreshCache updates the in-memory cache of DNS rules
func refreshCache() {
	// Reset backend count map before refreshing
	// Query all DNS rules
	rows, err := database.DB.Query(`
		SELECT 
			d.id, 
			d.hostname
		FROM 
			dns_rules d
	`)
	if err != nil {
		fmt.Printf("Error refreshing cache: %v\n", err)
		return
	}
	defer rows.Close()

	// Temporary cache to avoid locking the main cache during the entire operation
	tempCache := make(map[string][]models.Backend)

	// Iterate through DNS rules
	for rows.Next() {
		var rule models.DNSRule
		if err := rows.Scan(&rule.ID, &rule.Hostname); err != nil {
			fmt.Printf("Error scanning DNS rule: %v\n", err)
			continue
		}

		// Get backends for this DNS rule
		backendRows, err := database.DB.Query(`
			SELECT 
				b.id, 
				b.url, 
				b.weight, 
				b.isActive
			FROM 
				backends b
			JOIN 
				dns_backend_map m ON b.id = m.backend_id
			WHERE 
				m.dns_rule_id = ?
		`, rule.ID)
		if err != nil {
			fmt.Printf("Error getting backends: %v\n", err)
			continue
		}

		// Collect backends
		backends := []models.Backend{}
		for backendRows.Next() {
			var backend models.Backend
			if err := backendRows.Scan(&backend.ID, &backend.URL, &backend.Weight, &backend.IsActive); err != nil {
				fmt.Printf("Error scanning backend: %v\n", err)
				continue
			}
			if backend.IsActive {
				backends = append(backends, backend)
			}
		}
		backendRows.Close()

		// Add to temporary cache
		if len(backends) > 0 {
			// Store by original hostname (could include port)
			tempCache[rule.Hostname] = backends

			// Also log the hostnames being cached
			fmt.Printf("DNS rule cached: %s with %d backends\n", rule.Hostname, len(backends))
		}
	}

	// Update the main cache with a lock
	dnsRuleCacheLock.Lock()
	dnsRuleCache = tempCache
	dnsRuleCacheLock.Unlock()

	fmt.Printf("DNS cache refreshed with %d entries\n", len(tempCache))
}

// RefreshDNSRulesCache immediately refreshes the DNS rules cache
// This can be called from other packages after DNS rules are modified
func RefreshDNSRulesCache() {
	fmt.Println("Refreshing DNS rules cache on demand")
	refreshCache()
}

// selects a backend using weighted round-robin algorithm
// weight will give the percentage of requests to send to the backend based on the other backends weight.
// after weight adjustment, then follow round robin algorithm to select the backend.
func selectBackend(backends []models.Backend) *models.Backend {
	if len(backends) == 1 {
		// If there's only one backend, increment its count and return it
		backendCountMapLock.Lock()
		backendCountMap[backends[0].URL]++
		backendCountMapLock.Unlock()
		return &backends[0]
	}

	// find minimum weight backend
	minWeight := backends[0].Weight
	for _, backend := range backends {
		if backend.Weight < minWeight {
			minWeight = backend.Weight
		}
	}

	backendCountMapLock.Lock()
	defer backendCountMapLock.Unlock()

	var selectedBackend *models.Backend
	var maxPriorityValue float64 = 0

	// update ratio for each backend based on min weight
	for i := range backends {
		// Use the pointer to the backend in the slice
		backend := &backends[i]

		// Calculate ratio
		backend.Ratio = float64(backend.Weight) / float64(minWeight)

		// Get current selected count from the map
		selectedCount := backendCountMap[backend.URL]

		// Calculate priority
		priority := backend.Ratio - float64(selectedCount)

		if selectedBackend == nil || priority > maxPriorityValue {
			maxPriorityValue = priority
			selectedBackend = backend
		}
	}

	// Increment the selected backend's count
	backendCountMap[selectedBackend.URL]++

	return selectedBackend
}

type DebugTransport struct{}

func (DebugTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	b, err := httputil.DumpRequestOut(r, false)
	if err != nil {
		return nil, err
	}
	fmt.Println(string(b))
	return http.DefaultTransport.RoundTrip(r)
}

// proxyHandler is the main HTTP handler for proxying requests
func proxyHandler(w http.ResponseWriter, r *http.Request) {
	// Extract hostname from request
	hostname := r.Host
	// Look up backends for this hostname
	dnsRuleCacheLock.RLock()
	backends, exists := dnsRuleCache[hostname]
	dnsRuleCacheLock.RUnlock()

	if !exists || len(backends) == 0 {
		http.Error(w, "No backends found for this hostname "+hostname, http.StatusGone)
		return
	}

	// Select a backend using weighted round-robin
	backend := selectBackend(backends)

	// Start measuring request time
	startTime := time.Now()

	// Parse the backend URL
	targetURL, err := url.Parse(backend.URL)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	r.Host = targetURL.Host
	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Called on every response from the backend
	proxy.ModifyResponse = func(resp *http.Response) error {

		// Calculate latency
		latencyMS := time.Since(startTime).Milliseconds()
		go logRequest(r.RemoteAddr, hostname, r.URL.Path, backend.ID, int(latencyMS), resp.StatusCode, true)

		return nil
	}

	// Optional: catch errors in contacting backend
	proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
		rw.WriteHeader(http.StatusBadGateway)
		rw.Write([]byte("Bad Gateway"))

		// Calculate latency
		latencyMS := time.Since(startTime).Milliseconds()
		go logRequest(r.RemoteAddr, hostname, r.URL.Path, backend.ID, int(latencyMS), http.StatusBadGateway, false)
	}

	// Serve the request
	proxy.ServeHTTP(w, r)

}

// logRequest logs the request to the database using buffered logging
func logRequest(clientIP, hostname, requestPath string, backendID int, latencyMS int, statusCode int, isSuccess bool) {
	// Use buffered logger to reduce database contention
	database.LogRequest(clientIP, hostname, requestPath, backendID, latencyMS, statusCode, isSuccess)
}

// StartProxyServer starts the HTTP server for the proxy
func StartProxyServer(address string) error {
	// Create a new server
	httpServer = &http.Server{
		Addr:    address,
		Handler: http.HandlerFunc(proxyHandler),
	}

	// Start the server
	fmt.Printf("Starting proxy server on %s\n", address)
	return httpServer.ListenAndServe()
}

// StopProxyServer stops the HTTP server
func StopProxyServer() error {
	if httpServer != nil {
		return httpServer.Close()
	}
	return nil
}
