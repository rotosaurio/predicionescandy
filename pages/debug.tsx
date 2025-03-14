import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import type { IconType } from 'react-icons';

// Intentar importar los iconos con un fallback
let FiRefreshCw: IconType;
let FiHome: IconType;
let FiCheck: IconType;
let FiX: IconType;

try {
  const icons = require('react-icons/fi');
  FiRefreshCw = icons.FiRefreshCw;
  FiHome = icons.FiHome;
  FiCheck = icons.FiCheck;
  FiX = icons.FiX;
} catch (e) {
  // Simple fallback component if react-icons is not available
  const IconFallback: IconType = ({ children }: { children?: React.ReactNode }) => 
    <span className="inline-block w-5 h-5 bg-gray-300 rounded-sm mr-1">{children}</span>;
  
  FiRefreshCw = IconFallback;
  FiHome = IconFallback;
  FiCheck = IconFallback;
  FiX = IconFallback;
  
  console.warn('react-icons package is not installed. Using fallback icons.');
}

// Placeholder para usePredictionApi hasta que implementemos el hook
const usePredictionApi = () => {
  return {
    checkSystemStatus: async () => false,
    fetchBranches: async () => [],
    loading: false,
  };
};

// Placeholder para useAppStore hasta que implementemos Zustand
const useAppStore = () => {
  return {
    systemStatus: 'unknown',
    branches: [],
  };
};

// Formato simple de fecha para la API
const formatDateForAPI = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

