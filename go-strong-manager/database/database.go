package database

import (
	"database/sql"
	"log"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

var (
	DB          *sql.DB
	once        sync.Once
	mu          sync.Mutex
	initialized bool
)

// Initialize initializes the database
func Initialize() {
	mu.Lock()
	defer mu.Unlock()

	// If already initialized, do nothing
	if initialized && DB != nil {
		// Test the connection to make sure it's still valid
		if err := DB.Ping(); err == nil {
			return
		}
		// If ping fails, we'll reinitialize below
	}

	var err error
	DB, err = sql.Open("sqlite", "./strong-proxy.db?_journal_mode=WAL&_synchronous=NORMAL&_cache_size=1000&_timeout=5000&_busy_timeout=5000")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Configure connection pool
	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(25)
	DB.SetConnMaxLifetime(5 * time.Minute)

	// Enable WAL mode and other optimizations
	_, err = DB.Exec("PRAGMA journal_mode = WAL;")
	if err != nil {
		log.Printf("Warning: Failed to set WAL mode: %v", err)
	}

	_, err = DB.Exec("PRAGMA synchronous = NORMAL;")
	if err != nil {
		log.Printf("Warning: Failed to set synchronous mode: %v", err)
	}

	_, err = DB.Exec("PRAGMA cache_size = 1000;")
	if err != nil {
		log.Printf("Warning: Failed to set cache size: %v", err)
	}

	_, err = DB.Exec("PRAGMA temp_store = memory;")
	if err != nil {
		log.Printf("Warning: Failed to set temp store: %v", err)
	}

	_, err = DB.Exec("PRAGMA busy_timeout = 5000;")
	if err != nil {
		log.Printf("Warning: Failed to set busy timeout: %v", err)
	}

	// Create tables if they don't exist
	createTables()

	// Create indexes for better performance
	createIndexes()

	initialized = true
}

// createTables creates all required tables
func createTables() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT UNIQUE,
			password_hash TEXT,
			role TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS dns_rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			hostname TEXT UNIQUE,
			rate_limit_enabled BOOLEAN DEFAULT 0,
			rate_limit_quota INTEGER DEFAULT 100,
			rate_limit_period INTEGER DEFAULT 60,
			log_retention_days INTEGER DEFAULT 30,
			health_check_enabled BOOLEAN DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS backends (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			url TEXT UNIQUE,
			weight INTEGER,
			isActive BOOLEAN
		)`,
		`CREATE TABLE IF NOT EXISTS dns_backend_map (
			dns_rule_id INTEGER,
			backend_id INTEGER,
			PRIMARY KEY (dns_rule_id, backend_id),
			FOREIGN KEY (dns_rule_id) REFERENCES dns_rules(id) ON DELETE CASCADE,
			FOREIGN KEY (backend_id) REFERENCES backends(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS request_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			client_ip TEXT,
			hostname TEXT,
			request_path TEXT,
			backend_id INTEGER,
			latency_ms INTEGER,
			status_code INTEGER,
			is_success BOOLEAN,
			user_agent TEXT,
			filtered_by INTEGER DEFAULT 0,
			FOREIGN KEY (backend_id) REFERENCES backends(id) ON DELETE SET NULL,
			FOREIGN KEY (filtered_by) REFERENCES filter_rules(id) ON DELETE SET NULL
		)`,
		`CREATE TABLE IF NOT EXISTS alerts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			dns_rule_id INTEGER DEFAULT 0,
			type TEXT CHECK(type IN ('email', 'webhook')),
			destination TEXT NOT NULL,
			threshold INTEGER DEFAULT 5,
			enabled BOOLEAN DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (dns_rule_id) REFERENCES dns_rules(id) ON DELETE SET NULL
		)`,
		`CREATE TABLE IF NOT EXISTS alert_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			alert_id INTEGER,
			message TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			sent BOOLEAN DEFAULT 0,
			FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS filter_rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			match_type TEXT CHECK(match_type IN ('ip', 'path', 'dns')) NOT NULL,
			match_value TEXT NOT NULL,
			action_type TEXT CHECK(action_type IN ('redirect', 'bad_request', 'too_many', 'custom')) NOT NULL,
			action_value TEXT,
			status_code INTEGER DEFAULT 200,
			is_active BOOLEAN DEFAULT 1,
			priority INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS filter_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			client_ip TEXT,
			hostname TEXT,
			request_path TEXT,
			user_agent TEXT,
			filter_id INTEGER,
			match_type TEXT,
			match_value TEXT,
			action_type TEXT,
			status_code INTEGER,
			FOREIGN KEY (filter_id) REFERENCES filter_rules(id) ON DELETE SET NULL
		)`,
	}

	for _, query := range queries {
		_, err := DB.Exec(query)
		if err != nil {
			log.Fatalf("Failed to create table: %v", err)
		}
	}

	// Add columns to existing tables if they don't exist
	addColumnsIfNotExist()
}

// addColumnsIfNotExist adds new columns to existing tables if they don't exist
func addColumnsIfNotExist() {
	// Check if rate_limit columns exist in dns_rules
	columnsToAdd := []struct {
		table, column, definition string
	}{
		{"dns_rules", "rate_limit_enabled", "BOOLEAN DEFAULT 0"},
		{"dns_rules", "rate_limit_quota", "INTEGER DEFAULT 100"},
		{"dns_rules", "rate_limit_period", "INTEGER DEFAULT 60"},
		{"dns_rules", "log_retention_days", "INTEGER DEFAULT 30"},
		{"dns_rules", "health_check_enabled", "BOOLEAN DEFAULT 0"},
		{"alerts", "dns_rule_id", "INTEGER DEFAULT 0"},
		{"request_logs", "request_path", "TEXT"},
		{"request_logs", "user_agent", "TEXT"},
		{"request_logs", "filtered_by", "INTEGER DEFAULT 0"},
	}

	for _, col := range columnsToAdd {
		var exists int
		query := `SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`
		err := DB.QueryRow(query, col.table, col.column).Scan(&exists)

		if err != nil {
			log.Printf("Error checking if column exists: %v", err)
			continue
		}

		if exists == 0 {
			// Column doesn't exist, add it
			alterQuery := `ALTER TABLE ` + col.table + ` ADD COLUMN ` + col.column + ` ` + col.definition
			_, err := DB.Exec(alterQuery)
			if err != nil {
				log.Printf("Error adding column %s to %s: %v", col.column, col.table, err)
			} else {
				log.Printf("Added column %s to %s", col.column, col.table)
			}
		}
	}
}

// createIndexes creates database indexes for better performance
func createIndexes() {
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_hostname ON request_logs(hostname)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_backend_id ON request_logs(backend_id)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_is_success ON request_logs(is_success)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_client_ip ON request_logs(client_ip)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_filtered_by ON request_logs(filtered_by)`,
		`CREATE INDEX IF NOT EXISTS idx_filter_rules_active ON filter_rules(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_filter_rules_priority ON filter_rules(priority DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_filter_rules_match_type ON filter_rules(match_type)`,
		`CREATE INDEX IF NOT EXISTS idx_filter_logs_timestamp ON filter_logs(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_filter_logs_client_ip ON filter_logs(client_ip)`,
		`CREATE INDEX IF NOT EXISTS idx_filter_logs_filter_id ON filter_logs(filter_id)`,
	}

	for _, indexQuery := range indexes {
		_, err := DB.Exec(indexQuery)
		if err != nil {
			log.Printf("Warning: Failed to create index: %v", err)
		}
	}
}

// Close closes the database connection
func Close() {
	mu.Lock()
	defer mu.Unlock()

	if DB != nil {
		DB.Close()
		DB = nil
	}
	initialized = false
}
