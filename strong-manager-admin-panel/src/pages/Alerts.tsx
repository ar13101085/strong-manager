import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { alertsAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { 
  RiNotification3Line, 
  RiMailLine, 
  RiGlobalLine, 
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiAddLine,
  RiEarthLine
} from 'react-icons/ri';
import { Switch } from '@radix-ui/react-switch';

// Define alert type
export type AlertType = 'email' | 'webhook';

// Define DNS Rule interface for dropdown
interface DNSRule {
  id: number;
  hostname: string;
}

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

const Alerts: React.FC = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [currentAlertId, setCurrentAlertId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  // React Hook Form with Zod validation
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
  
  // Fetch DNS rules for dropdown
  const { data: dnsRules, isLoading: dnsRulesLoading } = useQuery({
    queryKey: ['dns-rules-for-alerts'],
    queryFn: async () => {
      const response = await alertsAPI.getDNSRules();
      return response.data;
    },
  });
  
  // Fetch alerts
  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await alertsAPI.getAll();
      return response.data;
    },
  });
  
  // Create alert mutation
  const createMutation = useMutation({
    mutationFn: (values: AlertFormValues) => alertsAPI.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      reset();
      setShowForm(false);
    },
  });
  
  // Update alert mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: AlertFormValues }) => 
      alertsAPI.update(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setIsEditing(false);
      setCurrentAlertId(null);
      reset();
      setShowForm(false);
    },
  });
  
  // Delete alert mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => alertsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
  
  // Form submission handler
  const onSubmit = (values: AlertFormValues) => {
    if (isEditing && currentAlertId) {
      updateMutation.mutate({ id: currentAlertId, values });
    } else {
      createMutation.mutate(values);
    }
  };
  
  // Edit alert handler
  const handleEdit = (alert: Alert) => {
    setIsEditing(true);
    setCurrentAlertId(alert.id!);
    setShowForm(true);
    reset({
      dns_rule_id: alert.dns_rule_id,
      type: alert.type as AlertType,
      destination: alert.destination,
      threshold: alert.threshold,
      enabled: alert.enabled,
    });
  };
  
  // Cancel edit handler
  const handleCancel = () => {
    setIsEditing(false);
    setCurrentAlertId(null);
    setShowForm(false);
    reset();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Alert Configuration</h1>
        <Button 
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          onClick={() => {
            setIsEditing(false);
            setCurrentAlertId(null);
            reset();
            setShowForm(!showForm);
          }}
        >
          <RiAddLine size={18} />
          {showForm ? 'Cancel' : 'New Alert'}
        </Button>
      </div>
      
      {/* Alert Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-medium text-gray-800 mb-4">
            {isEditing ? 'Edit Alert' : 'Create New Alert'}
          </h2>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* DNS Rule Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DNS Rule (Host)</label>
              {dnsRulesLoading ? (
                <div className="h-10 flex items-center">
                  <div className="animate-pulse h-4 bg-gray-200 rounded w-full"></div>
                </div>
              ) : (
                <Controller
                  control={control}
                  name="dns_rule_id"
                  render={({ field }) => (
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={field.value}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    >
                      {dnsRules?.map((rule: DNSRule) => (
                        <option key={rule.id} value={rule.id}>
                          {rule.hostname}
                        </option>
                      ))}
                    </select>
                  )}
                />
              )}
              <p className="text-xs text-gray-500 mt-1">
                Select "Global" to apply this alert to all hosts, or choose a specific DNS rule
              </p>
            </div>
            
            {/* Alert Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alert Type</label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="email"
                        checked={field.value === 'email'}
                        onChange={() => field.onChange('email')}
                        className="mr-2 h-4 w-4 text-blue-600"
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
                        checked={field.value === 'webhook'}
                        onChange={() => field.onChange('webhook')}
                        className="mr-2 h-4 w-4 text-blue-600"
                      />
                      <span className="flex items-center">
                        <RiGlobalLine className="mr-1 text-gray-500" />
                        Webhook
                      </span>
                    </label>
                  </div>
                )}
              />
              {errors.type && (
                <p className="text-red-500 text-sm mt-1">{errors.type.message}</p>
              )}
            </div>
            
            {/* Destination */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {control._formValues.type === 'email' ? 'Email Address' : 'Webhook URL'}
              </label>
              <Controller
                control={control}
                name="destination"
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    placeholder={control._formValues.type === 'email' 
                      ? 'Enter email address' 
                      : 'Enter webhook URL'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              />
              {errors.destination && (
                <p className="text-red-500 text-sm mt-1">{errors.destination.message}</p>
              )}
            </div>
            
            {/* Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Error Threshold</label>
              <Controller
                control={control}
                name="threshold"
                render={({ field }) => (
                  <input
                    {...field}
                    type="number"
                    min={1}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              />
              <p className="text-xs text-gray-500 mt-1">
                Alert will trigger when this many errors occur within a monitoring period
              </p>
              {errors.threshold && (
                <p className="text-red-500 text-sm mt-1">{errors.threshold.message}</p>
              )}
            </div>
            
            {/* Enabled */}
            <div>
              <label className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="enabled"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <span className="text-sm font-medium text-gray-700">Enabled</span>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-10">
                Toggle to enable or disable this alert
              </p>
            </div>
            
            {/* Form Actions */}
            <div className="flex space-x-4 pt-4">
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {isEditing ? 'Update Alert' : 'Create Alert'}
              </Button>
              <Button 
                type="button" 
                className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
      
      {/* Alerts List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-medium text-gray-700">Configured Alerts</h3>
        </div>
        
        {alerts && alerts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Host
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Destination
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Threshold
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {alerts.map((alert: Alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {alert.type === 'email' ? (
                          <RiMailLine className="mr-2 text-blue-500" size={18} />
                        ) : (
                          <RiGlobalLine className="mr-2 text-purple-500" size={18} />
                        )}
                        <span className="text-sm font-medium text-gray-900 capitalize">{alert.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <RiEarthLine className="mr-2 text-green-500" size={18} />
                        <span className="text-sm text-gray-700">{alert.hostname || "Global"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-700">{alert.destination}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-700">{alert.threshold}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          alert.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {alert.enabled ? (
                          <><RiCheckboxCircleLine className="mr-1" /> Active</>
                        ) : (
                          <><RiCloseCircleLine className="mr-1" /> Inactive</>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => handleEdit(alert)}
                        className="text-blue-600 hover:text-blue-900 mr-4 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(alert.id!)}
                        className="text-red-600 hover:text-red-900 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <RiNotification3Line className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No alerts configured</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get notified about system issues by setting up alerts.
            </p>
            <div className="mt-6">
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={() => {
                  setIsEditing(false);
                  setCurrentAlertId(null);
                  reset();
                  setShowForm(true);
                }}
              >
                <RiAddLine className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                New Alert
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Alerts; 