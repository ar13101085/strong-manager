import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dnsRulesAPI, alertsAPI } from '../services/api';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  RiAddLine, 
  RiEditLine, 
  RiDeleteBinLine, 
  RiCheckboxCircleLine, 
  RiCloseCircleLine,
  RiSearchLine,
  RiNotification3Line,
  RiMailLine,
  RiGlobalLine,
  RiEarthLine
} from 'react-icons/ri';
import { Switch } from '@radix-ui/react-switch';
import { Button } from '../components/ui/button';

interface Backend {
  id?: number;
  url: string;
  weight: number;
  isActive: boolean;
}

interface DNSRule {
  id: number;
  hostname: string;
  target_backend_urls: Backend[];
  rate_limit_enabled?: boolean;
  rate_limit_quota?: number;
  rate_limit_period?: number;
  log_retention_days?: number;
  health_check_enabled?: boolean;
}

// Define alert type
export type AlertType = 'email' | 'webhook';

// Define Alert interface
export interface Alert {
  id?: number;
  dns_rule_id: number;
  hostname?: string;
  type: AlertType;
  destination: string;
  threshold: number;
  enabled: boolean;
  created_at?: string;
}

// Define form schema with Zod
const alertSchema = z.object({
  dns_rule_id: z.number(),
  type: z.enum(['email', 'webhook'] as const),
  destination: z
    .string()
    .min(1, { message: 'Destination is required' })
    .refine(
      (val) => {
        // If email, validate email format
        if (val.includes('@')) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        }
        // If webhook, validate URL format
        return /^https?:\/\//.test(val);
      },
      {
        message: 'Invalid email or URL format',
      }
    ),
  threshold: z
    .number()
    .min(1, { message: 'Threshold must be at least 1' })
    .max(1000, { message: 'Threshold must be at most 1000' }),
  enabled: z.boolean(),
});

type AlertFormValues = z.infer<typeof alertSchema>;

