import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthAPI, dnsRulesAPI } from '../services/api';
import { 
  RiUserLine, 
  RiSignalTowerLine, 
  RiDatabase2Line, 
  RiCpuLine, 
  RiHardDriveLine, 
  RiSwapLine,
  RiSpeedLine,
  RiUpload2Line,
  RiDownload2Line,
  RiTimeLine,
  RiServerLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiWifiLine
} from 'react-icons/ri';

// Circular Progress component
const CircularProgress: React.FC<{ value: number; label: string; color: string }> = ({ 
  value, 
  label, 
  color 
}) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const safeValue = value || 0; // Ensure value is not undefined/null
  const strokeDashoffset = circumference - (safeValue / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="#e6e6e6"
            strokeWidth="8"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        </svg>
        <div className="absolute text-sm font-bold">{safeValue.toFixed(1)}%</div>
      </div>
      <div className="mt-2 text-xs text-gray-600">{label}</div>
    </div>
  );
};

// Server Card component
interface ServerCardProps {
  title: string;
  subtitle?: string;
  streamOpen?: number;
  viewers?: number;
  totalCore?: number;
  uploadSpeed?: string;
  downloadSpeed?: string;
  totalBandwidth?: string;
  cpuUsage?: number;
  ramUsage?: number;
  swapUsage?: number;
  memoryUsage?: number;
}

