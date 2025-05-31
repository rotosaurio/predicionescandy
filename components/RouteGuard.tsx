import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { isUserLoggedIn, getCurrentUser, checkUserAccess } from '../utils/auth';
import InactivityWarning from './InactivityWarning';
import InactivityCounter from './InactivityCounter';
import { handleUserActivity } from '../utils/inactivityHandler';
import { getActivityTrackerV2 } from '../utils/activityTrackerV2';

interface RouteGuardProps {
  children: React.ReactNode;
}

export default function RouteGuard({ children }: RouteGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false); // Add this state to track if auth check has completed
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);

  // Iniciar y detener el ActivityTracker cuando cambia la autorización
  useEffect(() => {
    if (authorized) {
      // Iniciar seguimiento de actividad
      const activityTracker = getActivityTrackerV2();
      activityTracker.startTracking(router.pathname);
      
      // Configurar monitor de inactividad
      const inactivityCheckInterval = setInterval(() => {
        const activityStats = activityTracker.getSessionStats();
        if (activityStats && activityStats.isIdle) {
          setShowInactivityWarning(true);
        } else {
          setShowInactivityWarning(false);
        }
      }, 5000); // Comprobar cada 5 segundos
      
      return () => {
        clearInterval(inactivityCheckInterval);
        activityTracker.stopTracking();
      };
    }
  }, [authorized, router.pathname]);

  useEffect(() => {
    // Auth check function that verifies if route can be accessed
    const authCheck = async (url: string) => {
      // Add a short delay to ensure session is loaded (especially after page refresh)
      if (!authChecked) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const publicPaths = ['/login'];
      const path = url.split('?')[0];
      
      if (publicPaths.includes(path)) {
        setAuthorized(true);
        setAuthChecked(true);
        return;
      }
      
      const loggedIn = isUserLoggedIn();
      if (!loggedIn) {
        setAuthorized(false);
        setAuthChecked(true);
        router.push({
          pathname: '/login',
          query: { returnUrl: router.asPath }
        });
        return;
      }
      
      // Get current user
      const user = getCurrentUser();
      const accessCheck = checkUserAccess(user, path);
      
      if (accessCheck.authorized) {
        setAuthorized(true);
      } else {
        setAuthorized(false);
        
        // Redirect to specified route or login
        const redirectTo = accessCheck.redirectTo || '/login';
        if (router.pathname !== redirectTo) {
          console.log(`Unauthorized access to ${path}, redirecting to ${redirectTo}`);
          router.push(redirectTo);
        } else {
          router.push('/login');
        }
      }
      
      setAuthChecked(true);
    };

    // Run auth check on initial load
    authCheck(router.asPath);

    // Run auth check on route change
    const hideContent = () => {
      setAuthorized(false);
      setAuthChecked(false); // Reset auth check status on route change
    };
    router.events.on('routeChangeStart', hideContent);
    router.events.on('routeChangeComplete', authCheck);

    return () => {
      router.events.off('routeChangeStart', hideContent);
      router.events.off('routeChangeComplete', authCheck);
    };
  }, [router]);

  // Función para manejar la actividad del usuario y reiniciar el temporizador
  const handleActivity = () => {
    handleUserActivity();
    setShowInactivityWarning(false);
  };

  // Show loading state until auth check is complete, then show content if authorized
  return authChecked ? (
    authorized ? (
      <>
        {children}
        <InactivityCounter onActivity={handleActivity} />
        {showInactivityWarning && (
          <InactivityWarning 
            warningTime={0} // Ya estamos controlando cuándo mostrar la advertencia
            logoutTime={60000} // 1 minuto
            onActivity={handleActivity}
          />
        )}
      </>
    ) : (
      <div className="flex justify-center items-center h-screen">Autenticando...</div>
    )
  ) : (
    <div className="flex justify-center items-center h-screen">Cargando...</div>
  );
}
