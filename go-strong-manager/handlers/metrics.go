package handlers

import (
	"database/sql"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/arifur/strong-reverse-proxy/database"
	"github.com/gofiber/fiber/v2"
)

// GetMetrics returns metrics in JSON format
func GetMetrics(c *fiber.Ctx) error {
	// Check if hostname filter is provided
	hostname := c.Query("hostname")

	// Build query based on hostname filter
	var queryFilter string
	var args []interface{}

	if hostname != "" {
		queryFilter = " WHERE hostname = ?"
		args = append(args, hostname)
	}

	// Prepare metrics object
	metrics := make(map[string]interface{})

	// Total requests
	var totalRequests int
	query := fmt.Sprintf("SELECT COUNT(*) FROM request_logs%s", queryFilter)
	err := database.DB.QueryRow(query, args...).Scan(&totalRequests)
	if err == nil {
		metrics["requests_total"] = totalRequests
	} else {
		metrics["requests_total"] = 0
	}

	// Success vs failure
	var successRequests, failureRequests int
	if hostname != "" {
		query = "SELECT COUNT(*) FROM request_logs WHERE hostname = ? AND is_success = 1"
		err = database.DB.QueryRow(query, hostname).Scan(&successRequests)
	} else {
		query = "SELECT COUNT(*) FROM request_logs WHERE is_success = 1"
		err = database.DB.QueryRow(query).Scan(&successRequests)
	}

	if err == nil {
		metrics["success_requests"] = successRequests
	} else {
		metrics["success_requests"] = 0
	}

	if hostname != "" {
		query = "SELECT COUNT(*) FROM request_logs WHERE hostname = ? AND is_success = 0"
		err = database.DB.QueryRow(query, hostname).Scan(&failureRequests)
	} else {
		query = "SELECT COUNT(*) FROM request_logs WHERE is_success = 0"
		err = database.DB.QueryRow(query).Scan(&failureRequests)
	}

	if err == nil {
		metrics["failure_requests"] = failureRequests
	} else {
		metrics["failure_requests"] = 0
	}

	// Latency metrics
	var avgLatency float64
	query = fmt.Sprintf("SELECT AVG(latency_ms) FROM request_logs%s", queryFilter)
	if hostname != "" {
		args = []interface{}{hostname}
	}
	err = database.DB.QueryRow(query, args...).Scan(&avgLatency)
	if err == nil {
		metrics["latency_avg"] = avgLatency
	} else {
		metrics["latency_avg"] = 0
	}

	var maxLatency int
	query = fmt.Sprintf("SELECT MAX(latency_ms) FROM request_logs%s", queryFilter)
	if hostname != "" {
		args = []interface{}{hostname}
	}
	err = database.DB.QueryRow(query, args...).Scan(&maxLatency)
	if err == nil {
		metrics["latency_max"] = maxLatency
	} else {
		metrics["latency_max"] = 0
	}

	// Get requests per backend
	var backendQuery string
	if hostname != "" {
		backendQuery = `
			SELECT 
				b.id, 
				b.url, 
				COUNT(l.id) as request_count
			FROM 
				backends b
			LEFT JOIN 
				request_logs l ON b.id = l.backend_id
			WHERE 
				l.hostname = ?
			GROUP BY 
				b.id, b.url
		`
	} else {
		backendQuery = `
			SELECT 
				b.id, 
				b.url, 
				COUNT(l.id) as request_count
			FROM 
				backends b
			LEFT JOIN 
				request_logs l ON b.id = l.backend_id
			GROUP BY 
				b.id, b.url
		`
	}

	var backendRows *sql.Rows
	var backendErr error

	if hostname != "" {
		backendRows, backendErr = database.DB.Query(backendQuery, hostname)
	} else {
		backendRows, backendErr = database.DB.Query(backendQuery)
	}

	// Backend metrics
	backendMetrics := []map[string]interface{}{}

	if backendErr == nil {
		defer backendRows.Close()

		for backendRows.Next() {
			var backendID int
			var backendURL string
			var requestCount int

			if err := backendRows.Scan(&backendID, &backendURL, &requestCount); err == nil {
				backendMetrics = append(backendMetrics, map[string]interface{}{
					"id":       backendID,
					"url":      backendURL,
					"requests": requestCount,
				})
			}
		}
	}

	metrics["backend_metrics"] = backendMetrics

	// Last hour requests
	var lastHourRequests int
	oneHourAgo := time.Now().Add(-1 * time.Hour).Format("2006-01-02 15:04:05")

	var lastHourQuery string
	var lastHourArgs []interface{}

	if hostname != "" {
		lastHourQuery = "SELECT COUNT(*) FROM request_logs WHERE timestamp > ? AND hostname = ?"
		lastHourArgs = append(lastHourArgs, oneHourAgo, hostname)
	} else {
		lastHourQuery = "SELECT COUNT(*) FROM request_logs WHERE timestamp > ?"
		lastHourArgs = append(lastHourArgs, oneHourAgo)
	}

	err = database.DB.QueryRow(lastHourQuery, lastHourArgs...).Scan(&lastHourRequests)
	if err == nil {
		metrics["requests_last_hour"] = lastHourRequests
	} else {
		metrics["requests_last_hour"] = 0
	}

	return c.JSON(metrics)
}

