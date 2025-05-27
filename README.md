# Strong Manager - Advanced Reverse Proxy with Admin Panel

[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Strong Manager is a high-performance reverse proxy server with an intuitive web-based admin panel. It provides advanced load balancing, request filtering, real-time monitoring, and comprehensive logging capabilities.

## 🚀 Features

### Core Proxy Features
- **Load Balancing**: Weighted round-robin algorithm with health checks
- **DNS-based Routing**: Route requests based on hostname patterns
- **Request Filtering**: IP-based, path-based, and DNS-based filtering rules
- **Rate Limiting**: Configurable rate limiting per DNS rule
- **Health Monitoring**: Automatic backend health checks
- **SSL/TLS Support**: HTTPS termination and backend SSL support

### Admin Panel Features
- **Real-time Dashboard**: Live traffic statistics and system metrics
- **DNS Rules Management**: Create, edit, and manage routing rules
- **Filter Rules**: Advanced request filtering with multiple action types
- **User Management**: Role-based access control
- **Alert System**: Email and webhook notifications
- **Database Management**: Backup, restore, and maintenance tools
- **Log Analysis**: Comprehensive request logging with filtering and pagination

### Monitoring & Analytics
- **Traffic Statistics**: Request counts, success rates, latency metrics
- **System Resources**: CPU, memory, disk, and network monitoring
- **Request Logs**: Detailed logging with user-agent, IP, and timing data
- **Filter Logs**: Track blocked/filtered requests
- **Performance Metrics**: Backend-specific performance tracking

## 📋 Prerequisites

- **Go 1.21+** for the backend server
- **Node.js 18+** and **npm** for the admin panel
- **SQLite** (included) or **MySQL/PostgreSQL** for data storage

## 🛠️ Installation

### Backend Setup

```bash
# Navigate to backend directory
cd go-strong-manager

# Install dependencies
go mod download

# Build the application
go build -o strong-manager

# Run the server
./strong-manager
```

### Admin Panel Setup

```bash
# Navigate to admin panel directory
cd strong-manager-admin-panel

# Install dependencies
npm install

# Build for production
npm run build

# Serve the built files (or use your preferred web server)
npm run preview
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the `go-strong-manager` directory:

```env
# Server Configuration
PROXY_PORT=8080
ADMIN_PORT=8089
DB_PATH=./strong-manager.db

# Security
JWT_SECRET=your-super-secret-jwt-key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure-password

# Logging
LOG_LEVEL=info
LOG_BATCH_SIZE=50
LOG_FLUSH_TIME=5s

# Rate Limiting
DEFAULT_RATE_LIMIT=1000
DEFAULT_RATE_PERIOD=3600
```

### Admin Panel Configuration

Create a `.env` file in the `strong-manager-admin-panel` directory:

```env
VITE_API_URL=http://localhost:8089
```

## 🚦 Usage

### 1. Access the Admin Panel

Open your browser and navigate to `http://localhost:3000` (development) or your configured domain.

**Default Credentials:**
- Email: `admin@example.com`
- Password: `admin123`

### 2. Configure DNS Rules

1. Go to **DNS Rules** in the admin panel
2. Click **Add Rule** to create a new routing rule
3. Configure:
   - **Hostname**: Domain to route (e.g., `api.example.com`)
   - **Backend URLs**: Target servers with weights
   - **Rate Limiting**: Optional request rate limits
   - **Health Checks**: Enable automatic health monitoring

### 3. Set Up Request Filtering

1. Navigate to **Request Rules**
2. Create filter rules based on:
   - **IP Address**: Block or allow specific IPs/ranges
   - **URL Path**: Filter requests by path patterns
   - **DNS/Hostname**: Domain-based filtering
3. Configure actions:
   - **Redirect**: Send to another URL
   - **Block**: Return error responses
   - **Custom**: Return custom status codes

### 4. Monitor Traffic

- **Stats Dashboard**: Real-time traffic overview
- **Request Logs**: Detailed request history with filtering
- **Filter Logs**: Track blocked requests
- **System Metrics**: Server resource monitoring

## 📊 API Endpoints

### Proxy Server (Port 8080)
- All incoming requests are processed by the reverse proxy

### Admin API (Port 8089)
- `POST /admin/api/login` - Authentication
- `GET /admin/api/config/dns_rules` - DNS rules management
- `GET /admin/api/filter-rules` - Filter rules management
- `GET /admin/metrics` - Traffic statistics
- `GET /admin/metrics/logs` - Request logs
- `GET /admin/health` - Health check

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client        │───▶│  Strong Manager  │───▶│  Backend Servers│
│   Requests      │    │  Reverse Proxy   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   Admin Panel    │
                       │  (Web Interface) │
                       └──────────────────┘
```

### Components

- **Reverse Proxy**: High-performance Go server handling client requests
- **Admin API**: RESTful API for configuration and monitoring
- **Web Interface**: React-based admin panel with real-time updates
- **Database**: SQLite/MySQL for configuration and logs
- **Filter Engine**: Request filtering and rate limiting
- **Health Monitor**: Backend health checking system

## 🔧 Advanced Configuration

### Custom Load Balancing

```go
// Example: Custom backend selection algorithm
type CustomSelector struct {
    // Your custom logic here
}

func (s *CustomSelector) SelectBackend(backends []Backend) *Backend {
    // Implement your selection logic
    return &backends[0]
}
```

### Custom Filters

```go
// Example: Custom request filter
func CustomIPFilter(r *http.Request) bool {
    clientIP := getClientIP(r)
    // Your custom filtering logic
    return isAllowed(clientIP)
}
```

## 📈 Performance

- **Throughput**: Handles 10,000+ requests per second
- **Latency**: Sub-millisecond proxy overhead
- **Memory**: Efficient memory usage with connection pooling
- **Scalability**: Horizontal scaling support

## 🛡️ Security Features

- **JWT Authentication**: Secure admin panel access
- **Rate Limiting**: Prevent abuse and DDoS attacks
- **Request Filtering**: Block malicious requests
- **Input Validation**: Comprehensive input sanitization
- **CORS Protection**: Configurable CORS policies

## 🔍 Monitoring & Debugging

### Logs

```bash
# View proxy logs
tail -f logs/proxy.log

# View admin API logs
tail -f logs/admin.log

# View filter logs
tail -f logs/filter.log
```

### Health Checks

```bash
# Check proxy health
curl http://localhost:8089/admin/health

# Check specific backend
curl http://localhost:8089/admin/health/backend/1
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Backend development
cd go-strong-manager
go run main.go

# Frontend development
cd strong-manager-admin-panel
npm run dev
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Wiki](https://github.com/yourusername/strong-manager/wiki)
- **Issues**: [GitHub Issues](https://github.com/yourusername/strong-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/strong-manager/discussions)

## 🙏 Acknowledgments

- [Fiber](https://gofiber.io/) - Fast HTTP framework for Go
- [React](https://reactjs.org/) - Frontend library
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [React Query](https://tanstack.com/query) - Data fetching library

## 📊 Project Status

- ✅ Core proxy functionality
- ✅ Admin panel interface
- ✅ Request filtering system
- ✅ Real-time monitoring
- ✅ Database management
- 🚧 Docker containerization
- 🚧 Kubernetes deployment
- 📋 SSL/TLS automation
- 📋 Plugin system

---

**Made with ❤️ by the Strong Manager Team** 