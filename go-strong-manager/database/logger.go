package database

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"time"
)

// LogEntry represents a single log entry to be written
type LogEntry struct {
	ClientIP    string
	Hostname    string
	RequestPath string
	BackendID   int
	LatencyMS   int
	StatusCode  int
	IsSuccess   bool
	UserAgent   string
	FilteredBy  int
	Timestamp   time.Time
}

// BufferedLogger handles batched database writes to reduce contention
type BufferedLogger struct {
	buffer    []LogEntry
	bufferMu  sync.Mutex
	batchSize int
	flushTime time.Duration
	stopCh    chan struct{}
	wg        sync.WaitGroup
}

var (
	logger     *BufferedLogger
	loggerOnce sync.Once
)

// InitBufferedLogger initializes the buffered logger
func InitBufferedLogger() {
	loggerOnce.Do(func() {
		batchSize := getEnvInt("LOG_BATCH_SIZE", 50)
		flushTime := getEnvDuration("LOG_FLUSH_TIME", 5*time.Second)

		logger = &BufferedLogger{
			buffer:    make([]LogEntry, 0, batchSize*2), // Buffer size is 2x batch size
			batchSize: batchSize,
			flushTime: flushTime,
			stopCh:    make(chan struct{}),
		}
		logger.start()
		log.Printf("Buffered logger initialized with batch_size=%d, flush_time=%v", batchSize, flushTime)
	})
}

// LogRequest adds a log entry to the buffer
func LogRequest(clientIP, hostname, requestPath string, backendID int, latencyMS int, statusCode int, isSuccess bool, userAgent string, filteredBy int) {
	if logger == nil {
		InitBufferedLogger()
	}

	entry := LogEntry{
		ClientIP:    clientIP,
		Hostname:    hostname,
		RequestPath: requestPath,
		BackendID:   backendID,
		LatencyMS:   latencyMS,
		StatusCode:  statusCode,
		IsSuccess:   isSuccess,
		UserAgent:   userAgent,
		FilteredBy:  filteredBy,
		Timestamp:   time.Now(),
	}

	logger.bufferMu.Lock()
	logger.buffer = append(logger.buffer, entry)
	shouldFlush := len(logger.buffer) >= logger.batchSize
	logger.bufferMu.Unlock()

	if shouldFlush {
		go logger.flush()
	}
}

// start begins the background flushing routine
func (bl *BufferedLogger) start() {
	bl.wg.Add(1)
	go func() {
		defer bl.wg.Done()
		ticker := time.NewTicker(bl.flushTime)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				bl.flush()
			case <-bl.stopCh:
				// Final flush before stopping
				bl.flush()
				return
			}
		}
	}()
}

// flush writes all buffered entries to the database
func (bl *BufferedLogger) flush() {
	bl.bufferMu.Lock()
	if len(bl.buffer) == 0 {
		bl.bufferMu.Unlock()
		return
	}

	// Copy buffer and clear it
	entries := make([]LogEntry, len(bl.buffer))
	copy(entries, bl.buffer)
	bl.buffer = bl.buffer[:0] // Clear the buffer
	bl.bufferMu.Unlock()

	// Write to database with retry logic
	bl.writeToDatabase(entries)
}

// writeToDatabase writes entries to the database with retry logic
func (bl *BufferedLogger) writeToDatabase(entries []LogEntry) {
	const maxRetries = 3
	const baseDelay = 100 * time.Millisecond

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff
			delay := baseDelay * time.Duration(1<<uint(attempt-1))
			time.Sleep(delay)
		}

		err := bl.batchInsert(entries)
		if err == nil {
			return // Success
		}

		log.Printf("Attempt %d failed to write logs to database: %v", attempt+1, err)

		// If it's the last attempt, log the error
		if attempt == maxRetries-1 {
			log.Printf("Failed to write %d log entries after %d attempts: %v", len(entries), maxRetries, err)
		}
	}
}

// batchInsert performs a batch insert of log entries
func (bl *BufferedLogger) batchInsert(entries []LogEntry) error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}

	// Begin transaction
	tx, err := DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Prepare statement
	stmt, err := tx.Prepare(`
		INSERT INTO request_logs (
			timestamp,
			client_ip, 
			hostname, 
			request_path,
			backend_id, 
			latency_ms, 
			status_code, 
			is_success,
			user_agent,
			filtered_by
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	// Execute batch insert
	for _, entry := range entries {
		_, err := stmt.Exec(
			entry.Timestamp.Format("2006-01-02 15:04:05"),
			entry.ClientIP,
			entry.Hostname,
			entry.RequestPath,
			entry.BackendID,
			entry.LatencyMS,
			entry.StatusCode,
			entry.IsSuccess,
			entry.UserAgent,
			entry.FilteredBy,
		)
		if err != nil {
			return fmt.Errorf("failed to execute insert: %w", err)
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Successfully wrote %d log entries to database", len(entries))
	return nil
}

// Stop gracefully stops the buffered logger
func StopBufferedLogger() {
	if logger != nil {
		select {
		case <-logger.stopCh:
			// Already closed
		default:
			close(logger.stopCh)
		}
		logger.wg.Wait()
	}
}

// FlushNow forces an immediate flush of all buffered entries
func FlushNow() {
	if logger != nil {
		logger.flush()
	}
}

// getEnvInt gets an environment variable as an integer or returns a default value
func getEnvInt(key string, defaultValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	intValue, err := strconv.Atoi(value)
	if err != nil {
		log.Printf("Warning: Invalid value for %s: %s, using default %d", key, value, defaultValue)
		return defaultValue
	}
	return intValue
}

// getEnvDuration gets an environment variable as a duration or returns a default value
func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	duration, err := time.ParseDuration(value)
	if err != nil {
		log.Printf("Warning: Invalid duration for %s: %s, using default %v", key, value, defaultValue)
		return defaultValue
	}
	return duration
}
