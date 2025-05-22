package database

import (
	"database/sql"
	"log"
	"sync"

	_ "github.com/mattn/go-sqlite3"
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
	DB, err = sql.Open("sqlite3", "./strong-proxy.db")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Create tables if they don't exist
	createTables()

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
			backend_id INTEGER,
			latency_ms INTEGER,
			status_code INTEGER,
			is_success BOOLEAN,
			FOREIGN KEY (backend_id) REFERENCES backends(id) ON DELETE SET NULL
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
