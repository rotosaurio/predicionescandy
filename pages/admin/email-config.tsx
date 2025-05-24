import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';

// Importar componentes de autenticación
import { isUserLoggedIn, canAccessAdminPanel, getCurrentUser } from '../../utils/auth';

// Logger simplificado para esta página
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[EMAIL-CONFIG] [INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`[EMAIL-CONFIG] [ERROR] ${message}`, data ? JSON.stringify(data) : '');
  }
};

export default function EmailConfigPage() {
  const router = useRouter();
  
  // Estado para manejar la configuración
  const [destinationEmails, setDestinationEmails] = useState<string[]>(['']);
  const [currentEmail, setCurrentEmail] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<string>('unknown');
  
  // Validar que el usuario tenga permisos de admin
  useEffect(() => {
    const checkAccess = async () => {
      if (!isUserLoggedIn()) {
        router.push('/login?returnUrl=/admin/email-config');
        return;
      }
      
      const user = getCurrentUser();
      if (!user || !canAccessAdminPanel(user)) {
        router.push('/');
        return;
      }
      
      // Cargar la configuración actual
      await fetchCurrentConfig();
    };
    
    checkAccess();
  }, []);
  
  // Cargar la configuración actual de correo desde la API
  const fetchCurrentConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/email-config');
      if (!response.ok) {
        throw new Error(`Error al cargar la configuración: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.config) {
        if (data.config.destinationEmail) {
          // Verificar si es un solo correo o múltiples separados por comas
          const emails = data.config.destinationEmail.includes(',') 
            ? data.config.destinationEmail.split(',').map((email: string) => email.trim())
            : [data.config.destinationEmail];
          
          setDestinationEmails(emails);
          setCurrentEmail('');
        } else {
          setDestinationEmails(['']);
        }
        
        setScheduledTime(data.config.scheduledTime || '08:00');
        setIsActive(data.config.isActive !== false);
        
        logger.info('Configuración de correo cargada', data.config);
      }
    } catch (error) {
      setError('Error al cargar la configuración. Por favor, inténtelo de nuevo.');
      logger.error('Error al cargar configuración de correo', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Agregar un nuevo correo a la lista
  const addEmail = () => {
    if (!currentEmail.trim()) return;
    
    // Validar correo
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(currentEmail)) {
      setError('Por favor, ingrese un correo electrónico válido');
      return;
    }
    
    // Verificar duplicados
    if (destinationEmails.includes(currentEmail)) {
      setError('Este correo ya está en la lista');
      return;
    }
    
    setDestinationEmails([...destinationEmails, currentEmail]);
    setCurrentEmail('');
    setError(null);
  };
  
  // Eliminar un correo de la lista
  const removeEmail = (indexToRemove: number) => {
    setDestinationEmails(destinationEmails.filter((_, index) => index !== indexToRemove));
  };
  
  // Guardar la configuración 
  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      // Verificar que hay al menos un correo
      if (destinationEmails.length === 0 || (destinationEmails.length === 1 && !destinationEmails[0].trim())) {
        setError('Debe agregar al menos un correo electrónico');
        setSaving(false);
        return;
      }
      
      // Validar formato de hora
      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timeRegex.test(scheduledTime)) {
        setError('La hora debe estar en formato HH:MM (24h)');
        setSaving(false);
        return;
      }
      
      // Unir los correos en un string separado por comas
      const emailsString = destinationEmails.join(', ');
      
      // Asegurarse de que la configuración esté activada a menos que el usuario la desactive explícitamente
      const configToSave = {
        destinationEmail: emailsString,
        scheduledTime,
        isActive: isActive
      };
      
      const response = await fetch('/api/email-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(configToSave)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess('Configuración guardada correctamente');
        logger.info('Configuración de correo guardada', {
          emails: emailsString,
          time: scheduledTime,
          isActive
        });
      } else {
        throw new Error(data.message || 'Error al guardar la configuración');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al guardar la configuración');
      logger.error('Error al guardar configuración de correo', error);
    } finally {
      setSaving(false);
    }
  };
  
  // Enviar correo de prueba
  const sendTestEmail = async () => {
    try {
      setTestSending(true);
      setError(null);
      setSuccess(null);
      
      // Verificar que hay al menos un correo
      if (destinationEmails.length === 0 || (destinationEmails.length === 1 && !destinationEmails[0].trim())) {
        setError('Debe agregar al menos un correo electrónico para la prueba');
        setTestSending(false);
        return;
      }
      
      // Enviamos el correo de prueba al primer destinatario para simplificar
      const testEmail = destinationEmails[0];
      
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: testEmail
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(`Correo de prueba enviado correctamente a ${testEmail}`);
        logger.info('Correo de prueba enviado', { email: testEmail });
      } else {
        throw new Error(data.message || 'Error al enviar correo de prueba');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al enviar correo de prueba');
      logger.error('Error al enviar correo de prueba', error);
    } finally {
      setTestSending(false);
    }
  };
  
  // Enviar reporte manualmente
  const sendManualReport = async () => {
    try {
      setSendingReport(true);
      setError(null);
      setSuccess(null);
      
      // Verificar que hay al menos un correo
      if (destinationEmails.length === 0 || (destinationEmails.length === 1 && !destinationEmails[0].trim())) {
        setError('Debe agregar al menos un correo electrónico para enviar el reporte');
        setSendingReport(false);
        return;
      }
      
      // Enviamos el reporte al primer destinatario para simplificar
      const reportEmail = destinationEmails[0];
      
      const response = await fetch('/api/cron/send-activity-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: reportEmail
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(`Reporte enviado manualmente a ${reportEmail}`);
        logger.info('Reporte enviado manualmente', { email: reportEmail });
      } else {
        throw new Error(data.message || 'Error al enviar el reporte manualmente');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al enviar el reporte');
      logger.error('Error al enviar reporte manual', error);
    } finally {
      setSendingReport(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Head>
        <title>Configuración de Correo | Sistema de Predicciones</title>
      </Head>
      
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración de Reportes por Correo</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                systemStatus === 'activo' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' 
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
              }`}>
                Sistema: {systemStatus === 'activo' ? 'En línea' : 'Fuera de línea'}
              </div>
              <Link 
                href="/admin" 
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-2"
              >
                ← Volver al panel
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <div className="max-w-3xl mx-auto">
            {/* Información sobre la funcionalidad */}
            <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">Acerca de los Reportes Diarios</h2>
              <p className="text-blue-700 dark:text-blue-400 text-sm mb-2">
                Configure el envío automático de reportes diarios con estadísticas de actividad de usuarios por sucursal.
              </p>
              <p className="text-blue-700 dark:text-blue-400 text-sm">
                El sistema enviará un reporte cada día a la hora especificada con información sobre:
              </p>
              <ul className="list-disc list-inside text-blue-700 dark:text-blue-400 text-sm mt-2 ml-4">
                <li>Última conexión por sucursal</li>
                <li>Tiempo activo de usuarios</li>
                <li>Estadísticas de uso por usuario</li>
                <li>Exportaciones de reportes Excel por sucursal</li>
                <li>Predicciones generadas por sucursal</li>
                <li>Estadísticas de uso de módulos</li>
                <li>Errores detectados en el sistema</li>
              </ul>
            </div>
            
            {/* Alertas de error/éxito */}
            {error && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                <p className="text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}
            
            {success && (
              <div className="mb-6 bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <p className="text-green-700 dark:text-green-400">{success}</p>
              </div>
            )}
            
            {/* Formulario de configuración */}
            <form onSubmit={saveConfig} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Correos de Destino
                </label>
                
                {/* Lista de correos agregados */}
                <div className="mb-4">
                  {destinationEmails.length > 0 && destinationEmails[0] !== '' ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {destinationEmails.map((email, index) => (
                        <div 
                          key={index} 
                          className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 px-3 py-1 rounded-full flex items-center text-sm"
                        >
                          <span>{email}</span>
                          <button 
                            type="button" 
                            onClick={() => removeEmail(index)}
                            className="ml-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      No hay correos configurados. Agregue al menos uno.
                    </p>
                  )}
                </div>
                
                {/* Agregar nuevo correo */}
                <div className="flex items-center">
                  <input
                    type="email"
                    value={currentEmail}
                    onChange={(e) => setCurrentEmail(e.target.value)}
                    placeholder="nuevo@correo.com"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={addEmail}
                    className="ml-3 inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Agregar
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Direcciones de correo donde se enviarán los reportes diarios.
                </p>
              </div>
              
              <div>
                <label htmlFor="time" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Hora de Envío
                </label>
                <div className="mt-1">
                  <input
                    type="time"
                    id="time"
                    name="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="block rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                    required
                  />
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Hora del día a la que se enviará el reporte (formato 24h).
                </p>
              </div>
              
              <div className="flex items-center">
                <input
                  id="active"
                  name="active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
                />
                <label htmlFor="active" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Activar envío automático de reportes
                </label>
              </div>
              
              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
                
                <button
                  type="button"
                  onClick={sendTestEmail}
                  disabled={testSending || destinationEmails.length === 0 || destinationEmails[0] === ''}
                  className="inline-flex justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600"
                >
                  {testSending ? 'Enviando...' : 'Enviar Correo de Prueba'}
                </button>
                
                <button
                  type="button"
                  onClick={sendManualReport}
                  disabled={sendingReport || destinationEmails.length === 0 || destinationEmails[0] === ''}
                  className="inline-flex justify-center items-center rounded-md border border-green-500 bg-green-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingReport ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generando reporte...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Enviar Reporte Ahora
                    </span>
                  )}
                </button>
              </div>
            </form>

            {/* Información adicional sobre los reportes */}
            <div className="mt-10 border-t border-gray-200 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Información adicional sobre los reportes</h3>
              
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white">Datos de Exportaciones</h4>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Los reportes ahora incluyen estadísticas detalladas sobre exportaciones de Excel, descargas de reportes
                      y otras acciones importantes por cada sucursal.
                    </p>
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white">Últimas Conexiones</h4>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Se detalla la última vez que cada sucursal realizó una conexión al sistema, así como la 
                      última acción realizada y por qué usuario.
                    </p>
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white">Monitoreo de Errores</h4>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      El reporte incluye una sección de errores detectados en el sistema, permitiendo 
                      identificar problemas técnicos rápidamente.
                    </p>
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white">Uso por Módulo</h4>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Estadísticas sobre qué módulos del sistema se utilizan más frecuentemente y el tiempo
                      promedio que los usuarios dedican a cada uno.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700 dark:text-yellow-400">
                      Si utiliza un proveedor de correo externo como Gmail, asegúrese de permitir
                      el acceso de aplicaciones menos seguras o configurar una contraseña de aplicación.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 