// GetRecentLogs returns recent request logs with pagination and filtering
func GetRecentLogs(c *fiber.Ctx) error {
	// Parse query parameters for pagination
	page, err := strconv.Atoi(c.Query("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}

	// Parse items per page
	limit, err := strconv.Atoi(c.Query("limit", "10"))
	if err != nil || limit < 1 || limit > 500 {
		limit = 10 // Default 10 items per page, max 500
	}

	// Calculate offset for SQL query
	offset := (page - 1) * limit

	// Get hostname filter if provided
	hostname := c.Query("hostname", "")

	// Get status code filter if provided
	statusCode, err := strconv.Atoi(c.Query("status_code", "0"))
	if err != nil {
		statusCode = 0 // 0 means no filter
	}

	// Get client IP filter if provided
	clientIP := c.Query("client_ip", "")

	// Get backend ID filter if provided
	backendID, err := strconv.Atoi(c.Query("backend_id", "0"))
	if err != nil {
		backendID = 0 // 0 means no filter
	}

	// Get success filter if provided
	successFilter := c.Query("is_success", "")

	// Get date range filters if provided
	startDate := c.Query("start_date", "")
	endDate := c.Query("end_date", "")

	// Build the query with dynamic filters
	query := `
		SELECT 
			r.id,
			r.timestamp,
			r.client_ip,
			r.hostname,
			r.request_path,
			r.backend_id,
			b.url AS backend_url,
			r.latency_ms,
			r.status_code,
			r.is_success
		FROM 
			request_logs r
		LEFT JOIN 
			backends b ON r.backend_id = b.id
		WHERE 1=1
	`

	countQuery := `
		SELECT 
			COUNT(*)
		FROM 
			request_logs r
		WHERE 1=1
	`

	var params []interface{}
	var countParams []interface{}

	// Add filters to the query
	if hostname != "" {
		query += " AND r.hostname = ?"
		countQuery += " AND r.hostname = ?"
		params = append(params, hostname)
		countParams = append(countParams, hostname)
	}

	if statusCode > 0 {
		query += " AND r.status_code = ?"
		countQuery += " AND r.status_code = ?"
		params = append(params, statusCode)
		countParams = append(countParams, statusCode)
	}

	if clientIP != "" {
		query += " AND r.client_ip LIKE ?"
		countQuery += " AND r.client_ip LIKE ?"
		params = append(params, "%"+clientIP+"%")
		countParams = append(countParams, "%"+clientIP+"%")
	}

	if backendID > 0 {
		query += " AND r.backend_id = ?"
		countQuery += " AND r.backend_id = ?"
		params = append(params, backendID)
		countParams = append(countParams, backendID)
	}

	if successFilter != "" {
		isSuccess := strings.ToLower(successFilter) == "true"
		query += " AND r.is_success = ?"
		countQuery += " AND r.is_success = ?"
		params = append(params, isSuccess)
		countParams = append(countParams, isSuccess)
	}

	if startDate != "" {
		query += " AND r.timestamp >= ?"
		countQuery += " AND r.timestamp >= ?"
		params = append(params, startDate)
		countParams = append(countParams, startDate)
	}

	if endDate != "" {
		query += " AND r.timestamp <= ?"
		countQuery += " AND r.timestamp <= ?"
		params = append(params, endDate)
		countParams = append(countParams, endDate)
	}

	// Add sorting and pagination
	query += " ORDER BY r.timestamp DESC LIMIT ? OFFSET ?"
	params = append(params, limit, offset)

	// Execute the count query first to get total items
	var totalItems int
	err = database.DB.QueryRow(countQuery, countParams...).Scan(&totalItems)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error while counting logs",
		})
	}

	// Calculate total pages
	totalPages := (totalItems + limit - 1) / limit

	// Execute the main query
	rows, err := database.DB.Query(query, params...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error while fetching logs",
		})
	}
	defer rows.Close()

	// Collect logs
	logs := []map[string]interface{}{}
	for rows.Next() {
		var (
			id          int
			timestamp   string
			clientIP    string
			hostname    string
			requestPath sql.NullString
			backendID   int
			backendURL  sql.NullString
			latencyMS   int
			statusCode  int
			isSuccess   bool
		)

		if err := rows.Scan(&id, &timestamp, &clientIP, &hostname, &requestPath, &backendID, &backendURL, &latencyMS, &statusCode, &isSuccess); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Error scanning log",
			})
		}

		// Format the backend URL
		var backendURLStr string
		if backendURL.Valid {
			backendURLStr = backendURL.String
		} else {
			backendURLStr = "Unknown"
		}

		// Format the request path
		var requestPathStr string
		if requestPath.Valid {
			requestPathStr = requestPath.String
		} else {
			requestPathStr = "/"
		}

		// Add to logs list
		logs = append(logs, map[string]interface{}{
			"id":           id,
			"timestamp":    timestamp,
			"client_ip":    clientIP,
			"hostname":     hostname,
			"request_path": requestPathStr,
			"backend_id":   backendID,
			"backend_url":  backendURLStr,
			"latency_ms":   latencyMS,
			"status_code":  statusCode,
			"is_success":   isSuccess,
		})
	}

	// Return paginated results with metadata
	return c.JSON(fiber.Map{
		"data": logs,
		"pagination": fiber.Map{
			"total_items":  totalItems,
			"total_pages":  totalPages,
			"current_page": page,
			"limit":        limit,
		},
		"filters": fiber.Map{
			"hostname":    hostname,
			"status_code": statusCode,
			"client_ip":   clientIP,
			"backend_id":  backendID,
			"is_success":  successFilter,
			"start_date":  startDate,
			"end_date":    endDate,
		},
	})
}

