import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RiAddLine, RiEditLine, RiDeleteBinLine, RiToggleLine, RiEyeLine } from 'react-icons/ri';
import { BsToggleOff, BsToggleOn } from 'react-icons/bs';
import { filterRulesAPI } from '../services/api';

interface FilterRule {
  id: number;
  name: string;
  match_type: 'ip' | 'path' | 'dns';
  match_value: string;
  action_type: 'redirect' | 'bad_request' | 'too_many' | 'custom';
  action_value: string;
  status_code: number;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface FilterLog {
  id: number;
  timestamp: string;
  client_ip: string;
  hostname: string;
  request_path: string;
  user_agent: string;
  filter_id: number;
  match_type: string;
  match_value: string;
  action_type: string;
  status_code: number;
  filter_name?: string;
}



const RequestRules: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [editingRule, setEditingRule] = useState<FilterRule | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    match_type: 'ip' | 'path' | 'dns';
    match_value: string;
    action_type: 'redirect' | 'bad_request' | 'too_many' | 'custom';
    action_value: string;
    status_code: number;
    priority: number;
    is_active: boolean;
  }>({
    name: '',
    match_type: 'ip',
    match_value: '',
    action_type: 'redirect',
    action_value: '',
    status_code: 200,
    priority: 0,
    is_active: true,
  });

  const queryClient = useQueryClient();

  // Fetch filter rules
  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ['filterRules'],
    queryFn: async () => {
      try {
        const response = await filterRulesAPI.getAll();
        console.log('Filter rules API response:', response.data);
        // Ensure we always return an array
        return Array.isArray(response.data) ? response.data : [];
      } catch (error) {
        console.error('Error fetching filter rules:', error);
        throw error;
      }
    },
  });

  // Fetch filter logs
  const { data: logsData } = useQuery({
    queryKey: ['filterLogs'],
    queryFn: async () => {
      const response = await filterRulesAPI.getLogs(100);
      return response.data;
    },
    enabled: showLogsModal,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = editingRule 
        ? await filterRulesAPI.update(editingRule.id, data)
        : await filterRulesAPI.create(data);
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filterRules'] });
      setShowModal(false);
      resetForm();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await filterRulesAPI.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filterRules'] });
    },
  });

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await filterRulesAPI.toggle(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filterRules'] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      match_type: 'ip',
      match_value: '',
      action_type: 'redirect',
      action_value: '',
      status_code: 200,
      priority: 0,
      is_active: true,
    });
    setEditingRule(null);
  };

  const handleEdit = (rule: FilterRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      match_type: rule.match_type,
      match_value: rule.match_value,
      action_type: rule.action_type,
      action_value: rule.action_value,
      status_code: rule.status_code,
      priority: rule.priority,
      is_active: rule.is_active,
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const getMatchTypeLabel = (type: string) => {
    switch (type) {
      case 'ip': return 'IP Address';
      case 'path': return 'URL Path';
      case 'dns': return 'DNS/Hostname';
      default: return type;
    }
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'redirect': return 'Redirect';
      case 'bad_request': return 'Bad Request';
      case 'too_many': return 'Too Many Requests';
      case 'custom': return 'Custom Response';
      default: return type;
    }
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading filter rules...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Error loading filter rules: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Request Filter Rules</h1>
          <p className="text-gray-600">Manage request filtering and blocking rules</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowLogsModal(true)}
            className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            <RiEyeLine className="mr-2" size={16} />
            View Logs
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RiAddLine className="mr-2" size={16} />
            Add Rule
          </button>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rule Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Match Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Match Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rules && Array.isArray(rules) && rules.map((rule: FilterRule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {getMatchTypeLabel(rule.match_type)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 font-mono">{rule.match_value}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {getActionTypeLabel(rule.action_type)}
                    {rule.action_value && (
                      <div className="text-xs text-gray-500 truncate max-w-xs">
                        {rule.action_value}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{rule.priority}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(rule.is_active)}`}>
                    {rule.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <button
                    onClick={() => toggleMutation.mutate(rule.id)}
                    className="text-blue-600 hover:text-blue-900"
                    title={rule.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {rule.is_active ? <BsToggleOn size={20} /> : <BsToggleOff size={20} />}
                  </button>
                  <button
                    onClick={() => handleEdit(rule)}
                    className="text-indigo-600 hover:text-indigo-900"
                    title="Edit"
                  >
                    <RiEditLine size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this rule?')) {
                        deleteMutation.mutate(rule.id);
                      }
                    }}
                    className="text-red-600 hover:text-red-900"
                    title="Delete"
                  >
                    <RiDeleteBinLine size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!rules || !Array.isArray(rules) || rules.length === 0) && (
          <div className="text-center py-12">
            <div className="text-gray-500">No filter rules found</div>
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              Create your first filter rule
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingRule ? 'Edit Filter Rule' : 'Add Filter Rule'}
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rule Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Match Type</label>
                  <select
                    value={formData.match_type}
                    onChange={(e) => setFormData({ ...formData, match_type: e.target.value as any })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="ip">IP Address</option>
                    <option value="path">URL Path</option>
                    <option value="dns">DNS/Hostname</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Match Value</label>
                  <input
                    type="text"
                    value={formData.match_value}
                    onChange={(e) => setFormData({ ...formData, match_value: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="e.g., 192.168.1.0/24, /admin/*, *.example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Action Type</label>
                  <select
                    value={formData.action_type}
                    onChange={(e) => setFormData({ ...formData, action_type: e.target.value as any })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="redirect">Redirect</option>
                    <option value="bad_request">Bad Request</option>
                    <option value="too_many">Too Many Requests</option>
                    <option value="custom">Custom Response</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {formData.action_type === 'redirect' ? 'Redirect URL' : 'Response Text'}
                  </label>
                  <input
                    type="text"
                    value={formData.action_value}
                    onChange={(e) => setFormData({ ...formData, action_value: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder={formData.action_type === 'redirect' ? 'https://example.com' : 'Custom response message'}
                  />
                </div>

                {formData.action_type === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status Code</label>
                    <input
                      type="number"
                      value={formData.status_code}
                      onChange={(e) => setFormData({ ...formData, status_code: parseInt(e.target.value) })}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      min="100"
                      max="599"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">Priority</label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    min="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">Higher priority rules are checked first</p>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-900">Active</label>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? 'Saving...' : (editingRule ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-5/6 max-w-6xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Filter Logs</h3>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client IP
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hostname
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Path
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Filter Rule
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logsData?.logs?.map((log: FilterLog) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {log.client_ip}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.hostname}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.request_path}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.filter_name || `Rule #${log.filter_id}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getActionTypeLabel(log.action_type)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.status_code}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {(!logsData?.logs || logsData.logs.length === 0) && (
                <div className="text-center py-12">
                  <div className="text-gray-500">No filter logs found</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestRules; 