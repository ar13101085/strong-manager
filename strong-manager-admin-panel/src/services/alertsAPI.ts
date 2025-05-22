import api from './api';

// Alert type definition
export type AlertType = 'email' | 'webhook';

export interface Alert {
  id?: number;
  type: AlertType;
  destination: string;
  threshold: number;
  enabled: boolean;
  created_at?: string;
}

export interface AlertEvent {
  id: number;
  alert_id: number;
  message: string;
  timestamp: string;
  sent: boolean;
}

const alertsAPI = {
  // Get all alerts
  getAll: () => api.get('/api/alerts'),

  // Create a new alert
  create: (alert: Alert) => api.post('/api/alerts', alert),

  // Update an existing alert
  update: (id: number, alert: Partial<Alert>) => api.patch(`/api/alerts/${id}`, alert),

  // Delete an alert
  delete: (id: number) => api.delete(`/api/alerts/${id}`),
};

export default alertsAPI; 