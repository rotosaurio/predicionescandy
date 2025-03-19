import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import Image from "next/image";
import Link from 'next/link';
import localFont from "next/font/local";

// Correct font paths: remove one level of parent directory
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

interface InventorySnapshot {
  timestamp: string;
  inventoryDate: string;
  filename: string;
  recordCount: number;
  collectionName: string;
}

const InventarioPage: React.FC = () => {
  const [inventoryHistory, setInventoryHistory] = useState<InventorySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [selectedInventory, setSelectedInventory] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    const fetchInventoryHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Check system status
        const statusResponse = await fetch('/api/proxy?endpoint=estado');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const isOnline = statusData.estado === "online" || statusData.originalResponse?.branches > 0;
          setSystemStatus(isOnline ? "online" : "offline");
        }
        
        const response = await fetch('/api/inventory-history');
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (data.success) {
          setInventoryHistory(data.history);
        } else {
          throw new Error(data.message || 'Error retrieving inventory history');
        }
      } catch (err) {
        console.error('Error fetching inventory history:', err);
        setError(err instanceof Error ? err.message : 'Error loading inventory history');
      } finally {
        setLoading(false);
      }
    };
    
    fetchInventoryHistory();
  }, []);

  // New function to view inventory details
  const viewInventoryDetails = async (collectionName: string) => {
    try {
      setSelectedInventory(collectionName);
      setLoadingItems(true);
      
      const response = await fetch(`/api/inventory-items?collection=${encodeURIComponent(collectionName)}`);
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setInventoryItems(data.items);
      } else {
        throw new Error(data.message || 'Error retrieving inventory items');
      }
    } catch (err) {
      console.error('Error fetching inventory items:', err);
      setError(err instanceof Error ? err.message : 'Error loading inventory items');
    } finally {
      setLoadingItems(false);
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
                src="/LOGO.png"
                alt="Logo"
                width={100}
                height={20}
                priority
              />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Historial de Inventario CEDIS</h1>
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
                href="/admin" 
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-2"
              >
                ← Volver al panel
              </Link>
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Inventarios Históricos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Registro de todas las cargas de inventario
            </p>
          </div>
          <Link 
            href="/admin/upload-inventario" 
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium"
          >
            Subir nuevo inventario
          </Link>
        </div>
        
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              <span className="ml-3 text-gray-700 dark:text-gray-300">Cargando historial de inventario...</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-500">
              <p>{error}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha de Inventario</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timestamp</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Archivo</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Productos</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {inventoryHistory.length > 0 ? (
                    inventoryHistory.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {item.inventoryDate}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {format(new Date(item.timestamp), "dd/MM/yyyy HH:mm:ss")}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {item.filename}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {item.recordCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          <button
                            onClick={() => viewInventoryDetails(item.collectionName)}
                            className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            Ver detalles
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                        No hay datos de inventario históricos disponibles
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Inventory Details Modal */}
        {selectedInventory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Detalle de Inventario
                </h3>
                <button
                  onClick={() => {
                    setSelectedInventory(null);
                    setInventoryItems([]);
                  }}
                  className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="overflow-auto flex-grow p-6">
                {loadingItems ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                    <span className="ml-3 text-gray-700 dark:text-gray-300">Cargando elementos...</span>
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      <div className="flex items-center">
                        <input
                          type="text"
                          placeholder="Buscar artículo..."
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm dark:bg-gray-700 dark:text-white"
                          onChange={(e) => {
                            // Local search functionality could be added here
                          }}
                        />
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Artículo</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Existencia</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {inventoryItems.length > 0 ? (
                            inventoryItems.map((item, index) => (
                              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.articulo}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.existencia}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                No hay elementos en este inventario
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedInventory(null);
                    setInventoryItems([]);
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md text-sm font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default InventarioPage;
