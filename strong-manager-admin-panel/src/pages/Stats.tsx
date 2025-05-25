import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { healthAPI, dnsRulesAPI } from '../services/api';
import { 
  RiLineChartLine, 
  RiArrowUpLine, 
  RiArrowDownLine, 
  RiTimeLine, 
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiFilterLine,
  RiRefreshLine,
  RiSearch2Line,
  RiCalendarLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiDeleteBin6Line
} from 'react-icons/ri';

// Define metrics data interface
interface MetricsData {
  requests_total: number;
  success_requests: number;
  failure_requests: number;
  latency_avg: number;
  latency_max: number;
  requests_last_hour: number;
  backend_metrics: {
    id: number;
    url: string;
    requests: number;
  }[];
}

// Define log entry interface
interface LogEntry {
  id: number;
  timestamp: string;
  client_ip: string;
  hostname: string;
  request_path: string;
  backend_id: number;
  backend_url: string;
  latency_ms: number;
  status_code: number;
  is_success: boolean;
}

// Define pagination interface
interface Pagination {
  total_items: number;
  total_pages: number;
  current_page: number;
  limit: number;
}

// Define logs response interface
interface LogsResponse {
  data: LogEntry[];
  pagination: Pagination;
  filters: Record<string, string>;
}

const StatsCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  change?: number;
  subtext?: string;
}> = ({ title, value, icon, bgColor, textColor, change, subtext }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <h3 className="text-2xl font-semibold mt-1">{value}</h3>
          {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
        </div>
        <div className={`${bgColor} ${textColor} p-3 rounded-full`}>
          {icon}
        </div>
      </div>
      
      {change !== undefined && (
        <div className="mt-4 flex items-center">
          {change > 0 ? (
            <div className="flex items-center text-green-500 text-sm">
              <RiArrowUpLine className="mr-1" />
              {change}%
            </div>
          ) : change < 0 ? (
            <div className="flex items-center text-red-500 text-sm">
              <RiArrowDownLine className="mr-1" />
              {Math.abs(change)}%
            </div>
          ) : (
            <div className="flex items-center text-gray-500 text-sm">
              <span className="mr-1">•</span>
              No change
            </div>
          )}
          <span className="text-gray-400 text-xs ml-2">from last hour</span>
        </div>
      )}
    </div>
  );
};