export default function DebugPage() {
  const router = useRouter();
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [testParams, setTestParams] = useState({
    fecha: new Date().toISOString().split('T')[0],
    sucursal: '',
    top_n: 10
  });
  const [loading, setLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState('unknown');
  const [branches, setBranches] = useState<string[]>([]);
  const [apiDetails, setApiDetails] = useState<any>(null);
  
  // Initialize
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      
      try {
        // Try to fetch branches from the API
        const response = await fetch('/api/proxy?endpoint=sucursales');
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.sucursales)) {
            setBranches(data.sucursales);
            if (data.sucursales.length > 0) {
              setTestParams(prev => ({ ...prev, sucursal: data.sucursales[0] }));
            }
          }
        }
        
        // Check system status
        const statusResponse = await fetch('/api/proxy?endpoint=estado');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log("Status API response:", statusData);
          
          // Consideramos el sistema online si la respuesta tiene estado "online"
          // o si hay información que indique que el sistema está funcionando
          const isOnline = 
            statusData.estado === "online" || 
            statusData.originalResponse?.branches > 0 ||
            statusData.originalResponse?.model_loaded === "Yes";
            
          setSystemStatus(isOnline ? "online" : "offline");
          
          // También guardamos detalles adicionales para mostrarlos en la interfaz
          if (statusData.originalResponse) {
            setApiDetails(statusData.originalResponse);
          }
        } else {
          setSystemStatus("offline");
        }
        
      } catch (err) {
        console.error("Error initializing debug page:", err);
        setSystemStatus("offline");
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, []);
  
  // Check the system status
  const checkSystemStatus = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/proxy?endpoint=estado');
      if (response.ok) {
        const data = await response.json();
        setSystemStatus(data.estado === 'online' ? 'online' : 'offline');
      } else {
        setSystemStatus('offline');
      }
    } catch (err) {
      console.error("Error checking status:", err);
      setSystemStatus('offline');
    } finally {
      setLoading(false);
    }
  };
  
  // Test the prediction API directly
  const testPredictionApi = async () => {
    try {
      setLoading(true);
      setApiResponse(null);
      
      const response = await fetch('/api/proxy?endpoint=predecir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fecha: formatDateForAPI(testParams.fecha),
          sucursal: testParams.sucursal,
          top_n: testParams.top_n,
          modo: "avanzado",
          num_muestras: 15,
          incluir_recomendaciones: true
        }),
        });
        
        const data = await response.json();
        interface ApiResponse {
          predicciones?: Array<{
            producto: string;
            probabilidad: number;
          }>;
          recomendaciones?: Array<{
            producto: string;
            razon: string;
          }>;
          error?: string;
        }
  
        interface ApiStatusDetails {
          gpu?: string;
          model_loaded?: string;
          branches?: number;
          products?: number;
        }
        setApiResponse(data);
      } catch (err) {
        setApiResponse({
          error: err instanceof Error ? err.message : String(err)
        });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">API Debug Console</h1>
        <Link href="/" className="btn btn-primary">
          {FiHome && <FiHome />}
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="card mb-6">
            <h2 className="text-xl font-bold mb-4">System Status</h2>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-4 h-4 rounded-full ${
                systemStatus === 'online' ? 'bg-green-500' :
                systemStatus === 'offline' ? 'bg-red-500' :
                'bg-yellow-500'
              }`}></div>
              <span className="font-medium">{systemStatus.toUpperCase()}</span>
              <button 
                onClick={checkSystemStatus}
                className="btn btn-sm btn-secondary ml-auto"
                disabled={loading}
              >
                {FiRefreshCw && <FiRefreshCw className={loading ? 'animate-spin' : ''} />}
                <span>Refresh</span>
              </button>
            </div>
            
            {/* Mostrar detalles adicionales del estado del sistema */}
            {apiDetails && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm">
                <h3 className="font-medium mb-2">API Details:</h3>
                <ul className="space-y-1">
                  <li><strong>GPU:</strong> {apiDetails.gpu || 'N/A'}</li>
                  <li><strong>Model Loaded:</strong> {apiDetails.model_loaded || 'N/A'}</li>
                  <li><strong>Branches:</strong> {apiDetails.branches || 'N/A'}</li>
                  <li><strong>Products:</strong> {apiDetails.products || 'N/A'}</li>
                </ul>
              </div>
            )}
            
            <div className="note note-info mt-4">
              <p>API Base URL: {process.env.NEXT_PUBLIC_API_BASE_URL || 'https://rotosaurio-candymodel.hf.space'}</p>
              <p className="mt-1 text-xs">El sistema se considera online si el modelo está cargado, aunque no haya GPU disponible.</p>
            </div>
          </div>
          
          <div className="card">
            <h2 className="text-xl font-bold mb-4">Test Prediction API</h2>
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="block mb-1 text-sm font-medium">Branch</label>
                <select
                  className="select"
                  value={testParams.sucursal}
                  onChange={(e) => setTestParams({...testParams, sucursal: e.target.value})}
                >
                  {branches.length === 0 && <option>Loading branches...</option>}
                  {branches.map(branch => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block mb-1 text-sm font-medium">Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  className="input"
                  value={testParams.fecha}
                  onChange={(e) => setTestParams({...testParams, fecha: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block mb-1 text-sm font-medium">Top N</label>
                <input
                  type="number"
                  className="input"
                  value={testParams.top_n}
                  onChange={(e) => setTestParams({...testParams, top_n: parseInt(e.target.value) || 10})}
                />
              </div>
            </div>
            
            <button 
              onClick={testPredictionApi}
              className="btn btn-primary"
              disabled={loading || systemStatus !== 'online'}
            >
              Test API
            </button>
          </div>
        </div>
        
        <div className="card">
          <h2 className="text-xl font-bold mb-4">API Response</h2>
          
          {!apiResponse && (
            <div className="text-center p-8 text-gray-500">
              <p>No data yet. Run a test to see results here.</p>
            </div>
          )}
          
          {apiResponse && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-4 h-4 rounded-full ${apiResponse.error ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <span className="font-medium">
                  {apiResponse.error ? 'ERROR' : 'SUCCESS'}
                </span>
              </div>
              
              {apiResponse.predicciones && (
                <div className="note note-success mb-4">
                  <p>Received {apiResponse.predicciones.length} predictions</p>
                </div>
              )}
              
              {apiResponse.recomendaciones && (
                <div className="note note-info mb-4">
                  <p>Received {apiResponse.recomendaciones.length} recommendations</p>
                </div>
              )}
              
              {apiResponse.error && (
                <div className="note note-error mb-4">
                  <p>{apiResponse.error}</p>
                </div>
              )}
              
              <div className="border border-gray-200 rounded-md p-4 mt-4 bg-gray-50 dark:bg-gray-900 overflow-auto max-h-96">
                <pre className="text-xs">{JSON.stringify(apiResponse, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
