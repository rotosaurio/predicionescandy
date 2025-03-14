import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { 
  authenticateUser, 
  setCurrentUser,
  isUserLoggedIn 
} from '../utils/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  
  // Check if user is already logged in
  useEffect(() => {
    if (isUserLoggedIn()) {
      const { redirect } = router.query;
      const redirectPath = typeof redirect === 'string' ? redirect : '/';
      router.push(redirectPath);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const user = authenticateUser(username, password);
    
    if (!user) {
      setError('Usuario o contraseña incorrectos');
      return;
    }

    // Store user in memory (will be lost on refresh)
    setCurrentUser(user);
    
    // Get redirect path from query parameters or default destinations
    const { redirect } = router.query;
    
    if (typeof redirect === 'string' && redirect) {
      // Make sure we're not redirecting to a dynamic route template
      if (redirect.includes('[') || redirect.includes(']')) {
        // Default to home page
        router.push('/');
      } else {
        router.push(redirect);
      }
    } else {
      // Redirect based on user role
      if (user.role === 'normal' && user.sucursal) {
        router.push(`/sucursal/${encodeURIComponent(user.sucursal)}`);
      } else if (user.role === 'advanced') {
        router.push('/enrique');
      } else if (user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Iniciar Sesión
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Usuario
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Iniciar Sesión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}