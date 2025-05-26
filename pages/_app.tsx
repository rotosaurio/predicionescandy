import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import RouteGuard from '../components/RouteGuard';
import { getActivityTracker } from '../utils/activityTracker';
import { getCurrentUser } from '../utils/auth';
import loggers, { setupGlobalErrorLogging, logError, logUserAction } from '../utils/logging';
import { initScheduler } from '../utils/schedulerService';

// Crear un logger básico para no depender de módulos que pueden fallar en el cliente
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data);
  },
  error: (message: string, data?: any) => {
    console.error(`[ERROR] ${message}`, data);
  },
  debug: (message: string, data?: any) => {
    console.log(`[DEBUG] ${message}`, data);
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data);
  }
};

// Variable para controlar la inicialización del servidor
let isServerInitialized = false;

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Inicializar servicios del lado del servidor (solo una vez)
  useEffect(() => {
    const initServer = async () => {
      // Solo ejecutar en el servidor y solo una vez
      if (typeof window === 'undefined' && !isServerInitialized) {
        isServerInitialized = true;
        
        try {
          // Importar dinámicamente el módulo del servidor
          const { importServerOnlyModule } = await import('../utils/server-helpers');
          await importServerOnlyModule();
        } catch (err) {
          console.error('Error al inicializar servicios del servidor:', err);
        }
      }
    };
    
    initServer();
  }, []);

  // Configurar captura global de errores
  useEffect(() => {
    setupGlobalErrorLogging();
    
    const handleGlobalError = (error: ErrorEvent) => {
      logError('APP', error, { 
        location: window.location.href,
        component: 'Global'
      });
    };

    // Add error handler
    window.addEventListener('error', handleGlobalError);
    
    // Clean up
    return () => {
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  // Inicializar aplicación en el cliente
  useEffect(() => {
    logger.info('Aplicación inicializada');
    
    // Verificar APIs disponibles del navegador
    logger.debug('APIs disponibles:', {
      localStorage: typeof localStorage !== 'undefined',
      fetch: typeof fetch !== 'undefined',
      sessionStorage: typeof sessionStorage !== 'undefined'
    });
    
    // Iniciar seguimiento de actividad si hay usuario autenticado
    try {
      const user = getCurrentUser();
      if (user) {
        logger.info(`Usuario autenticado: ${user.username}`, { 
          role: user.role, 
          sucursal: user.sucursal || 'N/A'
        });
        
        const activityTracker = getActivityTracker();
        activityTracker.startTracking();
        
        // Registrar vista inicial de página
    if (typeof window !== 'undefined') {
          activityTracker.recordPageView(window.location.pathname);
        }
      } else {
        logger.info('No hay usuario autenticado en la sesión actual');
      }
    } catch (error) {
      logger.error('Error en inicialización de autenticación', error);
    }
    
    return () => {
      try {
        // Limpiar seguimiento de actividad
        const activityTracker = getActivityTracker();
        activityTracker.stopTracking();
        
        // Registrar evento de fin de sesión
        const user = getCurrentUser();
        if (user) {
          logger.info('Sesión finalizada', {
            username: user.username,
            timestamp: new Date().toISOString(),
            path: window.location.pathname
          });
        }
      } catch (error) {
        logger.error('Error al limpiar seguimiento de actividad', error);
    }
    };
  }, []);

  // Seguimiento de cambios de ruta
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      try {
      const activityTracker = getActivityTracker();
      activityTracker.recordPageView(url);
        
        logger.debug(`Navegación a: ${url}`);
        
        // Registrar evento de navegación
        const user = getCurrentUser();
        if (user) {
          logger.info('Navegación de usuario', { 
            path: url,
            username: user.username
          });
        }
      } catch (error) {
        logger.error('Error en navegación', { url, error });
      }
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  return (
    <RouteGuard>
      <Component {...pageProps} />
    </RouteGuard>
  );
}

export default MyApp;
