import React, { useState, useEffect } from 'react';
import { format, formatDistance } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserActivityStats } from '../types/models';

interface UserActivityStatsComponentProps {
  userId?: string;
  showAll?: boolean;
}

// Modified interface to match our new daily sessions
interface DailyUserSession {
  _id?: string;
  userId: string;
  username: string;
  branch?: string;
  sessionDate: string;
  startTime: Date;
  endTime?: Date;
  sessionIds: string[];
  totalActiveTime: number;
  totalIdleTime: number;
  interactionCount: number;
}

const formatDuration = (milliseconds: number): string => {
  if (!milliseconds) return '0h 0m 0s';
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
};

const UserActivityStatsComponent: React.FC<UserActivityStatsComponentProps> = ({ userId, showAll = false }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UserActivityStats[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(userId || null);
  const [userSessions, setUserSessions] = useState<DailyUserSession[]>([]);
  
  useEffect(() => {
    fetchUserActivityData();
  }, [userId, selectedUser]);
  
  const fetchUserActivityData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let url = '/api/user-activity';
      
      if (selectedUser) {
        url += `?userId=${selectedUser}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Error fetching user activity data: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (selectedUser && data.userStats) {
        // Single user stats
        setStats([data.userStats]);
        setUserSessions(data.recentSessions || []);
      } else {
        // All users stats
        setStats(data.stats || []);
        setUserSessions([]);
      }
    } catch (err) {
      console.error('Error fetching user activity:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar datos de actividad');
    } finally {
      setLoading(false);
    }
  };
  
  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
  };
  
  const renderUserList = () => {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Actividad de Usuarios</h3>
        
        {stats.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos de actividad disponibles.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Usuario</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Sucursal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Última actividad</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Días activos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tiempo total activo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {stats.map((user) => (
                  <tr key={user.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {user.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.branch || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDistance(new Date(user.lastActive), new Date(), { addSuffix: true, locale: es })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.totalSessions}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDuration(user.totalActiveTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <button
                        onClick={() => handleUserSelect(user.userId)}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        Ver detalles
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };
  
  const renderUserDetail = () => {
    const user = stats[0];
    
    if (!user) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos disponibles para este usuario.</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Estadísticas de {user.username}</h3>
            {showAll && (
              <button
                onClick={() => setSelectedUser(null)}
                className="text-sm text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                ← Volver a la lista
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900/50">
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Días Activos</p>
              <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 mt-1">{user.totalSessions}</p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-100 dark:border-green-900/50">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">Tiempo Activo Total</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">{formatDuration(user.totalActiveTime)}</p>
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-100 dark:border-yellow-900/50">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Tiempo Inactivo Total</p>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100 mt-1">{formatDuration(user.totalIdleTime)}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Promedios Diarios</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Duración diaria:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{formatDuration(user.averageSessionDuration)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tiempo activo diario:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{formatDuration(user.averageActiveTimePerSession)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Interacciones por día:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {user.totalSessions > 0 ? Math.round(user.totalInteractions / user.totalSessions) : 0}
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Páginas Más Visitadas</h4>
              {user.mostVisitedPages?.length > 0 ? (
                <ul className="space-y-1">
                  {user.mostVisitedPages.slice(0, 5).map((page, index) => (
                    <li key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400 truncate" style={{maxWidth: '200px'}}>
                        {page.page}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {page.count} {page.count === 1 ? 'visita' : 'visitas'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos disponibles</p>
              )}
            </div>
          </div>
        </div>
          
        {/* Daily Sessions - Now showing consolidated by day */}
        {userSessions.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Actividad Diaria</h3>
            
            {/* Add an information note explaining how time is calculated */}
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Nota:</strong> El tiempo de sesión se calcula desde el inicio hasta el cierre de la sesión. 
                Después de 5 minutos de inactividad, el tiempo se contabiliza como "inactivo". 
                Cualquier valor menor al 1% se muestra como mínimo 1% en la barra visual para indicar actividad.
              </p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Duración</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tiempo Activo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tiempo Inactivo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Interacciones</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">% Activo</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {userSessions.map((session) => {
                    const startTime = new Date(session.startTime);
                    const endTime = session.endTime ? new Date(session.endTime) : new Date();
                    
                    // FIXED: Calculate total time as sum of active + idle time, not from timestamps
                    // This ensures consistency with what the user is seeing
                    const totalTime = session.totalActiveTime + session.totalIdleTime;
                    const duration = Math.max(totalTime, endTime.getTime() - startTime.getTime());
                    
                    // Calculate active percentage based on total used time
                    // Ensure we show at least 0.1% if there was any activity at all
                    let activePercent = 0;
                    if (totalTime > 0) {
                      const calculatedPercent = (session.totalActiveTime / totalTime) * 100;
                      // If there's any activity but it's less than 1%, show 1% to indicate there was some activity
                      activePercent = calculatedPercent > 0 && calculatedPercent < 1 ? 1 : Math.min(Math.round(calculatedPercent), 100);
                    }
                    
                    // Calculate raw percentage for display (with decimal place for small values)
                    const rawPercent = totalTime > 0 
                      ? (session.totalActiveTime / totalTime) * 100 
                      : 0;
                    // Format to 1 decimal place for display
                    const displayPercent = rawPercent < 10 
                      ? rawPercent.toFixed(1) 
                      : Math.round(rawPercent);
                    
                    // Format date to show just the date part (no time)
                    const formattedDate = format(new Date(session.sessionDate), 'dd/MM/yyyy');
                    
                    return (
                      <tr key={session.sessionDate} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formattedDate}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDuration(duration)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDuration(session.totalActiveTime)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDuration(session.totalIdleTime)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {session.interactionCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="flex items-center">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                              <div 
                                className={`h-2.5 rounded-full ${
                                  rawPercent >= 70 ? 'bg-green-600' : 
                                  rawPercent >= 40 ? 'bg-yellow-400' : 'bg-red-500'
                                }`} 
                                style={{ 
                                  width: `${activePercent}%`,
                                  minWidth: session.totalActiveTime > 0 ? '2px' : '0'
                                }}
                              ></div>
                            </div>
                            <span className="ml-2 text-gray-600 dark:text-gray-400">{displayPercent}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
        <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">Cargando datos de actividad...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {(!selectedUser && showAll) ? renderUserList() : renderUserDetail()}
    </div>
  );
};

export default UserActivityStatsComponent;
