import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { authenticateUser, setCurrentUser } from '../utils/auth';
import { checkSystemStatus, isSystemActive } from '../utils/systemStatus';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { timeout } = router.query;

  // Check system status on component mount
  useEffect(() => {
    const fetchSystemStatus = async () => {
      const status = await checkSystemStatus();
      console.log('Login page received system status:', status);
      setSystemStatus(status);
    };
    
    fetchSystemStatus();
    
    // Periodically check system status
    const intervalId = setInterval(fetchSystemStatus, 30000); // Every 30 seconds
    
    return () => clearInterval(intervalId);
  }, []);

  // Mostrar mensaje de sesión cerrada por inactividad
  useEffect(() => {
    if (timeout === 'true') {
      setError('Su sesión ha sido cerrada por inactividad. Por favor, inicie sesión nuevamente.');
    }
  }, [timeout]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Check system status but don't prevent login
    if (!isSystemActive(systemStatus)) {
      const freshStatus = await checkSystemStatus(); // Refresh status
      setSystemStatus(freshStatus);
      
      // We still update the status but don't return early
      // This way the user can still log in during maintenance
    }

    try {
      const user = await authenticateUser(username, password);
      
      if (user) {
        setCurrentUser(user);
        
        // Always redirect advanced users to their panel
        if (user.role === 'advanced') {
          router.push('/enrique');
          return;
        }
        
        // Determine redirect path for other user types
        let returnUrl = router.query.redirect as string || router.query.returnUrl as string || '/';
        
        // Add validation for sucursal paths
        if (returnUrl.includes('/sucursal/[')) {
          console.warn('Invalid return URL detected, redirecting to home page');
          returnUrl = '/';
        }
        
        // For normal users with assigned branch, redirect to their branch page
        if (user.role === 'normal' && user.sucursal) {
          returnUrl = `/sucursal/${encodeURIComponent(user.sucursal)}`;
        }
        
        router.push(returnUrl);
      } else {
        setError('Usuario o contraseña inválidos');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Image 
              src="/LOGO.png" 
              alt="Candy Mart Logo" 
              width={300} 
              height={300} 
              priority
            />
          </div>
          <h2 className="mt-6 text-center text-2xl font-extrabold text-gray-900 dark:text-white">
            Sistema de Predicción de Requerimienos Candy Mart
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Ingrese sus credenciales para continuar
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-200">{error}</h3>
                </div>
              </div>
            </div>
          )}
          
          {timeout === 'true' && !error && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Su sesión ha sido cerrada por inactividad. Por favor, inicie sesión nuevamente.
                  </h3>
                </div>
              </div>
            </div>
          )}
          
          {systemStatus && !isSystemActive(systemStatus) && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Sistema en mantenimiento. Algunas funciones pueden no estar disponibles.
                    <br/>
                    <small className="text-xs">(Debug: estado={systemStatus.estado})</small>
                  </h3>
                </div>
              </div>
            </div>
          )}
          
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">Usuario</label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm dark:bg-gray-800"
                placeholder="Usuario"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm dark:bg-gray-800"
                placeholder="Contraseña"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading} // Removed !isSystemActive(systemStatus) condition
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-[#0B9ED9] hover:bg-[#0989c0] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
              }`}
            >
              {loading ? 'Procesando...' : 'Iniciar sesión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}