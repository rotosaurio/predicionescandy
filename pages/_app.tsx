import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';

function MyApp({ Component, pageProps }: AppProps) {
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
    }
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;
