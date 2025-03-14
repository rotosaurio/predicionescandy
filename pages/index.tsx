import Image from "next/image";
import localFont from "next/font/local";
import { useState, useEffect } from "react";
import Link from "next/link";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState<"online" | "offline" | "unknown">("unknown");

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Obtener sucursales
        const response = await fetch('/api/proxy?endpoint=sucursales');
        if (!response.ok) throw new Error("Error al obtener sucursales");
        
        const data = await response.json();
        if (data && Array.isArray(data.sucursales)) {
          setBranches(data.sucursales);
        }

        // Verificar estado del sistema
        const statusResponse = await fetch('/api/proxy?endpoint=estado');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const isOnline = statusData.estado === "online" || statusData.originalResponse?.branches > 0;
          setSystemStatus(isOnline ? "online" : "offline");
        }
      } catch (err) {
        setError("Error al cargar sucursales. Por favor, intente más tarde.");
        console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

    fetchBranches();
  }, []);

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-gray-50 dark:bg-gray-900 font-[family-name:var(--font-geist-sans)]`}>
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Image
              className="dark:invert"
              src="https://nextjs.org/icons/next.svg"
              alt="Logo"
              width={100}
              height={20}
              priority
            />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sistema de Predicción de Inventario</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                systemStatus === 'online' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' 
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
              }`}>
                Sistema: {systemStatus === 'online' ? 'En línea' : 'Fuera de línea'}
              </div>
              <div className="flex space-x-2">
                <Link 
                  href="/admin" 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Administración
                </Link>
                <Link 
                  href="/enrique" 
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Panel Avanzado
                </Link>
              </div>
          </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            <span className="ml-3 text-gray-700 dark:text-gray-300">Cargando sucursales...</span>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Seleccione una Sucursal</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {branches.map((branch) => (
                <Link 
                  key={branch}
                  href={`/sucursal/${encodeURIComponent(branch)}`}
                  className="block"
                >
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-lg transition-shadow">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{branch}</h3>
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-md text-xs font-medium">
                        Sucursal
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Ver últimas predicciones e inventario recomendado
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-indigo-600 dark:text-indigo-400 text-sm font-medium flex items-center">
                        Ver detalles
                        <svg className="ml-1 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                </div>
                </div>
                  </div>
                </Link>
              ))}
              </div>
              
            {branches.length === 0 && (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Sin sucursales</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No hay sucursales disponibles en el sistema.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-16 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Sistema de Predicción de Inventario © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
