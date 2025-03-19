import Image from "next/image";
import localFont from "next/font/local";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});     

export default function UploadInventarioPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [systemStatus, setSystemStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    setPreview([]);
    
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      return;
    }

    // Check if it's an Excel file
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      setError("Por favor seleccione un archivo Excel válido (.xlsx o .xls)");
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file) {
      setError("Por favor seleccione un archivo Excel primero");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      // Ensure the field name is 'file' to match what our API expects
      formData.append('file', file);
      
      // Add current date as inventoryDate field
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      formData.append('inventoryDate', today);

      console.log("Subiendo archivo:", file.name);

      const response = await fetch('/api/upload-inventario', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Error al procesar el archivo');
      }

      setSuccess(`Archivo procesado correctamente. Se guardaron ${result.count} registros.`);
      setPreview(result.preview);
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setFile(null);

    } catch (err) {
      console.error("Error en la carga:", err);
      setError(err instanceof Error ? err.message : 'Error desconocido al procesar el archivo');
    } finally {
      setLoading(false);
    }
  };

  // Check system status to display in header
  useEffect(() => {
    const checkSystemStatus = async () => {
      try {
        const response = await fetch('/api/proxy?endpoint=estado');
        if (response.ok) {
          const data = await response.json();
          const isOnline = data.estado === "online" || data.originalResponse?.branches > 0;
          setSystemStatus(isOnline ? "online" : "offline");
        }
      } catch (error) {
        console.error("Error checking system status:", error);
        setSystemStatus("unknown");
      }
    };

    checkSystemStatus();
  }, []);

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-gray-50 dark:bg-gray-900 font-[family-name:var(--font-geist-sans)]`}>
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Image
                className="dark:invert"
                src="/LOGO.png"
                alt="Logo"
                width={100}
                height={20}
                priority
              />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Carga de Inventario CEDIS</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                systemStatus === 'online' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' 
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
              }`}>
                Sistema: {systemStatus === 'online' ? 'En línea' : 'Fuera de línea'}
              </div>
              <Link 
                href="/admin/inventario" 
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-2"
              >
                ← Ver historial de inventarios
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Cargar archivo de inventario</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sube un archivo Excel que contenga las columnas "articulo" y "existencia". 
              El sistema extraerá estos campos y los guardará en la base de datos.
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
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

          {/* Success message */}
          {success && (
            <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800 dark:text-green-200">Éxito</h3>
                  <p className="mt-2 text-sm text-green-700 dark:text-green-300">{success}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label 
                htmlFor="excelFile" 
                className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Archivo Excel
              </label>
              <input
                type="file"
                id="excelFile"
                ref={fileInputRef}
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-900 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 
                  file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 
                  file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 
                  dark:file:text-indigo-400 dark:hover:file:bg-indigo-900/40"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Archivos soportados: .xlsx, .xls
              </p>
            </div>
            
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className={`w-full px-4 py-2 rounded-md ${
                !file || loading
                  ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  <span>Procesando...</span>
                </div>
              ) : (
                'Subir y procesar archivo'
              )}
            </button>
          </div>

          {/* Preview section */}
          {preview.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Vista previa de datos guardados</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Artículo ID</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Existencia</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {preview.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.articulo}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.existencia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                Mostrando los primeros 10 registros de {preview.length} guardados.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
