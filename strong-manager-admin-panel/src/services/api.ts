import axios from 'axios';

// API Base URL - admin API runs on port 8089
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8089';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Unauthorized, clear token and redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Authentication API
export const authAPI = {
  login: (email: string, password: string) => 
    api.post('/admin/api/login', { email, password }),
  
  signup: (email: string, password: string) => 
    api.post('/admin/api/signup', { email, password }),
};

// Users API
export const usersAPI = {
  getAll: () => api.get('/admin/api/users'),
  create: (user: { email: string, password: string, role: string }) => 
    api.post('/admin/api/users', user),
  update: (id: number, user: { email?: string, password?: string, role?: string }) => 
    api.patch(`/admin/api/users/${id}`, user),
  delete: (id: number) => api.delete(`/admin/api/users/${id}`),
};

// DNS Rules API
export const dnsRulesAPI = {
  getAll: () => api.get('/admin/api/config/dns_rules'),
  create: (rule: { 
    hostname: string, 
    target_backend_urls: { url: string, weight: number, isActive: boolean }[],
    rate_limit_enabled?: boolean,
    rate_limit_quota?: number,
    rate_limit_period?: number,
    log_retention_days?: number,
    health_check_enabled?: boolean
  }) => api.post('/admin/api/config/dns_rules', rule),
  update: (id: number, rule: { 
    hostname?: string, 
    target_backend_urls?: { url: string, weight: number, isActive: boolean }[],
    rate_limit_enabled?: boolean,
    rate_limit_quota?: number,
    rate_limit_period?: number,
    log_retention_days?: number,
    health_check_enabled?: boolean
  }) => api.patch(`/admin/api/config/dns_rules/${id}`, rule),
  delete: (id: number) => api.delete(`/admin/api/config/dns_rules/${id}`),
};

// Alerts API
export const alertsAPI = {
  getAll: () => api.get('/admin/api/alerts'),
  getDNSRules: () => api.get('/admin/api/alerts/dns-rules'),
  create: (alert: { type: string, destination: string, threshold: number, enabled: boolean, dns_rule_id?: number }) => 
    api.post('/admin/api/alerts', alert),
  update: (id: number, alert: { type?: string, destination?: string, threshold?: number, enabled?: boolean, dns_rule_id?: number }) => 
    api.patch(`/admin/api/alerts/${id}`, alert),
  delete: (id: number) => api.delete(`/admin/api/alerts/${id}`),
};

// Health & Metrics API - These routes must include the /admin prefix
export const healthAPI = {
  getHealth: () => api.get('/admin/health'),
  getMetrics: () => api.get('/admin/metrics'),
  getMetricsForDNS: (hostname: string) => api.get(`/admin/metrics?hostname=${hostname}`),
  getRecentLogs: (limit = 10, hostname?: string, page = 1, filters?: Record<string, string>) => {
    let url = `/admin/metrics/logs?limit=${limit}&page=${page}`;
    
    if (hostname && hostname !== 'all') {
      url += `&hostname=${hostname}`;
    }
    
    // Add any additional filters
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          url += `&${key}=${encodeURIComponent(value)}`;
        }
      });
    }
    
    return api.get(url);
  },
  getSystemResources: () => api.get('/admin/metrics/system'),
  deleteAllLogs: (hostname?: string) => {
    let url = '/admin/metrics/logs/delete-all';
    
    if (hostname && hostname !== 'all') {
      url += `?hostname=${encodeURIComponent(hostname)}`;
    }
    
    return api.delete(url);
  }
};

// Database Operations API
export const databaseAPI = {
  getBackups: () => api.get('/admin/database/backups'),
  createBackup: () => api.post('/admin/database/backup'),
  restoreBackup: (filename: string) => api.post('/admin/database/restore', { filename }),
  deleteBackup: (filename: string) => api.delete('/admin/database/backups', { data: { filename } }),
  resetDatabase: () => api.post('/admin/database/reset'),
  getDownloadUrl: (filename: string) => `${API_URL}/admin/database/download?filename=${encodeURIComponent(filename)}`,
  uploadBackup: (formData: FormData) => api.post('/admin/database/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
};

// Filter Rules API
export const filterRulesAPI = {
  getAll: () => api.get('/admin/api/filter-rules'),
  create: (rule: {
    name: string;
    match_type: 'ip' | 'path' | 'dns';
    match_value: string;
    action_type: 'redirect' | 'bad_request' | 'too_many' | 'custom';
    action_value: string;
    status_code: number;
    priority: number;
    is_active: boolean;
  }) => api.post('/admin/api/filter-rules', rule),
  update: (id: number, rule: {
    name?: string;
    match_type?: 'ip' | 'path' | 'dns';
    match_value?: string;
    action_type?: 'redirect' | 'bad_request' | 'too_many' | 'custom';
    action_value?: string;
    status_code?: number;
    priority?: number;
    is_active?: boolean;
  }) => api.patch(`/admin/api/filter-rules/${id}`, rule),
  delete: (id: number) => api.delete(`/admin/api/filter-rules/${id}`),
  toggle: (id: number) => api.patch(`/admin/api/filter-rules/${id}/toggle`),
  getLogs: (limit = 100, page = 1, filters?: Record<string, string>) => {
    let url = `/admin/api/filter-rules/logs?limit=${limit}&page=${page}`;
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          url += `&${key}=${encodeURIComponent(value)}`;
        }
      });
    }
    
    return api.get(url);
  },
};

export default api; 