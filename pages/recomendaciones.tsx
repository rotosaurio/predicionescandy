import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import localFont from 'next/font/local';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export default function RecomendacionesPage() {
  const [sucursal, setSucursal] = useState('');
  const [fecha, setFecha] = useState('');
  const [limite, setLimite] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [sucursales, setSucursales] = useState<string[]>([]);
  const [loadingSucursales, setLoadingSucursales] = useState(true);

  // Obtener lista de sucursales al cargar la página
  useEffect(() => {
    async function fetchSucursales() {
      try {
        const response = await fetch('/api/proxy?endpoint=sucursales');
        if (!response.ok) throw new Error('Error al obtener sucursales');
        
        const data = await response.json();
        if (data && Array.isArray(data.sucursales)) {
          setSucursales(data.sucursales);
        }
      } catch (error) {
        console.error('Error:', error);
        setError('Error al cargar sucursales');
      } finally {
        setLoadingSucursales(false);
      }
    }
    
    fetchSucursales();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sucursal) {
      setError('La sucursal es obligatoria');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/api/recomendaciones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sucursal,
          fecha: fecha || undefined,
          limite: limite || undefined,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Error al obtener recomendaciones');
      }

      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recomendaciones Directas</h1>
            </div>
            <Link 
              href="/" 
              className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-2"
            >
              ← Volver al inicio
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Solicitar Recomendaciones del Modelo</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Esta herramienta te permite obtener recomendaciones directamente del modelo, sin generar recomendaciones automáticas. 
            Las recomendaciones son específicas para cada sucursal y pueden incluir productos que no están en las predicciones.
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="sucursal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sucursal <span className="text-red-500">*</span>
              </label>
              {loadingSucursales ? (
                <div className="animate-pulse h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ) : (
                <select
                  id="sucursal"
                  value={sucursal}
                  onChange={(e) => setSucursal(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Selecciona una sucursal</option>
                  {sucursales.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            <div>
              <label htmlFor="fecha" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fecha (opcional)
              </label>
              <input
                id="fecha"
                type="text"
                placeholder="DD/MM/YYYY"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Formato: DD/MM/YYYY. Si no se especifica, se usa la fecha actual.
              </p>
            </div>
            
            <div>
              <label htmlFor="limite" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Límite de resultados (opcional)
              </label>
              <input
                id="limite"
                type="number"
                min="1"
                max="500"
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Número máximo de recomendaciones a obtener. El valor predeterminado es 50.
              </p>
            </div>
            
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className={`px-4 py-2 rounded-md text-white font-medium ${
                  loading
                    ? 'bg-gray-400 dark:bg-gray-600'
                    : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                } transition-colors`}
              >
                {loading ? 'Cargando...' : 'Obtener Recomendaciones'}
              </button>
            </div>
          </form>
          
          {error && (
            <div className="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
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
          )}
        </div>

        {results && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resultados</h2>
              <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 rounded-full text-sm font-medium">
                {results.total} recomendaciones
              </span>
            </div>
            
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Sucursal:</span>{' '}
                  <span className="text-gray-900 dark:text-white">{results.sucursal}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Fecha:</span>{' '}
                  <span className="text-gray-900 dark:text-white">{results.fecha}</span>
                </div>
              </div>
            </div>
            
            {results.recomendaciones && results.recomendaciones.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Producto
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Cantidad
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Confianza
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Motivo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {results.recomendaciones.map((recomendacion: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">
                          {recomendacion.nombre || recomendacion.NOMBRE_ARTICULO}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                          {recomendacion.cantidad_sugerida || recomendacion.CANTIDAD_PREDICHA}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                          {typeof recomendacion.confianza !== 'undefined' 
                            ? `${recomendacion.confianza.toFixed(1)}%` 
                            : typeof recomendacion.CONFIANZA !== 'undefined'
                              ? `${recomendacion.CONFIANZA.toFixed(1)}%`
                              : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                          {recomendacion.tipo || recomendacion.TIPO_RECOMENDACION || '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                          {recomendacion.motivo || recomendacion.MOTIVO || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Sin recomendaciones</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No se encontraron recomendaciones para esta sucursal y fecha.
                </p>
              </div>
            )}
            
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => {
                  const jsonStr = JSON.stringify(results, null, 2);
                  const blob = new Blob([jsonStr], { type: 'application/json' });
                  const href = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = href;
                  link.download = `recomendaciones-${results.sucursal}-${results.fecha}.json`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md transition-colors"
              >
                Descargar JSON
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-16 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Sistema de Predicción de Inventario © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
} 