const ServerCard: React.FC<ServerCardProps> = ({
  title,
  subtitle,
  streamOpen = 0,
  viewers = 0,
  totalCore = 0,
  uploadSpeed = '0 kB',
  downloadSpeed = '0 kB',
  totalBandwidth = '0',
  cpuUsage = 0,
  ramUsage = 0,
  swapUsage = 0,
  memoryUsage = 0,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        <button className="text-gray-400 hover:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
          </svg>
        </button>
      </div>
      
      <div className="p-5">
        {/* Metrics Row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-semibold">{streamOpen}</div>
            <div className="text-xs text-gray-500 mt-1">Stream Open</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold">{viewers}</div>
            <div className="text-xs text-gray-500 mt-1">Viewers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold">{totalCore}</div>
            <div className="text-xs text-gray-500 mt-1">Total Core</div>
          </div>
        </div>
        
        {/* Bandwidth Row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-lg font-semibold">{uploadSpeed}</div>
            <div className="text-xs text-gray-500 mt-1">Upload Speed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{downloadSpeed}</div>
            <div className="text-xs text-gray-500 mt-1">Download Speed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{totalBandwidth}</div>
            <div className="text-xs text-gray-500 mt-1">Total LB</div>
          </div>
        </div>
        
        {/* Usage Row */}
        <div className="grid grid-cols-4 gap-2">
          <CircularProgress value={cpuUsage} label="CPU Usage" color="#3b82f6" />
          <CircularProgress value={ramUsage} label="RAM Usage" color="#ef4444" />
          <CircularProgress value={swapUsage} label="Swap Usage" color="#8b5cf6" />
          <CircularProgress value={memoryUsage} label="Memory Usage" color="#ec4899" />
        </div>
        
        {/* Graph Placeholder */}
        <div className="mt-6 h-16 flex items-end justify-between">
          {[...Array(10)].map((_, i) => (
            <div 
              key={i} 
              className="w-6 bg-indigo-200 rounded-t" 
              style={{ height: `${Math.max(15, Math.random() * 100)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Strong Proxy Card component
interface StrongProxyCardProps {
  totalDNS: number;
  totalHandleLastHour: number;
  requestPerMinute: number;
  cpuCores: number;
  uploadSpeed: string;
  downloadSpeed: string;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
}

const StrongProxyCard: React.FC<StrongProxyCardProps> = ({
  totalDNS,
  totalHandleLastHour,
  requestPerMinute,
  cpuCores,
  uploadSpeed,
  downloadSpeed,
  cpuUsage,
  ramUsage,
  diskUsage,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-700">Strong Proxy Stats</h3>
      </div>
      
      <div className="p-5">
        {/* Metrics Grid - 2x3 compact layout */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="flex flex-col items-center p-2 bg-blue-50 rounded-lg">
            <RiSignalTowerLine className="text-blue-500 text-lg" />
            <div className="text-xl font-semibold mt-1">{totalDNS}</div>
            <div className="text-xs text-gray-500">DNS</div>
          </div>
          <div className="flex flex-col items-center p-2 bg-green-50 rounded-lg">
            <RiTimeLine className="text-green-500 text-lg" />
            <div className="text-xl font-semibold mt-1">{totalHandleLastHour}</div>
            <div className="text-xs text-gray-500">Hourly</div>
          </div>
          <div className="flex flex-col items-center p-2 bg-purple-50 rounded-lg">
            <RiSpeedLine className="text-purple-500 text-lg" />
            <div className="text-xl font-semibold mt-1">{(requestPerMinute || 0).toFixed(1)}</div>
            <div className="text-xs text-gray-500">Req/Min</div>
          </div>
          <div className="flex flex-col items-center p-2 bg-yellow-50 rounded-lg">
            <RiCpuLine className="text-yellow-500 text-lg" />
            <div className="text-xl font-semibold mt-1">{cpuCores}</div>
            <div className="text-xs text-gray-500">Cores</div>
          </div>
          <div className="flex flex-col items-center p-2 bg-indigo-50 rounded-lg">
            <RiUpload2Line className="text-indigo-500 text-lg" />
            <div className="text-xl font-semibold mt-1">{uploadSpeed}</div>
            <div className="text-xs text-gray-500">Upload</div>
          </div>
          <div className="flex flex-col items-center p-2 bg-pink-50 rounded-lg">
            <RiDownload2Line className="text-pink-500 text-lg" />
            <div className="text-xl font-semibold mt-1">{downloadSpeed}</div>
            <div className="text-xs text-gray-500">Download</div>
          </div>
        </div>
        
        {/* Usage Progress Circles */}
        <div className="grid grid-cols-3 gap-4">
          <CircularProgress value={cpuUsage} label="CPU Usage" color="#3b82f6" />
          <CircularProgress value={ramUsage} label="RAM Usage" color="#ef4444" />
          <CircularProgress value={diskUsage} label="Disk Usage" color="#8b5cf6" />
        </div>
      </div>
    </div>
  );
};

// Resource Card - New component for system resources
const ResourceCard: React.FC<{
  cpuUsage: number;
  ramUsage: number;
  swapUsage: number;
  memoryUsage: number;
}> = ({ cpuUsage, ramUsage, swapUsage, memoryUsage }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-700">System Resources</h3>
      </div>
      
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4">
          <CircularProgress value={cpuUsage} label="CPU Usage" color="#3b82f6" />
          <CircularProgress value={ramUsage} label="RAM Usage" color="#ef4444" />
          <CircularProgress value={swapUsage} label="Swap Usage" color="#8b5cf6" />
          <CircularProgress value={memoryUsage} label="Memory Usage" color="#ec4899" />
        </div>
      </div>
    </div>
  );
};

// Bandwidth Card - New component for network stats
const BandwidthCard: React.FC<{
  uploadSpeed: string;
  downloadSpeed: string;
  totalBandwidth: string;
}> = ({ uploadSpeed, downloadSpeed, totalBandwidth }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-700">Network</h3>
      </div>
      
      <div className="p-5">
        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center bg-indigo-50 p-4 rounded-lg">
            <div className="p-3 mr-4 bg-indigo-100 text-indigo-500 rounded-full">
              <RiUpload2Line size={24} />
            </div>
            <div>
              <div className="text-sm text-gray-500">Upload Speed</div>
              <div className="text-xl font-semibold">{uploadSpeed}</div>
            </div>
          </div>
          
          <div className="flex items-center bg-pink-50 p-4 rounded-lg">
            <div className="p-3 mr-4 bg-pink-100 text-pink-500 rounded-full">
              <RiDownload2Line size={24} />
            </div>
            <div>
              <div className="text-sm text-gray-500">Download Speed</div>
              <div className="text-xl font-semibold">{downloadSpeed}</div>
            </div>
          </div>
          
          <div className="flex items-center bg-gray-50 p-4 rounded-lg">
            <div className="p-3 mr-4 bg-gray-100 text-gray-500 rounded-full">
              <RiHardDriveLine size={24} />
            </div>
            <div>
              <div className="text-sm text-gray-500">Total Bandwidth</div>
              <div className="text-xl font-semibold">{totalBandwidth}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// DNS Details Card
interface DNSDetailsCardProps {
  dnsName: string;
  targets: {
    url: string;
    isHealthy: boolean;
    isActive: boolean;
    requestsPerSecond: number;
    requestsLastHour: number;
  }[];
  successFailureData: {
    hour: number;
    success: number;
    failure: number;
  }[];
  healthCheckEnabled: boolean;
}

const DNSDetailsCard: React.FC<DNSDetailsCardProps> = ({
  dnsName,
  targets,
  successFailureData,
  healthCheckEnabled
}) => {
  // Calculate overall health status
  const unhealthyTargets = targets.filter(t => !t.isHealthy);
  const isHealthy = unhealthyTargets.length === 0;
  const healthSummary = isHealthy
    ? "All backends healthy"
    : `${unhealthyTargets.length}/${targets.length} backends unhealthy`;

  // Get first rule to determine if health checks are enabled
  // Assuming all targets in a card belong to the same DNS rule
  // const dnsRule = dnsRules?.find((rule: any) => rule.hostname === dnsName);
  // const healthChecksEnabled = dnsRule?.health_check_enabled || false;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-700">DNS: {dnsName}</h3>
          {healthCheckEnabled ? (
            <span className={`text-xs px-2 py-1 rounded-full flex items-center ${
              isHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isHealthy 
                ? <><RiCheckboxCircleLine className="mr-1" />Healthy</> 
                : <><RiCloseCircleLine className="mr-1" />Problems</>}
            </span>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full flex items-center bg-gray-100 text-gray-600">
              <span className="mr-1">●</span> Health Checks Disabled
            </span>
          )}
        </div>
      </div>
      
      <div className="p-5">
        {/* Targets section - more compact */}
        <h4 className="text-xs font-medium text-gray-600 mb-2">Backend Targets</h4>
        <div className="space-y-2 mb-4">
          {targets.map((target, index) => (
            <div key={index} className="bg-gray-50 p-2 rounded-lg">
              <div className="flex justify-between items-center mb-1">
                <div className="text-xs font-medium">{target.url}</div>
                {healthCheckEnabled ? (
                  <div className={`px-2 py-0.5 rounded text-xs font-medium flex items-center ${
                    target.isHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {target.isHealthy 
                      ? <><RiCheckboxCircleLine className="mr-1" size={12} />Healthy</>
                      : <><RiCloseCircleLine className="mr-1" size={12} />Unhealthy</>}
                  </div>
                ) : (
                  <div className="px-2 py-0.5 rounded text-xs font-medium flex items-center bg-gray-100 text-gray-600">
                    <span className="mr-1">●</span> Monitoring Disabled
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs">
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-1 ${target.isActive ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <span>{target.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div>
                  <span className="text-gray-500">RPS:</span> {target.requestsPerSecond}
                </div>
                <div>
                  <span className="text-gray-500">1h:</span> {target.requestsLastHour}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Success/Failure chart - more compact */}
        <h4 className="text-xs font-medium text-gray-600 mb-1">24h Request Stats</h4>
        <div className="h-24">
          <div className="flex h-full">
            {successFailureData.map((hour, index) => (
              <div key={index} className="flex-1 flex flex-col-reverse">
                {/* Failure bar */}
                <div 
                  className="w-full bg-red-400 rounded-t" 
                  style={{ 
                    height: `${Math.min(100, (hour.failure / (hour.success + hour.failure || 1)) * 100)}%`,
                    maxHeight: '80%' 
                  }}
                ></div>
                {/* Success bar */}
                <div 
                  className="w-full bg-green-400 rounded-t mt-px" 
                  style={{ 
                    height: `${Math.min(100, (hour.success / (hour.success + hour.failure || 1)) * 100)}%`,
                    maxHeight: '80%'
                  }}
                ></div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-400">
            {[0, 6, 12, 18, 23].map(hour => (
              <div key={hour}>{hour}h</div>
            ))}
          </div>
        </div>
        <div className="flex justify-center mt-1 text-xs">
          <div className="flex items-center mr-4">
            <div className="w-2 h-2 bg-green-400 mr-1 rounded"></div>
            <span>Success</span>
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-red-400 mr-1 rounded"></div>
            <span>Failure</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Summary Card component
interface SummaryCardProps {
  icon: React.ReactNode;
  title: string;
  value: number | string;
  bgColor: string;
  textColor: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ icon, title, value, bgColor, textColor }) => {
  return (
    <div className={`${bgColor} rounded-lg shadow-sm p-5 flex items-center`}>
      <div className={`${textColor} mr-5 p-3 rounded-full bg-white bg-opacity-20`}>
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-medium text-white opacity-80">{title}</h3>
        <p className="text-2xl font-semibold text-white">{value}</p>
      </div>
    </div>
  );
};

// System Info Card
const SystemInfoCard: React.FC<{
  status: string;
  dbConnection: string;
  apiVersion: string;
}> = ({ status, dbConnection, apiVersion }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-lg font-medium text-gray-700 mb-4">System Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center space-x-3 bg-blue-50 p-4 rounded-lg">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-full">
            <RiServerLine size={24} />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">System Status</div>
            <div className="text-base font-semibold mt-1 text-gray-800">{status}</div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3 bg-green-50 p-4 rounded-lg">
          <div className="p-2 bg-green-100 text-green-600 rounded-full">
            <RiDatabase2Line size={24} />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">Database Connection</div>
            <div className="text-base font-semibold mt-1 text-gray-800">{dbConnection}</div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3 bg-purple-50 p-4 rounded-lg">
          <div className="p-2 bg-purple-100 text-purple-600 rounded-full">
            <RiSwapLine size={24} />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">API Version</div>
            <div className="text-base font-semibold mt-1 text-gray-800">{apiVersion}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  // We don't need isRefreshing state anymore since we removed the refresh button
  
  // Format uptime string
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let formatted = '';
    if (days > 0) formatted += `${days}d `;
    if (hours > 0) formatted += `${hours}h `;
    if (minutes > 0) formatted += `${minutes}m `;
    formatted += `${remainingSeconds}s`;

    return formatted;
  };

  // Fetch health data
  const { 
    data: healthData, 
    isLoading: healthLoading,
  } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await healthAPI.getHealth();
      return response.data;
    },
    refetchInterval: 15000, // Refresh every 15 seconds
    staleTime: 5000 // Consider data stale after 5 seconds
  });

  // Fetch metrics data - no longer filtered by DNS
  const { 
    data: metricsData, 
    isLoading: metricsLoading,
  } = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const response = await healthAPI.getMetrics();
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000 // Consider data stale after 15 seconds
  });

  // Fetch system resources data
  const { 
    data: systemResourcesData, 
    isLoading: systemResourcesLoading,
  } = useQuery({
    queryKey: ['system-resources'],
    queryFn: async () => {
      const response = await healthAPI.getSystemResources();
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000 // Consider data stale after 15 seconds
  });

  // Fetch DNS rules
  const { 
    data: dnsRules, 
    isLoading: dnsLoading,
  } = useQuery({
    queryKey: ['dns-rules'],
    queryFn: async () => {
      const response = await dnsRulesAPI.getAll();
      return response.data;
    },
    staleTime: 60000 // Cache DNS rules for 1 minute
  });

  // Fetch recent logs - no longer filtered by DNS
  const { 
    data: recentLogs,
    isLoading: logsLoading,
  } = useQuery({
    queryKey: ['recent-logs'],
    queryFn: async () => {
      const response = await healthAPI.getRecentLogs(10);
      return response.data;
    },
    staleTime: 30000 // Consider data stale after 30 seconds
  });

  // Generate dummy data for system resources and metrics not provided by API
  // This will be used as a fallback if the real data isn't available
  const generateSystemResourceData = () => {
    return {
      cpuUsage: 15.3,
      ramUsage: 78.5,
      swapUsage: 0.0,
      memoryUsage: 78.5,
      uploadSpeed: '37 kB',
      downloadSpeed: '48 kB',
      totalBandwidth: '0'
    };
  };

  // Use real system resources if available, otherwise use fallback data
  const systemResources = systemResourcesData || generateSystemResourceData();

  // Pre-process metrics data for DNS cards
  const generateDNSCardData = () => {
    if (!dnsRules || !metricsData) return [];

    return dnsRules.map((rule: any) => {
      // Generate dummy success/failure history data for each DNS rule
      // This would ideally come from a time-series API endpoint
      const successFailureData = Array(24).fill(0).map((_, i) => ({
        hour: i,
        success: Math.floor(Math.random() * 100),
        failure: Math.floor(Math.random() * 20)
      }));
      
      // Find backends associated with this rule
      const targets = (rule.target_backend_urls || []).map((target: any) => {
        // Find backend metrics if available
        const backendMetric = metricsData.backend_metrics?.find(
          (b: any) => b.url === target.url
        );
        
        // If health checks are disabled for this DNS rule, all backends should be considered healthy
        // Otherwise use the health status from the health endpoint if available
        let isHealthy = true; // Default to healthy
        
        if (rule.health_check_enabled) {
          // Only check health status if health checks are enabled
          isHealthy = healthData?.backends_health ? 
            (healthData.backends_health[target.url] !== undefined ? 
              !!healthData.backends_health[target.url] : 
              target.isActive) :
            target.isActive;
        }
        
        return {
          url: target.url,
          isHealthy: isHealthy,
          isActive: target.isActive,
          requestsPerSecond: ((backendMetric?.requests || 0) / 3600) || 0, // Rough estimate with fallback
          requestsLastHour: backendMetric?.requests || 0
        };
      });
      
      return {
        dnsName: rule.hostname || 'Unknown',
        targets,
        successFailureData
      };
    });
  };

  // Get DNS card data
  const dnsCardData = !dnsLoading && !metricsLoading && dnsRules && metricsData 
    ? generateDNSCardData() 
    : [];

  // Safely get the number of active backends
  const getActiveBackendsCount = () => {
    if (!dnsRules) return "0/0";
    
    try {
      const activeCount = dnsRules.reduce(
        (count: number, rule: any) => count + 
          (rule.target_backend_urls?.filter((t: any) => t?.isActive)?.length || 0), 
        0
      );
      
      const totalCount = dnsRules.reduce(
        (count: number, rule: any) => count + (rule.target_backend_urls?.length || 0), 
        0
      );
      
      return `${activeCount}/${totalCount}`;
    } catch (error) {
      console.error("Error calculating backend counts:", error);
      return "0/0";
    }
  };

  // Set loading state
  const isLoading = healthLoading || metricsLoading || dnsLoading || systemResourcesLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-500 ml-3">Loading dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard header and controls */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
      </div>

      {/* Main Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<RiWifiLine size={24} />}
          title="Total Active Connection"
          value={dnsRules?.length || 0}
          bgColor="bg-blue-500"
          textColor="text-blue-500"
        />
        <SummaryCard
          icon={<RiSpeedLine size={24} />}
          title="Last 1 Min Requests"
          value={metricsData?.requests_last_hour || 0}
          bgColor="bg-pink-500"
          textColor="text-pink-500"
        />
        <SummaryCard
          icon={<RiServerLine size={24} />}
          title="Active Backends"
          value={getActiveBackendsCount()}
          bgColor="bg-purple-500"
          textColor="text-purple-500"
        />
        <SummaryCard
          icon={<RiTimeLine size={24} />}
          title="System Uptime"
          value={healthData?.uptime ? formatUptime(healthData.uptime) : "0s"}
          bgColor="bg-green-500"
          textColor="text-green-500"
        />
      </div>

      {/* Main Dashboard Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Main systems card */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Strong Proxy Card */}
            <div>
              <StrongProxyCard
                totalDNS={dnsRules?.length || 0}
                totalHandleLastHour={metricsData?.requests_last_hour || 0}
                requestPerMinute={(metricsData?.requests_last_hour || 0) / 60}
                cpuCores={systemResources.cpu_cores || 4}
                uploadSpeed={systemResources.upload_speed || '0 kB'}
                downloadSpeed={systemResources.download_speed || '0 kB'}
                cpuUsage={systemResources.cpu_usage || 0}
                ramUsage={systemResources.memory_usage || 0}
                diskUsage={systemResources.disk_usage || 0}
              />
            </div>
            
            {/* Resource Card */}
            <div>
              <ResourceCard
                cpuUsage={systemResources.cpu_usage || 0}
                ramUsage={systemResources.memory_usage || 0}
                swapUsage={systemResources.swap_usage || 0}
                memoryUsage={systemResources.memory_usage || 0}
              />
            </div>
            
            {/* Bandwidth Card */}
            <div>
              <BandwidthCard
                uploadSpeed={systemResources.upload_speed || '0 kB'}
                downloadSpeed={systemResources.download_speed || '0 kB'}
                totalBandwidth={systemResources.total_bandwidth || '0'}
              />
            </div>
          </div>
        </div>
        
        {/* DNS Details Cards - Full width section */}
        <div className="lg:col-span-3">
          <h2 className="text-lg font-medium text-gray-700 mb-4">DNS Rules Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dnsCardData.map((dns, index) => (
              <div key={index}>
                <DNSDetailsCard 
                  dnsName={dns.dnsName}
                  targets={dns.targets}
                  successFailureData={dns.successFailureData}
                  healthCheckEnabled={true}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* System Information Card */}
      <SystemInfoCard
        status={healthData?.status || "unavailable"}
        dbConnection={healthData?.db || "disconnected"}
        apiVersion="v1.0.0" // This could come from API when available
      />
    </div>
  );
};

export default Dashboard; 