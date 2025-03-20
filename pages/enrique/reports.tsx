import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getActivityTracker } from '../../utils/activityTracker';

// Helper function to format duration
const formatDuration = (milliseconds: number): string => {
  if (!milliseconds || milliseconds < 1000) return '0s';
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

export default function ActivityReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'year' | 'custom'>('month');
  const [reportData, setReportData] = useState<any[]>([]);
  const [totalStats, setTotalStats] = useState({
    totalActiveTime: 0,
    totalIdleTime: 0,
    totalInteractions: 0,
    uniqueUsers: 0
  });
  
  // New state variables for filters
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [branches, setBranches] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const activityTracker = getActivityTracker();
      activityTracker.startTracking();
      activityTracker.recordPageView('Activity Reports');
    }
    
    // Fetch available branches
    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/proxy?endpoint=sucursales');
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.sucursales)) {
            setBranches(data.sucursales);
          }
        }
      } catch (error) {
        console.error('Error fetching branches:', error);
      }
    };
    
    fetchBranches();

    return () => {
      if (typeof window !== 'undefined') {
        const activityTracker = getActivityTracker();
        activityTracker.stopTracking();
      }
    };
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Note: In a real application, you'd need to securely handle the admin key
      // This is just for demonstration and should be properly secured
      const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin-key'; 
      
      // Base URL with period parameter
      let url = `/api/user-activity-report?period=${period}&adminKey=${adminKey}`;
      
      // Add date range parameters if using custom period
      if (period === 'custom') {
        if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
      }
      
      // Add branch filter if selected
      if (selectedBranch) {
        url += `&branch=${encodeURIComponent(selectedBranch)}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Error fetching report data: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setReportData(data.data || []);
        
        // Calculate total stats
        let activeTime = 0;
        let idleTime = 0;
        let interactions = 0;
        const userSet = new Set<string>();
        
        data.data.forEach((dateGroup: any) => {
          dateGroup.users.forEach((user: any) => {
            activeTime += user.totalActiveTime || 0;
            idleTime += user.totalIdleTime || 0;
            interactions += user.interactionCount || 0;
            userSet.add(user.userId);
          });
        });
        
        setTotalStats({
          totalActiveTime: activeTime,
          totalIdleTime: idleTime,
          totalInteractions: interactions,
          uniqueUsers: userSet.size
        });
      } else {
        throw new Error(data.message || 'Error loading report data');
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      setError(err instanceof Error ? err.message : 'Error loading report data');
    } finally {
      setLoading(false);
    }
  };

  // Function to clear all filters
  const clearFilters = () => {
    setPeriod('month');
    setSelectedBranch('');
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const runArchive = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // This would need proper security in production
      const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin-key';
      
      const response = await fetch('/api/user-activity-archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminKey,
          monthsToKeep: 3
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`Archive complete: ${data.message}`);
        // Refresh data
        fetchReportData();
      } else {
        throw new Error(data.message || 'Error archiving data');
      }
    } catch (err) {
      console.error('Error archiving data:', err);
      setError(err instanceof Error ? err.message : 'Error archiving data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Image
                className="dark:invert"
                src="/LOGO.png"
                alt="Logo"
                width={100}
                height={20}
                priority
              />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reportes de Actividad</h1>
            </div>
            <div>
              <Link 
                href="/enrique" 
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-2"
              >
                ← Volver al panel principal
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Configuración del Reporte</h2>
            <div className="flex space-x-4">
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm font-medium dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
                disabled={loading}
              >
                Limpiar Filtros
              </button>
              <button
                onClick={runArchive}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-medium"
                disabled={loading}
              >
                Ejecutar Archivado
              </button>
              <button
                onClick={fetchReportData}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium"
                disabled={loading}
              >
                Actualizar Datos
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="period" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Período
              </label>
              <select
                id="period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              >
                <option value="week">Última Semana</option>
                <option value="month">Último Mes</option>
                <option value="quarter">Último Trimestre</option>
                <option value="year">Último Año</option>
                <option value="custom">Rango Personalizado</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="branch" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sucursal
              </label>
              <select
                id="branch"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              >
                <option value="">Todas las sucursales</option>
                {branches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Date range inputs for custom period */}
          {period === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fecha Inicio
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fecha Fin
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          )}
          
          {/* Active filters display */}
          {(selectedBranch || period === 'custom') && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Filtros activos:</span>
              {selectedBranch && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  Sucursal: {selectedBranch}
                </span>
              )}
              {period === 'custom' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                  Rango: {startDate} a {endDate}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Summary Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Resumen del Período</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-100 dark:border-purple-900/50">
              <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Usuarios Activos</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-1">{totalStats.uniqueUsers}</p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-100 dark:border-green-900/50">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">Tiempo Activo Total</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">{formatDuration(totalStats.totalActiveTime)}</p>
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-100 dark:border-yellow-900/50">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Tiempo Inactivo Total</p>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100 mt-1">{formatDuration(totalStats.totalIdleTime)}</p>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-900/50">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Interacciones Totales</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">{totalStats.totalInteractions.toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        {/* Report Data Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Datos por Fecha</h2>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              <span className="ml-3 text-gray-700 dark:text-gray-300">Cargando datos...</span>
            </div>
          ) : reportData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fecha</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Usuarios Activos</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tiempo Activo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tiempo Inactivo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Interacciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {reportData.map((dateGroup, index) => {
                    // Calculate totals for this date
                    let dateActiveTime = 0;
                    let dateIdleTime = 0;
                    let dateInteractions = 0;
                    
                    dateGroup.users.forEach((user: any) => {
                      dateActiveTime += user.totalActiveTime || 0;
                      dateIdleTime += user.totalIdleTime || 0;
                      dateInteractions += user.interactionCount || 0;
                    });
                    
                    const displayDate = period === 'year' 
                      ? format(new Date(`${dateGroup.date}-01`), 'MMMM yyyy', { locale: es })
                      : format(new Date(dateGroup.date), 'dd MMMM yyyy', { locale: es });
                    
                    return (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {displayDate}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {dateGroup.users.length}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDuration(dateActiveTime)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDuration(dateIdleTime)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {dateInteractions.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M9 16h.01M15 16h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No hay datos disponibles</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No se encontraron datos de actividad para el período seleccionado.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
