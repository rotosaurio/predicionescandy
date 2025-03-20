import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router'; // Add this import
import RouteGuard from '../components/RouteGuard';
import { getActivityTracker } from '../utils/activityTracker';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter(); // Add this line

  // Global error handler
  useEffect(() => {
    const handleGlobalError = (error: ErrorEvent) => {
      console.error('Global error captured:', error);
      // You could send this to an error tracking service like Sentry
    };

    // Add error handler
    window.addEventListener('error', handleGlobalError);
    
    // Clean up
    return () => {
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  // Log when app loads
  useEffect(() => {
    console.log('App initialized');
    
    // Check browser features
    if (typeof window !== 'undefined') {
      console.log('LocalStorage available:', typeof localStorage !== 'undefined');
      console.log('Fetch API available:', typeof fetch !== 'undefined');
      console.log('SessionStorage available:', typeof sessionStorage !== 'undefined');
    }
  }, []);

  useEffect(() => {
    // Initialize activity tracker on page changes
    const handleRouteChange = (url: string) => {
      const activityTracker = getActivityTracker();
      activityTracker.recordPageView(url);
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