const Config: React.FC = () => {
  const queryClient = useQueryClient();
  
  // Form states
  const [newDNSRule, setNewDNSRule] = useState<{
    hostname: string;
    target_backend_urls: { url: string; weight: number; isActive: boolean }[];
    rate_limit_enabled?: boolean;
    rate_limit_quota?: number;
    rate_limit_period?: number;
    log_retention_days?: number;
    health_check_enabled?: boolean;
    alert_enabled?: boolean;
    alert_type?: AlertType;
    alert_destination?: string;
    alert_threshold?: number;
  }>({
    hostname: '',
    target_backend_urls: [{ url: '', weight: 10, isActive: true }],
  });

  const [editingDNSRule, setEditingDNSRule] = useState<DNSRule | null>(null);
  const [showDNSForm, setShowDNSForm] = useState(false);

  // Alert states
  const [isEditingAlert, setIsEditingAlert] = useState(false);
  const [currentAlertId, setCurrentAlertId] = useState<number | null>(null);
  const [selectedDNSRuleId, setSelectedDNSRuleId] = useState<number | null>(null);

  // React Hook Form with Zod validation for Alerts
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AlertFormValues>({
    resolver: zodResolver(alertSchema),
    defaultValues: {
      dns_rule_id: 0,
      type: 'email',
      destination: '',
      threshold: 5,
      enabled: true,
    },
  });

  // Search states
  const [dnsSearch, setDNSSearch] = useState('');

  // Selection states
  const [selectedDNSRules, setSelectedDNSRules] = useState<number[]>([]);

  // Fetch DNS rules
  const { data: dnsRules, isLoading: dnsLoading } = useQuery<DNSRule[]>({
    queryKey: ['dns-rules'],
    queryFn: async () => {
      const response = await dnsRulesAPI.getAll();
      return response.data;
    },
  });

  // Fetch alerts
  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await alertsAPI.getAll();
      return response.data;
    },
  });

  // Mutations
  const createDNSRule = useMutation({
    mutationFn: (data: typeof newDNSRule) => dnsRulesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-rules'] });
      resetDNSRuleForm();
      setShowDNSForm(false);
    },
  });

  const updateDNSRule = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DNSRule> }) => 
      dnsRulesAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-rules'] });
      setEditingDNSRule(null);
      setShowDNSForm(false);
    },
  });

  const deleteDNSRule = useMutation({
    mutationFn: (id: number) => dnsRulesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-rules'] });
      setSelectedDNSRules([]);
    },
  });

  // Alert mutations
  const createAlert = useMutation({
    mutationFn: (values: AlertFormValues) => alertsAPI.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
  
  const updateAlert = useMutation({
    mutationFn: ({ id, values }: { id: number; values: AlertFormValues }) => 
      alertsAPI.update(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setIsEditingAlert(false);
      setCurrentAlertId(null);
    },
  });
  
  const deleteAlert = useMutation({
    mutationFn: (id: number) => alertsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // Form handlers
  const handleDNSRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Handle DNS rule creation/update
    if (editingDNSRule) {
      await updateDNSRule.mutateAsync({ 
        id: editingDNSRule.id, 
        data: {
          hostname: newDNSRule.hostname,
          target_backend_urls: newDNSRule.target_backend_urls,
          rate_limit_enabled: newDNSRule.rate_limit_enabled,
          rate_limit_quota: newDNSRule.rate_limit_quota,
          rate_limit_period: newDNSRule.rate_limit_period,
          log_retention_days: newDNSRule.log_retention_days,
          health_check_enabled: newDNSRule.health_check_enabled
        }
      });
      
      // Handle alert creation/update if enabled
      if (newDNSRule.alert_enabled && newDNSRule.alert_destination) {
        const existingAlert = alerts?.find((alert: Alert) => alert.dns_rule_id === editingDNSRule.id);
        
        if (existingAlert) {
          // Update existing alert
          await updateAlert.mutateAsync({ 
            id: existingAlert.id!, 
            values: {
              dns_rule_id: editingDNSRule.id,
              type: newDNSRule.alert_type || 'email',
              destination: newDNSRule.alert_destination,
              threshold: newDNSRule.alert_threshold || 5,
              enabled: true
            }
          });
        } else {
          // Create new alert
          await createAlert.mutateAsync({
            dns_rule_id: editingDNSRule.id,
            type: newDNSRule.alert_type || 'email',
            destination: newDNSRule.alert_destination,
            threshold: newDNSRule.alert_threshold || 5,
            enabled: true
          });
        }
      } else if (!newDNSRule.alert_enabled) {
        // If alert is disabled, check if there's an existing alert to delete
        const existingAlert = alerts?.find((alert: Alert) => alert.dns_rule_id === editingDNSRule.id);
        if (existingAlert) {
          await deleteAlert.mutateAsync(existingAlert.id!);
        }
      }
    } else {
      // Create new DNS rule
      const result = await createDNSRule.mutateAsync(newDNSRule);
      
      // Create alert if enabled
      if (newDNSRule.alert_enabled && newDNSRule.alert_destination && result.data?.id) {
        await createAlert.mutateAsync({
          dns_rule_id: result.data.id,
          type: newDNSRule.alert_type || 'email',
          destination: newDNSRule.alert_destination,
          threshold: newDNSRule.alert_threshold || 5,
          enabled: true
        });
      }
    }
    
    resetDNSRuleForm();
    setShowDNSForm(false);
  };

  const resetDNSRuleForm = () => {
    setNewDNSRule({
      hostname: '',
      target_backend_urls: [{ url: '', weight: 10, isActive: true }],
      rate_limit_enabled: false,
      rate_limit_quota: 100,
      rate_limit_period: 60,
      log_retention_days: 30,
      health_check_enabled: false,
      alert_enabled: false,
      alert_type: 'email',
      alert_destination: '',
      alert_threshold: 5
    });
    setEditingDNSRule(null);
  };

  const addBackendField = () => {
    setNewDNSRule({
      ...newDNSRule,
      target_backend_urls: [
        ...newDNSRule.target_backend_urls,
        { url: '', weight: 10, isActive: true },
      ],
    });
  };

  const removeBackendField = (index: number) => {
    setNewDNSRule({
      ...newDNSRule,
      target_backend_urls: newDNSRule.target_backend_urls.filter((_, i) => i !== index),
    });
  };

  const updateBackendField = (index: number, field: string, value: string | number | boolean) => {
    const newBackends = [...newDNSRule.target_backend_urls];
    newBackends[index] = { 
      ...newBackends[index], 
      [field]: field === 'weight' ? Number(value) : value 
    };
    
    setNewDNSRule({
      ...newDNSRule,
      target_backend_urls: newBackends,
    });
  };

  const editDNSRule = (rule: DNSRule) => {
    setEditingDNSRule(rule);
    
    // Find any existing alert for this DNS rule
    const existingAlert = alerts?.find((alert: Alert) => alert.dns_rule_id === rule.id);
    
    setNewDNSRule({
      hostname: rule.hostname,
      target_backend_urls: rule.target_backend_urls.map(b => ({
        url: b.url,
        weight: b.weight,
        isActive: b.isActive,
      })),
      rate_limit_enabled: rule.rate_limit_enabled,
      rate_limit_quota: rule.rate_limit_quota,
      rate_limit_period: rule.rate_limit_period,
      log_retention_days: rule.log_retention_days,
      health_check_enabled: rule.health_check_enabled,
      alert_enabled: !!existingAlert,
      alert_type: existingAlert?.type || 'email',
      alert_destination: existingAlert?.destination || '',
      alert_threshold: existingAlert?.threshold || 5
    });
    setShowDNSForm(true);
  };

  const handleDNSRuleSelect = (id: number) => {
    setSelectedDNSRules(prev => 
      prev.includes(id) 
        ? prev.filter(itemId => itemId !== id) 
        : [...prev, id]
    );
  };

  const handleSelectAllDNSRules = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked && dnsRules) {
      setSelectedDNSRules(dnsRules.map(rule => rule.id));
    } else {
      setSelectedDNSRules([]);
    }
  };

  const deleteSelectedDNSRules = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedDNSRules.length} DNS rules?`)) {
      selectedDNSRules.forEach(id => deleteDNSRule.mutate(id));
    }
  };

  const editDNSRuleWithAlertFocus = (rule: DNSRule) => {
    // First edit the DNS rule as normal
    editDNSRule(rule);
    
    // Then scroll to the alert section automatically
    setTimeout(() => {
      document.getElementById('alert-enabled')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Filter DNS rules based on search
  const filteredDNSRules = dnsRules?.filter(rule =>
    rule.hostname.toLowerCase().includes(dnsSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
          <div className="flex space-x-2">
            <button
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-100 text-blue-700"
            >
              DNS Rules
            </button>
          </div>
        </div>
      </div>

      {/* DNS Rules Content */}
      <div className="space-y-6">
        {/* Form Card */}
        {showDNSForm && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-800 mb-4">
                {editingDNSRule ? 'Edit DNS Rule' : 'Create DNS Rule'}
              </h2>
              
              <form onSubmit={handleDNSRuleSubmit}>
                <div className="space-y-6">
                  {/* Basic Info Card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-md font-medium text-gray-800 mb-3">Basic Information</h3>
                    <div>
                      <label htmlFor="hostname" className="block text-sm font-medium text-gray-700 mb-1">
                        Hostname
                      </label>
                      <input
                        type="text"
                        name="hostname"
                        id="hostname"
                        required
                        placeholder="example.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={newDNSRule.hostname}
                        onChange={(e) => setNewDNSRule({ ...newDNSRule, hostname: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Target Backends Card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-md font-medium text-gray-800 mb-3">Target Backends</h3>
                    <div className="space-y-3">
                      {newDNSRule.target_backend_urls.map((backend, index) => (
                        <div key={index} className="flex flex-wrap gap-2 mb-3 items-center">
                          <div className="flex-1">
                            <input
                              type="text"
                              required
                              placeholder="http://backend.example.com:8080"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={backend.url}
                              onChange={(e) => updateBackendField(index, 'url', e.target.value)}
                            />
                          </div>
                          <div className="w-20">
                            <input
                              type="number"
                              min="1"
                              required
                              placeholder="Weight"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={backend.weight}
                              onChange={(e) => updateBackendField(index, 'weight', e.target.value)}
                            />
                          </div>
                          <div className="flex items-center">
                            <label className="inline-flex items-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                checked={backend.isActive}
                                onChange={(e) => updateBackendField(index, 'isActive', e.target.checked)}
                              />
                              <span className="ml-2 text-sm text-gray-700">Active</span>
                            </label>
                            {newDNSRule.target_backend_urls.length > 1 && (
                              <button
                                type="button"
                                className="ml-2 text-red-600 hover:text-red-800"
                                onClick={() => removeBackendField(index)}
                              >
                                <RiDeleteBinLine size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                        onClick={addBackendField}
                      >
                        <RiAddLine className="mr-1" size={16} />
                        Add Backend
                      </button>
                    </div>
                  </div>

                  {/* Rate Limiting Card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-md font-medium text-gray-800 mb-3">Rate Limiting Settings</h3>
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="rate-limit-enabled"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          checked={newDNSRule.rate_limit_enabled}
                          onChange={(e) => setNewDNSRule({ ...newDNSRule, rate_limit_enabled: e.target.checked })}
                        />
                        <label htmlFor="rate-limit-enabled" className="ml-2 block text-sm text-gray-700">
                          Enable Rate Limiting
                        </label>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="rate-limit-quota" className="block text-sm font-medium text-gray-700 mb-1">
                            Requests Per Period
                          </label>
                          <input
                            type="number"
                            name="rate-limit-quota"
                            id="rate-limit-quota"
                            min="1"
                            placeholder="100"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={newDNSRule.rate_limit_quota || ''}
                            onChange={(e) => setNewDNSRule({ 
                              ...newDNSRule, 
                              rate_limit_quota: e.target.value ? parseInt(e.target.value) : 0 
                            })}
                            disabled={!newDNSRule.rate_limit_enabled}
                          />
                        </div>
                        
                        <div>
                          <label htmlFor="rate-limit-period" className="block text-sm font-medium text-gray-700 mb-1">
                            Period (seconds)
                          </label>
                          <input
                            type="number"
                            name="rate-limit-period"
                            id="rate-limit-period"
                            min="1"
                            placeholder="60"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={newDNSRule.rate_limit_period || ''}
                            onChange={(e) => setNewDNSRule({ 
                              ...newDNSRule, 
                              rate_limit_period: e.target.value ? parseInt(e.target.value) : 0 
                            })}
                            disabled={!newDNSRule.rate_limit_enabled}
                          />
                        </div>
                      </div>
                      
                      <p className="text-xs text-gray-500">
                        Rate limiting applies per client IP address. If disabled, the global default rate limit will be used.
                      </p>
                    </div>
                  </div>
                  
                  {/* Log Retention Card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-md font-medium text-gray-800 mb-3">Log Retention</h3>
                    <div>
                      <label htmlFor="log-retention-days" className="block text-sm font-medium text-gray-700 mb-1">
                        Retention Period (days)
                      </label>
                      <input
                        type="number"
                        name="log-retention-days"
                        id="log-retention-days"
                        min="1"
                        max="365"
                        placeholder="30"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={newDNSRule.log_retention_days || ''}
                        onChange={(e) => setNewDNSRule({ 
                          ...newDNSRule, 
                          log_retention_days: e.target.value ? parseInt(e.target.value) : 0 
                        })}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Number of days to keep request logs for this hostname. Leave empty to use the default (30 days).
                      </p>
                    </div>
                  </div>

                  {/* Health Check Settings Card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-md font-medium text-gray-800 mb-3">Health Check Settings</h3>
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="health-check-enabled"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          checked={newDNSRule.health_check_enabled}
                          onChange={(e) => setNewDNSRule({ ...newDNSRule, health_check_enabled: e.target.checked })}
                        />
                        <label htmlFor="health-check-enabled" className="ml-2 block text-sm text-gray-700">
                          Enable Health Checks
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Alert Settings Card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-md font-medium text-gray-800 mb-3">Alert Settings</h3>
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="alert-enabled"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          checked={newDNSRule.alert_enabled}
                          onChange={(e) => setNewDNSRule({ ...newDNSRule, alert_enabled: e.target.checked })}
                        />
                        <label htmlFor="alert-enabled" className="ml-2 block text-sm text-gray-700">
                          Enable Alerting
                        </label>
                      </div>

                      <div className="space-y-3">
                        {/* Alert Type */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Alert Type</label>
                          <div className="flex space-x-4">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                value="email"
                                checked={newDNSRule.alert_type === 'email'}
                                onChange={() => setNewDNSRule({ ...newDNSRule, alert_type: 'email' })}
                                className="mr-2 h-4 w-4 text-blue-600"
                                disabled={!newDNSRule.alert_enabled}
                              />
                              <span className="flex items-center">
                                <RiMailLine className="mr-1 text-gray-500" />
                                Email
                              </span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                value="webhook"
                                checked={newDNSRule.alert_type === 'webhook'}
                                onChange={() => setNewDNSRule({ ...newDNSRule, alert_type: 'webhook' })}
                                className="mr-2 h-4 w-4 text-blue-600"
                                disabled={!newDNSRule.alert_enabled}
                              />
                              <span className="flex items-center">
                                <RiGlobalLine className="mr-1 text-gray-500" />
                                Webhook
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Alert Destination */}
                        <div>
                          <label htmlFor="alert-destination" className="block text-sm font-medium text-gray-700 mb-1">
                            {newDNSRule.alert_type === 'email' ? 'Email Address' : 'Webhook URL'}
                          </label>
                          <input
                            type="text"
                            id="alert-destination"
                            placeholder={newDNSRule.alert_type === 'email' 
                              ? 'Enter email address' 
                              : 'Enter webhook URL (https://...)'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={newDNSRule.alert_destination || ''}
                            onChange={(e) => setNewDNSRule({ ...newDNSRule, alert_destination: e.target.value })}
                            disabled={!newDNSRule.alert_enabled}
                          />
                        </div>

                        {/* Alert Threshold */}
                        <div>
                          <label htmlFor="alert-threshold" className="block text-sm font-medium text-gray-700 mb-1">
                            Error Threshold
                          </label>
                          <input
                            type="number"
                            id="alert-threshold"
                            min="1"
                            placeholder="5"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={newDNSRule.alert_threshold || ''}
                            onChange={(e) => setNewDNSRule({ 
                              ...newDNSRule, 
                              alert_threshold: e.target.value ? parseInt(e.target.value) : 0 
                            })}
                            disabled={!newDNSRule.alert_enabled}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Alert will trigger when this many errors occur within a monitoring period
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex justify-end space-x-2 pt-4">
                    <button
                      type="button"
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                      onClick={() => {
                        resetDNSRuleForm();
                        setShowDNSForm(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      {createDNSRule.isPending || updateDNSRule.isPending
                        ? 'Saving...'
                        : editingDNSRule
                        ? 'Update Rule'
                        : 'Create Rule'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DNS Rules List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
            <h2 className="text-lg font-medium text-gray-800">DNS Rules</h2>
            
            <div className="flex items-center space-x-4">
              {selectedDNSRules.length > 0 && (
                <button
                  onClick={deleteSelectedDNSRules}
                  className="flex items-center px-4 py-2 text-sm text-red-600 bg-red-50 rounded-md hover:bg-red-100"
                >
                  <RiDeleteBinLine className="mr-1" size={16} />
                  Delete Selected ({selectedDNSRules.length})
                </button>
              )}
              
              <button
                onClick={() => {
                  resetDNSRuleForm();
                  setShowDNSForm(!showDNSForm);
                }}
                className="flex items-center px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                <RiAddLine className="mr-1" size={16} />
                {showDNSForm ? 'Hide Form' : 'Add DNS Rule'}
              </button>
            </div>
          </div>
          
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search rules..."
                value={dnsSearch}
                onChange={(e) => setDNSSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <RiSearchLine className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {dnsLoading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : filteredDNSRules && filteredDNSRules.length > 0 ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          checked={selectedDNSRules.length === filteredDNSRules.length && filteredDNSRules.length > 0}
                          onChange={handleSelectAllDNSRules}
                        />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hostname
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Backends
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Alerts
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredDNSRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          checked={selectedDNSRules.includes(rule.id)}
                          onChange={() => handleDNSRuleSelect(rule.id)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="font-medium text-gray-900 mb-1">{rule.hostname}</div>
                        <div className="flex flex-wrap gap-1">
                          {rule.rate_limit_enabled && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-teal-100 text-teal-800 inline-flex items-center">
                              <span className="mr-1">●</span> Rate Limited
                            </span>
                          )}
                          {rule.log_retention_days && rule.log_retention_days > 0 && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 inline-flex items-center">
                              <span className="mr-1">●</span> Logs: {rule.log_retention_days}d
                            </span>
                          )}
                          {rule.health_check_enabled && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 inline-flex items-center">
                              <span className="mr-1">●</span> Health Checks
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {rule.target_backend_urls.length} backend{rule.target_backend_urls.length !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            rule.target_backend_urls.some(b => b.isActive)
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {rule.target_backend_urls.some(b => b.isActive) ? 'Active' : 'No Active Backends'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {alerts?.some((alert: Alert) => alert.dns_rule_id === rule.id) ? (
                          <span className="px-2 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
                            <RiNotification3Line className="mr-1" size={14} />
                            Configured
                          </span>
                        ) : (
                          <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => editDNSRule(rule)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                          title="Edit DNS Rule"
                        >
                          <RiEditLine size={18} />
                        </button>
                        <button
                          onClick={() => editDNSRuleWithAlertFocus(rule)}
                          className="text-purple-600 hover:text-purple-900 mr-4"
                          title="Configure Alerts"
                        >
                          <RiNotification3Line size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this DNS rule?')) {
                              deleteDNSRule.mutate(rule.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                          title="Delete DNS Rule"
                        >
                          <RiDeleteBinLine size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center h-40">
                <p className="text-gray-500 mb-4">No DNS rules found</p>
                <button
                  onClick={() => {
                    resetDNSRuleForm();
                    setShowDNSForm(true);
                  }}
                  className="flex items-center px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  <RiAddLine className="mr-1" size={16} />
                  Add First DNS Rule
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Config; 