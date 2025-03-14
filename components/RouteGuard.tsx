import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { isUserLoggedIn, getCurrentUser, isRouteAuthorized } from '../utils/auth';

type RouteGuardProps = {
  children: React.ReactNode;
};

export const RouteGuard = ({ children }: RouteGuardProps) => {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Auth check function that verifies if route can be accessed
    const authCheck = (url: string) => {
      const publicPaths = ['/login'];
      const path = url.split('?')[0];
      
      // Allow access to public paths
      if (publicPaths.includes(path)) {
        setAuthorized(true);
        return;
      }
      
      const user = getCurrentUser();
      const loggedIn = isUserLoggedIn();
      
      if (!loggedIn) {
        setAuthorized(false);
        router.push({
          pathname: '/login',
          query: { redirect: router.pathname }
        });
        return;
      }
      
      // Check if the user has permission to access this route
      if (user && isRouteAuthorized(user, path)) {
        setAuthorized(true);
      } else {
        setAuthorized(false);
        
        // Redirect based on user role
        if (user && user.role === 'normal' && user.sucursal) {
          router.push(`/sucursal/${encodeURIComponent(user.sucursal)}`);
        } else if (user && user.role === 'advanced') {
          router.push('/enrique');
        } else if (user && user.role === 'admin') {
          router.push('/admin');
        } else {
          router.push('/login');
        }
      }
    };

    // Wait until router is ready before checking auth
    if (router.isReady) {
      // Initial auth check
      authCheck(router.asPath);

      // Set up event listener for route changes
      const handleRouteChange = (url: string) => authCheck(url);
      router.events.on('routeChangeComplete', handleRouteChange);

      // Clean up event listener
      return () => {
        router.events.off('routeChangeComplete', handleRouteChange);
      };
    }
  }, [router, router.isReady]);

  return authorized ? <>{children}</> : null;
};
