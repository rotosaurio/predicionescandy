import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { isUserLoggedIn, getCurrentUser, checkUserAccess } from '../utils/auth';

interface RouteGuardProps {
  children: React.ReactNode;
}

export default function RouteGuard({ children }: RouteGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Auth check function that verifies if route can be accessed
    const authCheck = async (url: string) => {
      const publicPaths = ['/login'];
      const path = url.split('?')[0];
      
      // Allow access to public paths
      if (publicPaths.includes(path)) {
        setAuthorized(true);
        return;
      }

      const isLoggedIn = await isUserLoggedIn();
      if (!isLoggedIn) {
        setAuthorized(false);
        router.push({
          pathname: '/login',
          query: { returnUrl: router.asPath }
        });
        return;
      }

      // Check if the user has permission to access this route
      const user = getCurrentUser();
      const accessCheck = checkUserAccess(user, path);
      
      if (accessCheck.authorized) {
        setAuthorized(true);
      } else {
        setAuthorized(false);
        
        // Add validation to ensure we don't navigate to invalid routes
        const redirectTo = accessCheck.redirectTo || '/login';
        
        // Check if the redirect path contains any route parameters that need to be replaced
        if (redirectTo.includes('[') && redirectTo.includes(']')) {
          console.error("Invalid redirect path detected:", redirectTo);
          router.push('/login');
        } else {
          router.push(redirectTo);
        }
      }
    };

    // Run auth check on initial load
    authCheck(router.asPath);

    // Run auth check on route change
    const hideContent = () => setAuthorized(false);
    router.events.on('routeChangeStart', hideContent);

    router.events.on('routeChangeComplete', authCheck);

    return () => {
      router.events.off('routeChangeStart', hideContent);
      router.events.off('routeChangeComplete', authCheck);
    };
  }, [router]);

  return authorized ? <>{children}</> : <div className="flex justify-center items-center h-screen">Autenticando...</div>;
}