const BarChart: React.FC<{
  data: { label: string; value: number; color: string }[];
  title: string;
}> = ({ data, title }) => {
  // Handle empty or undefined data
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-base font-medium text-gray-700 mb-4">{title}</h3>
        <div className="flex justify-center items-center h-40 text-gray-400">
          No data available
        </div>
      </div>
    );
  }
  
  // Ensure all values are valid numbers
  const safeData = data.map(item => ({
    ...item,
    value: typeof item.value === 'number' ? item.value : 0
  }));
  
  const maxValue = Math.max(...safeData.map(item => item.value), 1); // Use at least 1 to avoid division by zero
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-base font-medium text-gray-700 mb-4">{title}</h3>
      <div className="space-y-4">
        {safeData.map((item, index) => (
          <div key={index}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">{item.label}</span>
              <span className="text-gray-500">{item.value}</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-full ${item.color}`} 
                style={{ width: maxValue > 0 ? `${(item.value / maxValue) * 100}%` : '0%' }} 
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Loading placeholder for stats cards
const StatsCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
    <div className="flex justify-between items-start">
      <div className="w-full">
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-8 w-16 bg-gray-200 rounded mt-2 animate-pulse"></div>
      </div>
      <div className="bg-gray-200 p-3 rounded-full animate-pulse"></div>
    </div>
  </div>
);

// Bar chart skeleton
const BarChartSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
    <div className="h-5 w-48 bg-gray-200 rounded mb-6 animate-pulse"></div>
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i}>
          <div className="flex justify-between mb-1">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="h-2 w-full bg-gray-100 rounded-full">
            <div className="h-full bg-gray-200 rounded-full animate-pulse" style={{ width: `${30 + (i * 20)}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const Stats: React.FC = () => {
  // State for selected DNS rule filtering
  const [selectedDNS, setSelectedDNS] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  
  // State for pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  
  // State for filters
  const [filters, setFilters] = useState({
    status_code: '',
    client_ip: '',
    is_success: '',
    start_date: '',
    end_date: ''
  });
  
  // State to manage filter dialog
  const [showFilters, setShowFilters] = useState(false);
  
  // State for filter form values
  const [filterForm, setFilterForm] = useState({ ...filters });

  // State for delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Get the query client for invalidating queries after deletion
  const queryClient = useQueryClient();

  // Delete logs mutation
  const deleteLogsMutation = useMutation({
    mutationFn: () => healthAPI.deleteAllLogs(selectedDNS !== 'all' ? selectedDNS : undefined),
    onSuccess: () => {
      // Invalidate and refetch queries after successful deletion
      queryClient.invalidateQueries({ queryKey: ['recent-logs'] });
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
      refetchMetrics();
      refetchLogs();
      setShowDeleteConfirm(false);
    }
  });

  // Fetch DNS rules for the dropdown
  const { data: dnsRules } = useQuery({
    queryKey: ['dns-rules-for-stats'],
    queryFn: async () => {
      const response = await dnsRulesAPI.getAll();
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // Cache DNS rules for 5 minutes
    refetchOnWindowFocus: false // Don't refetch on window focus
  });
  
  // Get health check
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await healthAPI.getHealth();
      return response.data;
    }
  });
  
  // Get metrics data
  const { 
    data: metricsData, 
    isLoading: metricsLoading,
    refetch: refetchMetrics
  } = useQuery({
    queryKey: ['metrics', selectedDNS],
    queryFn: async () => {
      let response;
      if (selectedDNS === 'all') {
        response = await healthAPI.getMetrics();
      } else {
        response = await healthAPI.getMetricsForDNS(selectedDNS);
      }
      
      // Debug log to check the response data
      console.log('Metrics data:', response.data);
      
      // Return the JSON data directly, no need for parsing
      return response.data as MetricsData;
    },
    staleTime: 30000, // Cache data for 30 seconds to reduce unnecessary requests
    refetchOnWindowFocus: false // Don't refetch when window regains focus
  });
  
  // Get recent logs with pagination and filters
  const { 
    data: logsResponse,
    isLoading: logsLoading,
    refetch: refetchLogs
  } = useQuery<LogsResponse>({
    queryKey: ['recent-logs', selectedDNS, page, pageSize, filters],
    queryFn: async () => {
      const response = await healthAPI.getRecentLogs(pageSize, selectedDNS, page, filters);
      
      // Debug log to check the logs response
      console.log('Logs response:', response.data);
      
      return response.data;
    },
    staleTime: 30000, // Cache data for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    keepPreviousData: true // Keep previous data while fetching new data
  });
  
  // Extract logs data and pagination information
  const recentLogs = logsResponse?.data || [];
  const pagination = logsResponse?.pagination || { 
    total_items: 0, 
    total_pages: 1, 
    current_page: 1, 
    limit: 10
  };
  
  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= pagination.total_pages) {
      setPage(newPage);
    }
  };
  
  // Handle page size change
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setPageSize(newSize);
    setPage(1); // Reset to first page when changing page size
  };
  
  // Handle filter form changes
  const handleFilterFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilterForm(prev => ({ ...prev, [name]: value }));
  };
  
  // Apply filters
  const applyFilters = () => {
    setFilters(filterForm);
    setPage(1); // Reset to first page when applying filters
    setShowFilters(false);
  };
  
  // Reset filters
  const resetFilters = () => {
    const emptyFilters = {
      status_code: '',
      client_ip: '',
      is_success: '',
      start_date: '',
      end_date: ''
    };
    setFilterForm(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  };
  
  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchMetrics(), refetchLogs()]);
    setIsRefreshing(false);
  };
  
  // Prepare data for charts
  const successRateData = metricsData && metricsData.requests_total > 0 
    ? [
        { 
          label: 'Success', 
          value: metricsData.success_requests || 0, 
          color: 'bg-green-500' 
        },
        { 
          label: 'Failure', 
          value: metricsData.failure_requests || 0, 
          color: 'bg-red-500' 
        }
      ] 
    : [
        { label: 'Success', value: 0, color: 'bg-green-500' },
        { label: 'Failure', value: 0, color: 'bg-red-500' }
      ];
  
  const backendRequestsData = metricsData?.backend_metrics && metricsData.backend_metrics.length > 0
    ? metricsData.backend_metrics.map(backend => ({
        label: backend.url || 'Unknown',
        value: backend.requests || 0,
        color: 'bg-blue-500'
      }))
    : [{ label: 'No Data', value: 0, color: 'bg-gray-300' }];
  
  // Check if all data is loading - show full page loader only on initial load
  const isInitialLoading = !metricsData && (healthLoading || metricsLoading);
  
  if (isInitialLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-500">Loading statistics...</p>
      </div>
    );
  }
  
  // Calculate success rate, avoiding division by zero
  const successRate = metricsData && metricsData.requests_total > 0
    ? Math.round((metricsData.success_requests / metricsData.requests_total) * 100)
    : 0;
  
  // Debug log to check the success rate calculation
  console.log('Success rate calculation:', {
    total: metricsData?.requests_total,
    success: metricsData?.success_requests,
    rate: successRate
  });
  
  // Check if filters are active
  const hasActiveFilters = Object.values(filters).some(value => value !== '');
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Traffic Statistics</h1>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <select
              className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedDNS}
              onChange={(e) => setSelectedDNS(e.target.value)}
            >
              <option value="all">All DNS Rules</option>
              {dnsRules?.map((rule: any) => (
                <option key={rule.id} value={rule.hostname}>
                  {rule.hostname}
                </option>
              ))}
            </select>
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-1 rounded-md bg-blue-50 px-3 py-1 text-sm text-blue-600 hover:bg-blue-100"
            >
              <RiRefreshLine className={isRefreshing ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
          <div className={`px-3 py-1 rounded-full ${healthData?.status === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {healthData?.status === 'ok' ? 'System Healthy' : 'System Issues'}
          </div>
        </div>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricsLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : (
          <>
            <StatsCard
              title="Total Requests"
              value={metricsData?.requests_total ? metricsData.requests_total.toLocaleString() : "0"}
              icon={<RiLineChartLine size={24} />}
              bgColor="bg-blue-100"
              textColor="text-blue-600"
              change={0}
            />
            
            <StatsCard
              title="Success Rate"
              value={metricsData?.requests_total ? `${successRate}%` : "0%"}
              icon={<RiCheckboxCircleLine size={24} />}
              bgColor="bg-green-100"
              textColor="text-green-600"
              change={0}
              subtext={`${metricsData?.success_requests ? metricsData.success_requests.toLocaleString() : "0"} successful requests`}
            />
            
            <StatsCard
              title="Average Latency"
              value={metricsData?.latency_avg ? `${metricsData.latency_avg.toFixed(1)} ms` : "0 ms"}
              icon={<RiTimeLine size={24} />}
              bgColor="bg-yellow-100"
              textColor="text-yellow-600"
              change={0}
              subtext={`Max: ${metricsData?.latency_max || "0"} ms`}
            />
            
            <StatsCard
              title="Error Count"
              value={metricsData?.failure_requests ? metricsData.failure_requests.toLocaleString() : "0"}
              icon={<RiCloseCircleLine size={24} />}
              bgColor="bg-red-100"
              textColor="text-red-600"
              change={0}
            />
          </>
        )}
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {metricsLoading ? (
          <>
            <BarChartSkeleton />
            <BarChartSkeleton />
          </>
        ) : (
          <>
            <BarChart 
              data={successRateData} 
              title="Request Success/Failure Distribution" 
            />
            
            <BarChart 
              data={backendRequestsData} 
              title="Requests Per Backend" 
            />
          </>
        )}
      </div>
      
      {/* Recent Requests Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-base font-medium text-gray-700">Recent Request Logs</h3>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center space-x-1 rounded-md px-3 py-1 text-sm bg-red-50 text-red-600 hover:bg-red-100"
              disabled={deleteLogsMutation.isPending}
            >
              <RiDeleteBin6Line />
              <span>Delete All Logs</span>
            </button>
            <div className="flex items-center">
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center space-x-1 rounded-md px-3 py-1 text-sm ${hasActiveFilters ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'} hover:bg-blue-50`}
              >
                <RiFilterLine />
                <span>Filters {hasActiveFilters ? `(${Object.values(filters).filter(f => f !== '').length})` : ''}</span>
              </button>
            </div>
            <div className="text-sm text-gray-500">
              {selectedDNS === 'all' ? 'All DNS Rules' : `Filtered by: ${selectedDNS}`}
            </div>
          </div>
        </div>
        
        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete {selectedDNS !== 'all' ? `all logs for ${selectedDNS}` : 'all request logs'}? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={deleteLogsMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteLogsMutation.mutate()}
                  className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
                  disabled={deleteLogsMutation.isPending}
                >
                  {deleteLogsMutation.isPending ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Deleting...
                    </span>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Filter Dialog */}
        {showFilters && (
          <div className="border-b border-gray-200 p-4 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status Code</label>
                <input 
                  type="number" 
                  name="status_code"
                  value={filterForm.status_code}
                  onChange={handleFilterFormChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 404"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client IP</label>
                <input 
                  type="text" 
                  name="client_ip"
                  value={filterForm.client_ip}
                  onChange={handleFilterFormChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 192.168.1.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select 
                  name="is_success"
                  value={filterForm.is_success}
                  onChange={handleFilterFormChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  <option value="true">Success</option>
                  <option value="false">Error</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input 
                  type="datetime-local" 
                  name="start_date"
                  value={filterForm.start_date}
                  onChange={handleFilterFormChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input 
                  type="datetime-local" 
                  name="end_date"
                  value={filterForm.end_date}
                  onChange={handleFilterFormChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2">
              <button 
                onClick={resetFilters}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Reset
              </button>
              <button 
                onClick={applyFilters}
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
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client IP
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hostname
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Path
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Backend
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Latency
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentLogs?.length > 0 ? (
                  recentLogs.map((log: LogEntry) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.client_ip}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.hostname}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {log.request_path || '/'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.backend_url}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          log.is_success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {log.status_code} {log.is_success ? 'OK' : 'Error'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.latency_ms} ms
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">
                      No request logs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">
                Showing 
                <span className="font-medium mx-1">
                  {((pagination.current_page - 1) * pagination.limit) + 1}
                </span>
                to 
                <span className="font-medium mx-1">
                  {Math.min(pagination.current_page * pagination.limit, pagination.total_items)}
                </span>
                of 
                <span className="font-medium mx-1">
                  {pagination.total_items}
                </span>
                results
              </span>
              <div>
                <select
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1"
                >
                  <option value="10">10 / page</option>
                  <option value="20">20 / page</option>
                  <option value="50">50 / page</option>
                  <option value="100">100 / page</option>
                  <option value="500">500 / page</option>
                </select>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className={`rounded-md border border-gray-300 px-3 py-1 text-sm ${page === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <RiArrowLeftSLine />
              </button>
              {/* Page number buttons - with ellipsis for many pages */}
              <div className="flex items-center space-x-1">
                {[...Array(pagination.total_pages)].map((_, index) => {
                  const pageNumber = index + 1;
                  
                  // Always show first, last, current, and pages around current
                  if (
                    pageNumber === 1 || 
                    pageNumber === pagination.total_pages ||
                    (pageNumber >= page - 1 && pageNumber <= page + 1)
                  ) {
                    return (
                      <button
                        key={pageNumber}
                        onClick={() => handlePageChange(pageNumber)}
                        className={`rounded-md w-8 h-8 text-sm ${
                          pageNumber === page
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
                    pageNumber === pagination.total_pages - 1
                  ) {
                    return <span key={pageNumber} className="text-gray-500">...</span>;
                  }
                  
                  // Hide other pages
                  return null;
                })}
              </div>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === pagination.total_pages}
                className={`rounded-md border border-gray-300 px-3 py-1 text-sm ${page === pagination.total_pages ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <RiArrowRightSLine />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stats; 