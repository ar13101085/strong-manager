import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RiAddLine, RiEditLine, RiDeleteBinLine, RiToggleLine, RiEyeLine, RiFilterLine, RiArrowLeftSLine, RiArrowRightSLine, RiDeleteBin6Line } from 'react-icons/ri';
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

interface Pagination {
  total_items: number;
  total_pages: number;
  current_page: number;
  limit: number;
}

interface FilterLogsResponse {
  data: FilterLog[];
  pagination: Pagination;
  filters: Record<string, string>;
}



const RequestRules: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [editingRule, setEditingRule] = useState<FilterRule | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Pagination and filter states for logs
  const [logsPage, setLogsPage] = useState<number>(1);
  const [logsPageSize, setLogsPageSize] = useState<number>(20);
  const [showLogsFilters, setShowLogsFilters] = useState<boolean>(false);
  const [logsFilters, setLogsFilters] = useState({
    client_ip: '',
    hostname: '',
    request_path: '',
    match_type: '',
    action_type: '',
    status_code: '',
    filter_id: '',
    start_date: '',
    end_date: ''
  });
  const [logsFilterForm, setLogsFilterForm] = useState({ ...logsFilters });
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

  // Fetch filter logs with pagination and filters
  const { data: logsResponse, isLoading: logsLoading } = useQuery({
    queryKey: ['filterLogs', logsPage, logsPageSize, logsFilters],
    queryFn: async () => {
      const response = await filterRulesAPI.getLogs(logsPageSize, logsPage, logsFilters);
      return response.data as FilterLogsResponse;
    },
    enabled: showLogsModal,
  });

  // Extract logs data and pagination information
  const filterLogs = logsResponse?.data || [];
  const logsPagination = logsResponse?.pagination || { 
    total_items: 0, 
    total_pages: 1, 
    current_page: 1, 
    limit: 20
  };

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

  // Delete all filter logs mutation
  const deleteFilterLogsMutation = useMutation({
    mutationFn: () => filterRulesAPI.deleteAllLogs(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filterLogs'] });
      setShowDeleteConfirm(false);
    }
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

  // Logs pagination and filter handlers
  const handleLogsPageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= logsPagination.total_pages) {
      setLogsPage(newPage);
    }
  };

  const handleLogsPageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setLogsPageSize(newSize);
    setLogsPage(1); // Reset to first page when changing page size
  };

  const handleLogsFilterFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLogsFilterForm(prev => ({ ...prev, [name]: value }));
  };

  const applyLogsFilters = () => {
    setLogsFilters(logsFilterForm);
    setLogsPage(1); // Reset to first page when applying filters
    setShowLogsFilters(false);
  };

  const resetLogsFilters = () => {
    const emptyFilters = {
      client_ip: '',
      hostname: '',
      request_path: '',
      match_type: '',
      action_type: '',
      status_code: '',
      filter_id: '',
      start_date: '',
      end_date: ''
    };
    setLogsFilterForm(emptyFilters);
    setLogsFilters(emptyFilters);
    setLogsPage(1);
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
          <div className="relative top-5 mx-auto p-5 border w-11/12 max-w-7xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Filter Logs</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center space-x-1 rounded-md px-3 py-1 text-sm bg-red-50 text-red-600 hover:bg-red-100"
                  disabled={deleteFilterLogsMutation.isPending}
                >
                  <RiDeleteBin6Line />
                  <span>Delete All Logs</span>
                </button>
                <button
                  onClick={() => setShowLogsFilters(!showLogsFilters)}
                  className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  <RiFilterLine className="mr-1" size={14} />
                  Filters
                </button>
                <button
                  onClick={() => setShowLogsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Controls */}
            {showLogsFilters && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Client IP</label>
                    <input 
                      type="text" 
                      name="client_ip"
                      value={logsFilterForm.client_ip}
                      onChange={handleLogsFilterFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="192.168.1.1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hostname</label>
                    <input 
                      type="text" 
                      name="hostname"
                      value={logsFilterForm.hostname}
                      onChange={handleLogsFilterFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Request Path</label>
                    <input 
                      type="text" 
                      name="request_path"
                      value={logsFilterForm.request_path}
                      onChange={handleLogsFilterFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="/api/users"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Match Type</label>
                    <select 
                      name="match_type"
                      value={logsFilterForm.match_type}
                      onChange={handleLogsFilterFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Types</option>
                      <option value="ip">IP Address</option>
                      <option value="path">URL Path</option>
                      <option value="dns">DNS/Hostname</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
                    <select 
                      name="action_type"
                      value={logsFilterForm.action_type}
                      onChange={handleLogsFilterFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Actions</option>
                      <option value="redirect">Redirect</option>
                      <option value="bad_request">Bad Request</option>
                      <option value="too_many">Too Many Requests</option>
                      <option value="custom">Custom Response</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status Code</label>
                    <input 
                      type="text" 
                      name="status_code"
                      value={logsFilterForm.status_code}
                      onChange={handleLogsFilterFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="403"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input 
                      type="datetime-local" 
                      name="start_date"
                      value={logsFilterForm.start_date}
                      onChange={handleLogsFilterFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input 
                      type="datetime-local" 
                      name="end_date"
                      value={logsFilterForm.end_date}
                      onChange={handleLogsFilterFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2 mt-4">
                  <button 
                    onClick={resetLogsFilters}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Reset
                  </button>
                  <button 
                    onClick={applyLogsFilters}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            )}
            
            <div className="overflow-x-auto">
              {logsLoading ? (
                <div className="flex justify-center items-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (
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
                    {filterLogs?.map((log: FilterLog) => (
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
              )}
              
              {(!filterLogs || filterLogs.length === 0) && !logsLoading && (
                <div className="text-center py-12">
                  <div className="text-gray-500">No filter logs found</div>
                </div>
              )}
            </div>

            {/* Pagination */}
            {logsPagination.total_pages > 1 && (
              <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">
                    Showing 
                    <span className="font-medium mx-1">
                      {((logsPagination.current_page - 1) * logsPagination.limit) + 1}
                    </span>
                    to 
                    <span className="font-medium mx-1">
                      {Math.min(logsPagination.current_page * logsPagination.limit, logsPagination.total_items)}
                    </span>
                    of 
                    <span className="font-medium mx-1">
                      {logsPagination.total_items}
                    </span>
                    results
                  </span>
                  <div>
                    <select
                      value={logsPageSize}
                      onChange={handleLogsPageSizeChange}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1"
                    >
                      <option value="10">10 / page</option>
                      <option value="20">20 / page</option>
                      <option value="50">50 / page</option>
                      <option value="100">100 / page</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleLogsPageChange(logsPage - 1)}
                    disabled={logsPage === 1}
                    className={`rounded-md border border-gray-300 px-3 py-1 text-sm ${logsPage === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <RiArrowLeftSLine />
                  </button>
                  {/* Page number buttons */}
                  <div className="flex items-center space-x-1">
                    {[...Array(logsPagination.total_pages)].map((_, index) => {
                      const pageNumber = index + 1;
                      
                      // Always show first, last, current, and pages around current
                      if (
                        pageNumber === 1 || 
                        pageNumber === logsPagination.total_pages ||
                        (pageNumber >= logsPage - 1 && pageNumber <= logsPage + 1)
                      ) {
                        return (
                          <button
                            key={pageNumber}
                            onClick={() => handleLogsPageChange(pageNumber)}
                            className={`rounded-md w-8 h-8 text-sm ${
                              pageNumber === logsPage
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {pageNumber}
                          </button>
                        );
                      }
                      
                      // Show ellipsis for page breaks
                      if (
                        pageNumber === 2 || 
                        pageNumber === logsPagination.total_pages - 1
                      ) {
                        return <span key={pageNumber} className="text-gray-500">...</span>;
                      }
                      
                      // Hide other pages
                      return null;
                    })}
                  </div>
                  <button
                    onClick={() => handleLogsPageChange(logsPage + 1)}
                    disabled={logsPage === logsPagination.total_pages}
                    className={`rounded-md border border-gray-300 px-3 py-1 text-sm ${logsPage === logsPagination.total_pages ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <RiArrowRightSLine />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete all filter logs? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={deleteFilterLogsMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteFilterLogsMutation.mutate()}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
                disabled={deleteFilterLogsMutation.isPending}
              >
                {deleteFilterLogsMutation.isPending ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestRules; 