// GetSystemResources returns real-time system resource information
func GetSystemResources(c *fiber.Ctx) error {
	resources := make(map[string]interface{})

	// Add basic Go runtime metrics
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// CPU count
	resources["cpu_cores"] = runtime.NumCPU()

	// Get memory information
	var totalMemory uint64
	var freeMemory uint64

	// Different commands for different OS
	switch runtime.GOOS {
	case "darwin", "linux":
		// For macOS and Linux - use the 'vm_stat' or 'free' command
		var cmd *exec.Cmd
		if runtime.GOOS == "darwin" {
			cmd = exec.Command("vm_stat")
		} else {
			cmd = exec.Command("free", "-b")
		}

		output, err := cmd.Output()
		if err == nil {
			outputStr := string(output)

			if runtime.GOOS == "darwin" {
				// Parse macOS vm_stat output
				lines := strings.Split(outputStr, "\n")
				pageSize := uint64(4096) // Default page size on macOS

				for _, line := range lines {
					if strings.Contains(line, "Pages free:") {
						parts := strings.Split(line, ":")
						if len(parts) == 2 {
							freePages, err := strconv.ParseUint(strings.TrimSpace(strings.Replace(parts[1], ".", "", -1)), 10, 64)
							if err == nil {
								freeMemory = freePages * pageSize
							}
						}
					} else if strings.Contains(line, "Pages active:") ||
						strings.Contains(line, "Pages inactive:") ||
						strings.Contains(line, "Pages speculative:") ||
						strings.Contains(line, "Pages wired down:") {
						parts := strings.Split(line, ":")
						if len(parts) == 2 {
							pages, err := strconv.ParseUint(strings.TrimSpace(strings.Replace(parts[1], ".", "", -1)), 10, 64)
							if err == nil {
								totalMemory += pages * pageSize
							}
						}
					}
				}
				// Add free memory to total
				totalMemory += freeMemory
			} else {
				// Parse Linux free output
				lines := strings.Split(outputStr, "\n")
				if len(lines) > 1 {
					fields := strings.Fields(lines[1])
					if len(fields) >= 3 {
						totalMem, err := strconv.ParseUint(fields[1], 10, 64)
						if err == nil {
							totalMemory = totalMem
						}
						freeMem, err := strconv.ParseUint(fields[3], 10, 64)
						if err == nil {
							freeMemory = freeMem
						}
					}
				}
			}
		}
	case "windows":
		// For Windows - use WMI via PowerShell
		cmd := exec.Command("powershell", "-Command",
			"Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory | ConvertTo-Json")
		output, err := cmd.Output()
		if err == nil {
			// Simple parsing - a proper implementation would use JSON unmarshaling
			outputStr := string(output)
			if strings.Contains(outputStr, "TotalVisibleMemorySize") && strings.Contains(outputStr, "FreePhysicalMemory") {
				// Extract values with simple string parsing (for illustration)
				// In a real implementation, properly parse the JSON
				totalStr := outputStr[strings.Index(outputStr, "TotalVisibleMemorySize")+24:]
				totalStr = totalStr[:strings.Index(totalStr, ",")]
				totalMemKB, err := strconv.ParseUint(strings.TrimSpace(totalStr), 10, 64)
				if err == nil {
					totalMemory = totalMemKB * 1024
				}

				freeStr := outputStr[strings.Index(outputStr, "FreePhysicalMemory")+20:]
				freeStr = freeStr[:strings.Index(freeStr, "\n")]
				freeMemKB, err := strconv.ParseUint(strings.TrimSpace(freeStr), 10, 64)
				if err == nil {
					freeMemory = freeMemKB * 1024
				}
			}
		}
	}

	// Calculate memory usage
	var memoryUsage float64
	if totalMemory > 0 {
		memoryUsage = float64(totalMemory-freeMemory) / float64(totalMemory) * 100.0
	}

	// Get CPU usage
	// Note: Properly measuring CPU usage requires sampling over time
	cpuUsage := 0.0 // Start with zero and only update if we get actual data

	// Try to get actual CPU usage using 'top' or equivalent
	switch runtime.GOOS {
	case "darwin", "linux":
		var cmd *exec.Cmd
		if runtime.GOOS == "darwin" {
			cmd = exec.Command("top", "-l", "1", "-n", "0", "-s", "0")
		} else {
			cmd = exec.Command("top", "-bn1")
		}

		output, err := cmd.Output()
		if err == nil {
			outputStr := string(output)

			if runtime.GOOS == "darwin" {
				// Parse macOS top output for CPU usage
				if strings.Contains(outputStr, "CPU usage:") {
					cpuLine := outputStr[strings.Index(outputStr, "CPU usage:"):]
					cpuLine = cpuLine[:strings.Index(cpuLine, "\n")]

					if strings.Contains(cpuLine, "% idle") {
						idleStr := cpuLine[strings.LastIndex(cpuLine, " ")+1:]
						idleStr = strings.Replace(idleStr, "% idle", "", 1)
						idle, err := strconv.ParseFloat(idleStr, 64)
						if err == nil {
							cpuUsage = 100.0 - idle
						}
					}
				}
			} else {
				// Parse Linux top output for CPU usage
				if strings.Contains(outputStr, "%Cpu(s):") {
					cpuLine := outputStr[strings.Index(outputStr, "%Cpu(s):"):]
					cpuLine = cpuLine[:strings.Index(cpuLine, "\n")]

					if strings.Contains(cpuLine, "id,") {
						idleStr := cpuLine[strings.Index(cpuLine, "id,")-6 : strings.Index(cpuLine, "id,")]
						idle, err := strconv.ParseFloat(strings.TrimSpace(idleStr), 64)
						if err == nil {
							cpuUsage = 100.0 - idle
						}
					}
				}
			}
		}

		// If top didn't work, try with ps or mpstat
		if cpuUsage == 0.0 {
			if runtime.GOOS == "darwin" {
				// Try using ps on macOS
				cmd := exec.Command("ps", "-A", "-o", "%cpu")
				output, err := cmd.Output()
				if err == nil {
					lines := strings.Split(string(output), "\n")
					var totalCPU float64
					var count int

					// Skip header line
					for i, line := range lines {
						if i > 0 && line != "" {
							cpu, err := strconv.ParseFloat(strings.TrimSpace(line), 64)
							if err == nil {
								totalCPU += cpu
								count++
							}
						}
					}

					if count > 0 {
						// Normalize to 100%
						cores := float64(runtime.NumCPU())
						cpuUsage = totalCPU / cores
						if cpuUsage > 100.0 {
							cpuUsage = 100.0
						}
					}
				}
			} else {
				// Try using mpstat on Linux
				cmd := exec.Command("mpstat", "1", "1")
				output, err := cmd.Output()
				if err == nil {
					lines := strings.Split(string(output), "\n")
					for _, line := range lines {
						if strings.Contains(line, "all") {
							fields := strings.Fields(line)
							if len(fields) >= 12 {
								idle, err := strconv.ParseFloat(fields[11], 64)
								if err == nil {
									cpuUsage = 100.0 - idle
									break
								}
							}
						}
					}
				}
			}
		}
	case "windows":
		// Windows CPU usage using PowerShell
		cmd := exec.Command("powershell", "-Command",
			"(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average")
		output, err := cmd.Output()
		if err == nil {
			usage, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
			if err == nil {
				cpuUsage = usage
			}
		}
	}

	// Add metrics to response
	resources["cpu_usage"] = cpuUsage
	resources["memory_usage"] = memoryUsage
	resources["memory_total"] = totalMemory
	resources["memory_free"] = freeMemory

	// Get disk usage (actual measurement, not static value)
	diskUsage := 0.0 // Start with zero and only update if we get actual data

	switch runtime.GOOS {
	case "darwin", "linux":
		var cmd *exec.Cmd
		if runtime.GOOS == "darwin" {
			cmd = exec.Command("df", "-k", "/")
		} else {
			cmd = exec.Command("df", "-k", "/")
		}

		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			if len(lines) > 1 {
				// Skip header line
				fields := strings.Fields(lines[1])
				if len(fields) >= 5 {
					// Percentage field in df output looks like "42%"
					percentStr := strings.TrimSuffix(fields[4], "%")
					percent, err := strconv.ParseFloat(percentStr, 64)
					if err == nil {
						diskUsage = percent
					}
				}
			}
		}

		// If df failed, try a more direct approach
		if diskUsage == 0.0 {
			// Try with a more direct command
			if runtime.GOOS == "darwin" {
				cmd := exec.Command("sh", "-c", "df -k / | awk 'NR==2 {print $5}' | tr -d '%'")
				output, err := cmd.Output()
				if err == nil {
					percent, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
					if err == nil {
						diskUsage = percent
					}
				}
			} else {
				// Try reading from /proc/mounts and /proc/diskstats on Linux
				cmd := exec.Command("sh", "-c", "df --output=pcent / | tail -1 | tr -d '% '")
				output, err := cmd.Output()
				if err == nil {
					percent, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
					if err == nil {
						diskUsage = percent
					}
				}
			}
		}
	case "windows":
		cmd := exec.Command("powershell", "-Command",
			"(Get-PSDrive C).Used / ((Get-PSDrive C).Used + (Get-PSDrive C).Free) * 100")
		output, err := cmd.Output()
		if err == nil {
			percent, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
			if err == nil {
				diskUsage = percent
			}
		}

		// Alternative method if the above fails
		if diskUsage == 0.0 {
			cmd := exec.Command("powershell", "-Command",
				"$disk = Get-WmiObject Win32_LogicalDisk -Filter 'DeviceID=\"C:\"'; [Math]::Round(($disk.Size - $disk.FreeSpace) / $disk.Size * 100, 2)")
			output, err := cmd.Output()
			if err == nil {
				percent, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
				if err == nil {
					diskUsage = percent
				}
			}
		}
	}
	resources["disk_usage"] = diskUsage

	// Get network stats (actual measurement, not static values)
	// This requires sampling network traffic over time
	uploadSpeed := "0 kB/s"
	downloadSpeed := "0 kB/s"
	totalBandwidth := "0"
	var uploadSpeedRaw, downloadSpeedRaw uint64

	// Network stats collection varies significantly by OS
	// For simplicity, we'll monitor network interfaces for a short sample
	switch runtime.GOOS {
	case "darwin":
		// Try first with netstat
		cmd := exec.Command("netstat", "-ib")
		output, err := cmd.Output()
		if err == nil {
			// Take a first sample of network stats
			lines := strings.Split(string(output), "\n")

			// Sleep for a short interval
			time.Sleep(1 * time.Second)

			// Take a second sample
			cmd := exec.Command("netstat", "-ib")
			outputAfter, err := cmd.Output()
			if err == nil {
				linesAfter := strings.Split(string(outputAfter), "\n")

				// Basic parsing - in a real implementation this would be more robust
				// Try to check multiple interfaces, not just en0
				var bytesInBefore, bytesOutBefore, bytesInAfter, bytesOutAfter uint64
				var foundInterface bool

				// Check active interfaces
				activeInterfaces := []string{"en0", "en1", "en2", "eth0", "eth1", "wlan0", "wlan1", "wi0"}

				for _, iface := range activeInterfaces {
					for i, line := range lines {
						if i > 0 && strings.Contains(line, iface) {
							fields := strings.Fields(line)
							if len(fields) >= 10 {
								bytesIn, _ := strconv.ParseUint(fields[6], 10, 64)
								bytesOut, _ := strconv.ParseUint(fields[9], 10, 64)
								bytesInBefore = bytesIn
								bytesOutBefore = bytesOut

								// Find same interface in second sample
								for j, lineAfter := range linesAfter {
									if j > 0 && strings.Contains(lineAfter, iface) {
										fieldsAfter := strings.Fields(lineAfter)
										if len(fieldsAfter) >= 10 {
											bytesIn, _ := strconv.ParseUint(fieldsAfter[6], 10, 64)
											bytesOut, _ := strconv.ParseUint(fieldsAfter[9], 10, 64)
											bytesInAfter = bytesIn
											bytesOutAfter = bytesOut
											foundInterface = true
											break
										}
									}
								}

								if foundInterface {
									break
								}
							}
						}
					}

					if foundInterface {
						break
					}
				}

				if foundInterface {
					// Calculate speed
					inSpeed := bytesInAfter - bytesInBefore
					outSpeed := bytesOutAfter - bytesOutBefore

					// Store raw values
					downloadSpeedRaw = inSpeed
					uploadSpeedRaw = outSpeed

					// Format the output
					if inSpeed > 1024*1024 {
						downloadSpeed = fmt.Sprintf("%.2f MB/s", float64(inSpeed)/1024/1024)
					} else if inSpeed > 1024 {
						downloadSpeed = fmt.Sprintf("%.2f kB/s", float64(inSpeed)/1024)
					} else {
						downloadSpeed = fmt.Sprintf("%d B/s", inSpeed)
					}

					if outSpeed > 1024*1024 {
						uploadSpeed = fmt.Sprintf("%.2f MB/s", float64(outSpeed)/1024/1024)
					} else if outSpeed > 1024 {
						uploadSpeed = fmt.Sprintf("%.2f kB/s", float64(outSpeed)/1024)
					} else {
						uploadSpeed = fmt.Sprintf("%d B/s", outSpeed)
					}

					total := inSpeed + outSpeed
					if total > 1024*1024 {
						totalBandwidth = fmt.Sprintf("%.2f MB/s", float64(total)/1024/1024)
					} else if total > 1024 {
						totalBandwidth = fmt.Sprintf("%.2f kB/s", float64(total)/1024)
					} else {
						totalBandwidth = fmt.Sprintf("%d B/s", total)
					}
				}
			}
		}

		// If netstat didn't work, try with other tools
		if downloadSpeedRaw == 0 && uploadSpeedRaw == 0 {
			// Try using nettop (macOS specific)
			cmd := exec.Command("sh", "-c", "nettop -P -L 1 -m route -T 1 | grep -v Interface | awk '{print $6, $7}'")
			output, err := cmd.Output()
			if err == nil {
				lines := strings.Split(string(output), "\n")
				var inSpeed, outSpeed uint64

				for _, line := range lines {
					if line != "" {
						fields := strings.Fields(line)
						if len(fields) >= 2 {
							in, err1 := strconv.ParseUint(fields[0], 10, 64)
							out, err2 := strconv.ParseUint(fields[1], 10, 64)
							if err1 == nil && err2 == nil {
								inSpeed += in
								outSpeed += out
							}
						}
					}
				}

				// Store raw values
				downloadSpeedRaw = inSpeed
				uploadSpeedRaw = outSpeed

				// Format output
				if inSpeed > 1024*1024 {
					downloadSpeed = fmt.Sprintf("%.2f MB/s", float64(inSpeed)/1024/1024)
				} else if inSpeed > 1024 {
					downloadSpeed = fmt.Sprintf("%.2f kB/s", float64(inSpeed)/1024)
				} else {
					downloadSpeed = fmt.Sprintf("%d B/s", inSpeed)
				}

				if outSpeed > 1024*1024 {
					uploadSpeed = fmt.Sprintf("%.2f MB/s", float64(outSpeed)/1024/1024)
				} else if outSpeed > 1024 {
					uploadSpeed = fmt.Sprintf("%.2f kB/s", float64(outSpeed)/1024)
				} else {
					uploadSpeed = fmt.Sprintf("%d B/s", outSpeed)
				}

				total := inSpeed + outSpeed
				if total > 1024*1024 {
					totalBandwidth = fmt.Sprintf("%.2f MB/s", float64(total)/1024/1024)
				} else if total > 1024 {
					totalBandwidth = fmt.Sprintf("%.2f kB/s", float64(total)/1024)
				} else {
					totalBandwidth = fmt.Sprintf("%d B/s", total)
				}
			}
		}
	case "linux":
		// Linux uses /proc/net/dev for network stats
		cmd := exec.Command("cat", "/proc/net/dev")
		output, err := cmd.Output()
		if err == nil {
			// First sample
			lines := strings.Split(string(output), "\n")

			// Sleep for a short interval
			time.Sleep(1 * time.Second)

			// Second sample
			cmd := exec.Command("cat", "/proc/net/dev")
			outputAfter, err := cmd.Output()
			if err == nil {
				linesAfter := strings.Split(string(outputAfter), "\n")

				// Parse stats for all interfaces, not just the first non-loopback
				var bytesInBefore, bytesOutBefore, bytesInAfter, bytesOutAfter uint64

				// Try multiple interfaces and sum their speeds
				for _, line := range lines {
					if strings.Contains(line, ":") {
						parts := strings.Split(line, ":")
						iface := strings.TrimSpace(parts[0])
						if iface != "lo" && len(parts) > 1 {
							fields := strings.Fields(parts[1])
							if len(fields) >= 9 {
								bytesIn, _ := strconv.ParseUint(fields[0], 10, 64)
								bytesOut, _ := strconv.ParseUint(fields[8], 10, 64)

								// Find the same interface in the second sample
								for _, lineAfter := range linesAfter {
									if strings.Contains(lineAfter, iface+":") {
										partsAfter := strings.Split(lineAfter, ":")
										if len(partsAfter) > 1 {
											fieldsAfter := strings.Fields(partsAfter[1])
											if len(fieldsAfter) >= 9 {
												inAfter, _ := strconv.ParseUint(fieldsAfter[0], 10, 64)
												outAfter, _ := strconv.ParseUint(fieldsAfter[8], 10, 64)

												// Add to total
												bytesInBefore += bytesIn
												bytesOutBefore += bytesOut
												bytesInAfter += inAfter
												bytesOutAfter += outAfter
											}
										}
									}
								}
							}
						}
					}
				}

				// Calculate speed
				inSpeed := bytesInAfter - bytesInBefore
				outSpeed := bytesOutAfter - bytesOutBefore

				// Store raw values
				downloadSpeedRaw = inSpeed
				uploadSpeedRaw = outSpeed

				// Format output
				if inSpeed > 1024*1024 {
					downloadSpeed = fmt.Sprintf("%.2f MB/s", float64(inSpeed)/1024/1024)
				} else if inSpeed > 1024 {
					downloadSpeed = fmt.Sprintf("%.2f kB/s", float64(inSpeed)/1024)
				} else {
					downloadSpeed = fmt.Sprintf("%d B/s", inSpeed)
				}

				if outSpeed > 1024*1024 {
					uploadSpeed = fmt.Sprintf("%.2f MB/s", float64(outSpeed)/1024/1024)
				} else if outSpeed > 1024 {
					uploadSpeed = fmt.Sprintf("%.2f kB/s", float64(outSpeed)/1024)
				} else {
					uploadSpeed = fmt.Sprintf("%d B/s", outSpeed)
				}

				total := inSpeed + outSpeed
				if total > 1024*1024 {
					totalBandwidth = fmt.Sprintf("%.2f MB/s", float64(total)/1024/1024)
				} else if total > 1024 {
					totalBandwidth = fmt.Sprintf("%.2f kB/s", float64(total)/1024)
				} else {
					totalBandwidth = fmt.Sprintf("%d B/s", total)
				}
			}
		}

		// If /proc/net/dev didn't work, try with other tools
		if downloadSpeedRaw == 0 && uploadSpeedRaw == 0 {
			// Try using ifstat
			cmd := exec.Command("sh", "-c", "which ifstat && ifstat -n -b 1 1")
			output, err := cmd.Output()
			if err == nil {
				lines := strings.Split(string(output), "\n")
				if len(lines) >= 3 {
					// Parse the third line which contains the values
					fields := strings.Fields(lines[2])
					if len(fields) >= 2 {
						in, err1 := strconv.ParseFloat(fields[0], 64)
						out, err2 := strconv.ParseFloat(fields[1], 64)
						if err1 == nil && err2 == nil {
							// ifstat outputs in KB/s, convert to bytes
							inBytes := uint64(in * 1024)
							outBytes := uint64(out * 1024)

							// Store raw values
							downloadSpeedRaw = inBytes
							uploadSpeedRaw = outBytes

							// Format output
							if inBytes > 1024*1024 {
								downloadSpeed = fmt.Sprintf("%.2f MB/s", float64(inBytes)/1024/1024)
							} else if inBytes > 1024 {
								downloadSpeed = fmt.Sprintf("%.2f kB/s", float64(inBytes)/1024)
							} else {
								downloadSpeed = fmt.Sprintf("%d B/s", inBytes)
							}

							if outBytes > 1024*1024 {
								uploadSpeed = fmt.Sprintf("%.2f MB/s", float64(outBytes)/1024/1024)
							} else if outBytes > 1024 {
								uploadSpeed = fmt.Sprintf("%.2f kB/s", float64(outBytes)/1024)
							} else {
								uploadSpeed = fmt.Sprintf("%d B/s", outBytes)
							}

							total := inBytes + outBytes
							if total > 1024*1024 {
								totalBandwidth = fmt.Sprintf("%.2f MB/s", float64(total)/1024/1024)
							} else if total > 1024 {
								totalBandwidth = fmt.Sprintf("%.2f kB/s", float64(total)/1024)
							} else {
								totalBandwidth = fmt.Sprintf("%d B/s", total)
							}
						}
					}
				}
			}
		}
	case "windows":
		// Windows network stats using PowerShell
		cmd := exec.Command("powershell", "-Command",
			"(Get-NetAdapterStatistics)[0] | Select-Object ReceivedBytes, SentBytes | ConvertTo-Json")
		output, err := cmd.Output()
		if err == nil {
			// Make a note of first sample time
			time.Sleep(1 * time.Second)

			cmd := exec.Command("powershell", "-Command",
				"(Get-NetAdapterStatistics)[0] | Select-Object ReceivedBytes, SentBytes | ConvertTo-Json")
			outputAfter, err := cmd.Output()
			if err == nil {
				// Parse JSON (simplified)
				outputStr := string(output)
				outputAfterStr := string(outputAfter)

				// Basic extraction (in a real implementation use proper JSON parsing)
				var bytesInBefore, bytesOutBefore, bytesInAfter, bytesOutAfter uint64

				if strings.Contains(outputStr, "ReceivedBytes") {
					strIn := outputStr[strings.Index(outputStr, "ReceivedBytes")+15:]
					strIn = strIn[:strings.Index(strIn, ",")]
					bytesInBefore, _ = strconv.ParseUint(strings.TrimSpace(strIn), 10, 64)
				}

				if strings.Contains(outputStr, "SentBytes") {
					strOut := outputStr[strings.Index(outputStr, "SentBytes")+11:]
					strOut = strOut[:strings.Index(strOut, "\n")]
					bytesOutBefore, _ = strconv.ParseUint(strings.TrimSpace(strOut), 10, 64)
				}

				if strings.Contains(outputAfterStr, "ReceivedBytes") {
					strIn := outputAfterStr[strings.Index(outputAfterStr, "ReceivedBytes")+15:]
					strIn = strIn[:strings.Index(strIn, ",")]
					bytesInAfter, _ = strconv.ParseUint(strings.TrimSpace(strIn), 10, 64)
				}

				if strings.Contains(outputAfterStr, "SentBytes") {
					strOut := outputAfterStr[strings.Index(outputAfterStr, "SentBytes")+11:]
					strOut = strOut[:strings.Index(strOut, "\n")]
					bytesOutAfter, _ = strconv.ParseUint(strings.TrimSpace(strOut), 10, 64)
				}

				// Calculate speeds
				inSpeed := bytesInAfter - bytesInBefore
				outSpeed := bytesOutAfter - bytesOutBefore

				// Store raw values
				downloadSpeedRaw = inSpeed
				uploadSpeedRaw = outSpeed

				// Format output
				if inSpeed > 1024*1024 {
					downloadSpeed = fmt.Sprintf("%.2f MB/s", float64(inSpeed)/1024/1024)
				} else if inSpeed > 1024 {
					downloadSpeed = fmt.Sprintf("%.2f kB/s", float64(inSpeed)/1024)
				} else {
					downloadSpeed = fmt.Sprintf("%d B/s", inSpeed)
				}

				if outSpeed > 1024*1024 {
					uploadSpeed = fmt.Sprintf("%.2f MB/s", float64(outSpeed)/1024/1024)
				} else if outSpeed > 1024 {
					uploadSpeed = fmt.Sprintf("%.2f kB/s", float64(outSpeed)/1024)
				} else {
					uploadSpeed = fmt.Sprintf("%d B/s", outSpeed)
				}

				total := inSpeed + outSpeed
				if total > 1024*1024 {
					totalBandwidth = fmt.Sprintf("%.2f MB/s", float64(total)/1024/1024)
				} else if total > 1024 {
					totalBandwidth = fmt.Sprintf("%.2f kB/s", float64(total)/1024)
				} else {
					totalBandwidth = fmt.Sprintf("%d B/s", total)
				}
			}
		}

		// If first method failed, try another approach
		if downloadSpeedRaw == 0 && uploadSpeedRaw == 0 {
			// Try an alternative method using Get-Counter
			cmd := exec.Command("powershell", "-Command",
				"$start = (Get-Counter '\\Network Interface(*)\\Bytes Received/sec').CounterSamples; "+
					"Start-Sleep -Seconds 1; "+
					"$end = (Get-Counter '\\Network Interface(*)\\Bytes Received/sec').CounterSamples; "+
					"$down = ($end | Where-Object {$_.CookedValue -gt 0} | Measure-Object -Property CookedValue -Sum).Sum; "+
					"$start = (Get-Counter '\\Network Interface(*)\\Bytes Sent/sec').CounterSamples; "+
					"Start-Sleep -Seconds 1; "+
					"$end = (Get-Counter '\\Network Interface(*)\\Bytes Sent/sec').CounterSamples; "+
					"$up = ($end | Where-Object {$_.CookedValue -gt 0} | Measure-Object -Property CookedValue -Sum).Sum; "+
					"'{0},{1}' -f $down,$up")
			output, err := cmd.Output()
			if err == nil {
				parts := strings.Split(strings.TrimSpace(string(output)), ",")
				if len(parts) == 2 {
					down, err1 := strconv.ParseFloat(parts[0], 64)
					up, err2 := strconv.ParseFloat(parts[1], 64)
					if err1 == nil && err2 == nil {
						// Store raw values
						downloadSpeedRaw = uint64(down)
						uploadSpeedRaw = uint64(up)

						// Format output
						if down > 1024*1024 {
							downloadSpeed = fmt.Sprintf("%.2f MB/s", down/1024/1024)
						} else if down > 1024 {
							downloadSpeed = fmt.Sprintf("%.2f kB/s", down/1024)
						} else {
							downloadSpeed = fmt.Sprintf("%.0f B/s", down)
						}

						if up > 1024*1024 {
							uploadSpeed = fmt.Sprintf("%.2f MB/s", up/1024/1024)
						} else if up > 1024 {
							uploadSpeed = fmt.Sprintf("%.2f kB/s", up/1024)
						} else {
							uploadSpeed = fmt.Sprintf("%.0f B/s", up)
						}

						total := down + up
						if total > 1024*1024 {
							totalBandwidth = fmt.Sprintf("%.2f MB/s", total/1024/1024)
						} else if total > 1024 {
							totalBandwidth = fmt.Sprintf("%.2f kB/s", total/1024)
						} else {
							totalBandwidth = fmt.Sprintf("%.0f B/s", total)
						}
					}
				}
			}
		}
	}

	resources["upload_speed"] = uploadSpeed
	resources["download_speed"] = downloadSpeed
	resources["total_bandwidth"] = totalBandwidth

	// Add raw numbers for more precise frontend calculations
	resources["upload_bytes_per_second"] = uploadSpeedRaw
	resources["download_bytes_per_second"] = downloadSpeedRaw

	return c.JSON(resources)
}

// DeleteAllLogs deletes all request logs, with optional hostname filtering
func DeleteAllLogs(c *fiber.Ctx) error {
	// Get hostname filter if provided
	hostname := c.Query("hostname", "")

	var query string
	var args []interface{}

	if hostname != "" {
		query = "DELETE FROM request_logs WHERE hostname = ?"
		args = append(args, hostname)
	} else {
		query = "DELETE FROM request_logs"
	}

	// Execute the delete query
	result, err := database.DB.Exec(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error while deleting logs",
		})
	}

	// Get the number of rows affected
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Error getting affected rows count",
		})
	}

	return c.JSON(fiber.Map{
		"success":       true,
		"message":       fmt.Sprintf("Successfully deleted %d log entries", rowsAffected),
		"rows_affected": rowsAffected,
	})
}
