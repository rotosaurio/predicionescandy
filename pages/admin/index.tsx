import Image from "next/image";
import localFont from "next/font/local";
import { useState, useEffect } from "react";
import { format, parseISO, addDays } from "date-fns";
import Link from "next/link";
import axios from 'axios';

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

// API configuration
const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';
const API_ENDPOINTS = {
  PREDECIR: `${API_BASE_URL}/api/predecir`,
  SUCURSALES: `${API_BASE_URL}/api/sucursales`,
  ESTADO: `${API_BASE_URL}/api/estado`,
};

// Types
interface Prediction {
  nombre: string;
  cantidad: number;
  confianza: number;
  nivel_confianza?: string;
  articulo_id?: string;
}

interface Recommendation {
  nombre: string;
  cantidad_sugerida: number;
  confianza: number;
  tipo: string;
}

interface PredictionResult {
  fecha: string;
  sucursal: string;
  predicciones: Prediction[];
}

interface RecommendationResult {
  recomendaciones: Recommendation[];
}

interface ResultadoPrediccion {
  ARTICULO_ID: string;
  NOMBRE_ARTICULO: string;
  CANTIDAD_PREDICHA: number;
  ES_RECOMENDACION: boolean;
  CONFIANZA: number;
}

interface HistoricalPrediction {
  _id?: string;
  timestamp: string;
  branch: string;
  date: string;
  predictions: Prediction[];
  recommendations?: Recommendation[];
  sucursal?: string;
  fecha?: string;
  resultados?: ResultadoPrediccion[];
}

export default function AdminPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalPrediction[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [topN, setTopN] = useState<number>(100);
  const [isAutoUpdateEnabled, setIsAutoUpdateEnabled] = useState<boolean>(false);
  const [nextUpdateTime, setNextUpdateTime] = useState<string>("");
  const [manualTriggerLoading, setManualTriggerLoading] = useState(false);
  const [predictionStatus, setPredictionStatus] = useState<{
    success: boolean;
    results?: any[];
    errors?: any[];
    nextScheduledUpdate?: string;
  } | null>(null);

  const [orderData, setOrderData] = useState({ sucursal: '', articulo_id: '', cantidad: 0, fecha: '' });
  const [batchOrderData, setBatchOrderData] = useState([]);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [retrainParams, setRetrainParams] = useState({ epochs: 50, batch_size: 128, learning_rate: 0.001 });

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Obtener sucursales
        const response = await fetch('/api/proxy?endpoint=sucursales');
        if (!response.ok) throw new Error("Error al obtener sucursales");
        
        const data = await response.json();
        if (data && Array.isArray(data.sucursales)) {
          setBranches(data.sucursales);
          if (data.sucursales.length > 0) {
            setSelectedBranch(data.sucursales[0]);
          }
        }

        // Verificar estado del sistema
        const statusResponse = await fetch('/api/proxy?endpoint=estado');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const isOnline = statusData.estado === "online" || statusData.originalResponse?.branches > 0;
          setSystemStatus(isOnline ? "online" : "offline");
        }
        
        // Cargar historial
        loadHistoricalData();
      } catch (err) {
        setError("Error al cargar datos iniciales. Por favor, intente más tarde.");
        console.error("Error:", err);
      }
    };

    fetchInitialData();

    // Configurar la verificación de próxima actualización automática
    if (isAutoUpdateEnabled) {
      // Calcular próximo lunes a las 8AM
      const now = new Date();
      let nextMonday = new Date();
      nextMonday.setHours(8, 0, 0, 0);
      
      // Encontrar el próximo lunes
      while (nextMonday.getDay() !== 1 || nextMonday <= now) {
        nextMonday = addDays(nextMonday, 1);
      }
      
      setNextUpdateTime(format(nextMonday, "yyyy-MM-dd HH:mm:ss"));
    }
  }, [isAutoUpdateEnabled]);

  // Load historical data from MongoDB
  const loadHistoricalData = async () => {
    try {
      const response = await fetch('/api/predictions-history');
      
      if (!response.ok) {
        throw new Error(`Error al cargar datos: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.history)) {
        setHistoricalData(data.history);
      } else {
        setHistoricalData([]);
      }
    } catch (err) {
      console.error("Error al cargar el historial:", err);
      setError("Error al cargar el historial de predicciones");
    }
  };

  // Format date for API request
  const formatDateForApi = (dateStr: string): string => {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  // Request predictions from API and save to MongoDB
  const requestPredictions = async () => {
    if (!selectedBranch || !selectedDate) {
      setError("Por favor seleccione sucursal y fecha");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const requestBody = {
        fecha: formatDateForApi(selectedDate),
        sucursal: selectedBranch,
        top_n: topN,
        modo: "avanzado",
        num_muestras: 15,
        incluir_recomendaciones: true
      };
      
      const response = await fetch(API_ENDPOINTS.PREDECIR, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transformar los resultados al formato esperado
      const predicciones = data.resultados
        .filter((item: ResultadoPrediccion) => !item.ES_RECOMENDACION)
        .map((item: ResultadoPrediccion) => ({
          nombre: item.NOMBRE_ARTICULO,
          cantidad: item.CANTIDAD_PREDICHA,
          confianza: item.CONFIANZA,
          articulo_id: item.ARTICULO_ID
        }));

      const recomendaciones = data.resultados
        .filter((item: ResultadoPrediccion) => item.ES_RECOMENDACION)
        .map((item: ResultadoPrediccion) => ({
          nombre: item.NOMBRE_ARTICULO,
          cantidad_sugerida: item.CANTIDAD_PREDICHA,
          confianza: item.CONFIANZA,
          tipo: 'recomendacion'
        }));

      if (predicciones.length > 0) {
        setPredictionResult({
          fecha: selectedDate,
          sucursal: selectedBranch,
          predicciones: predicciones
        });
      }
      
      if (recomendaciones.length > 0) {
        setRecommendations({
          recomendaciones: recomendaciones
        });
      }
      
      // Guardar en MongoDB
      const storageItem: HistoricalPrediction = {
        timestamp: new Date().toISOString(),
        branch: selectedBranch,
        date: selectedDate,
        predictions: predicciones,
        recommendations: recomendaciones,
        resultados: data.resultados
      };
      
      await savePredictionToMongoDB(storageItem);
      // Actualizar el historial
      await loadHistoricalData();
      
    } catch (err) {
      console.error("Error principal:", err);
      setError(`Error al obtener predicciones: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Save prediction to MongoDB
  const savePredictionToMongoDB = async (prediction: HistoricalPrediction) => {
    const response = await fetch('/api/predictions-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        branch: prediction.branch,
        date: prediction.date,
        predictions: prediction.predictions,
        recommendations: prediction.recommendations,
        timestamp: prediction.timestamp,
        resultados: prediction.resultados
      }),
    });

    if (!response.ok) {
      throw new Error('Error al guardar en MongoDB');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Error al guardar en MongoDB');
    }
  };

  const triggerPredictions = async () => {
    try {
      setManualTriggerLoading(true);
      setError(null);
      setPredictionStatus(null);

      const response = await fetch('/api/auto-predictions', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Error al generar predicciones');
      }

      const result = await response.json();
      setPredictionStatus(result);
      
      // Refrescar los datos históricos
      await loadHistoricalData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setManualTriggerLoading(false);
    }
  };

  const handleOrderSubmit = async () => {
    try {
      const response = await axios.post('/api/registrar_pedido', orderData);
      console.log('Order submitted:', response.data);
    } catch (error) {
      console.error('Error submitting order:', error);
    }
  };

  const handleBatchOrderSubmit = async () => {
    try {
      const response = await axios.post('/api/registrar_pedidos_batch', { sucursal: orderData.sucursal, pedidos: batchOrderData });
      console.log('Batch orders submitted:', response.data);
    } catch (error) {
      console.error('Error submitting batch orders:', error);
    }
  };

  const handleDatasetUpload = async () => {
    if (!datasetFile) {
      setError("Por favor seleccione un archivo para subir");
      return;
    }
    
    const formData = new FormData();
    formData.append('file', datasetFile);
    formData.append('dataset_name', 'New Dataset');
    formData.append('start_date', '01/01/2023');
    formData.append('end_date', '31/12/2023');

    try {
      const response = await axios.post('/api/upload-dataset', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      console.log('Dataset uploaded:', response.data);
    } catch (error) {
      console.error('Error uploading dataset:', error);
    }
  };

  const handleRetrainModel = async () => {
    try {
      const response = await axios.post('/api/retrain-model', retrainParams);
      console.log('Model retraining started:', response.data);
    } catch (error) {
      console.error('Error retraining model:', error);
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel de Administración</h1>
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
                href="/" 
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-2"
              >
                ← Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Sidebar con opciones */}
          <div className="md:col-span-4 lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Generar Predicciones</h2>
                
                <button
                  onClick={triggerPredictions}
                  disabled={manualTriggerLoading || systemStatus !== "online"}
                  className={`w-full px-4 py-2 rounded-md ${
                    manualTriggerLoading || systemStatus !== "online"
                      ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {manualTriggerLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                      <span>Generando...</span>
                    </div>
                  ) : (
                    'Ejecutar Predicciones Ahora'
                  )}
                </button>
                
                <div className="mt-4">
                  <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isAutoUpdateEnabled}
                      onChange={() => setIsAutoUpdateEnabled(!isAutoUpdateEnabled)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Activar actualizaciones automáticas (lunes 8 AM)</span>
                  </label>
                </div>
                
                {nextUpdateTime && isAutoUpdateEnabled && (
                  <p className="mt-2 text-sm text-indigo-600 dark:text-indigo-400">
                    Próxima actualización: {nextUpdateTime}
                  </p>
                )}
              </div>
              
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Predicción Manual</h2>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="branch" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Sucursal
                    </label>
                    <select
                      id="branch"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      disabled={loading || branches.length === 0}
                    >
                      {branches.length === 0 && <option>Cargando sucursales...</option>}
                      {branches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="date" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Fecha
                    </label>
                    <input
                      id="date"
                      type="date"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="topn" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Productos a predecir
                    </label>
                    <input
                      id="topn"
                      type="number"
                      min="1"
                      max="500"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={topN}
                      onChange={(e) => setTopN(parseInt(e.target.value, 10))}
                      disabled={loading}
                    />
                  </div>
                  
                  <button
                    onClick={requestPredictions}
                    disabled={loading || !selectedBranch || systemStatus !== "online"}
                    className={`w-full px-4 py-2 rounded-md ${
                      loading || !selectedBranch || systemStatus !== "online"
                        ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                        <span>Procesando...</span>
                      </div>
                    ) : (
                      'Generar Predicción'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Contenido principal */}
          <div className="md:col-span-8 lg:col-span-9 space-y-6">
            {/* Mensajes de error */}
            {error && (
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
            )}
            
            {/* Resultados de predicción automática */}
            {predictionStatus && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Resultado de Predicciones Automáticas</h2>
                </div>
                <div className="p-6">
                  {predictionStatus.nextScheduledUpdate && (
                    <p className="mb-4 text-indigo-600 dark:text-indigo-400">
                      Próxima actualización programada: {format(parseISO(predictionStatus.nextScheduledUpdate), "dd/MM/yyyy HH:mm")}
                    </p>
                  )}

                  <div className="space-y-4">
                    {predictionStatus.results && predictionStatus.results.map((result, index) => (
                      <div 
                        key={index}
                        className={`p-4 rounded-lg ${
                          result.status === 'success' 
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/50' 
                            : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/50'
                        }`}
                      >
                        <div className="flex justify-between">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{result.sucursal}</h3>
                          <Link 
                            href={`/sucursal/${encodeURIComponent(result.sucursal)}`}
                            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            Ver detalle
                          </Link>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">{result.message}</p>
                        {result.lastUpdate && (
                          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                            Última actualización: {format(new Date(result.lastUpdate), "dd/MM/yyyy HH:mm")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {predictionStatus.errors && predictionStatus.errors.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold mb-2 text-red-600 dark:text-red-400">Errores</h3>
                      <div className="space-y-2">
                        {predictionStatus.errors.map((error, index) => (
                          <div key={index} className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-100 dark:border-red-900/50">
                            <p className="font-medium text-gray-900 dark:text-white">{error.sucursal}</p>
                            <p className="text-sm text-red-700 dark:text-red-400">{error.error}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Predicciones Recientes */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Predicciones Recientes</h2>
              </div>
              <div className="p-6">
                {historicalData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sucursal</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creado</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Productos</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {historicalData.slice(0, 10).map((item, index) => (
                          <tr key={`${item.branch}-${item.date}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.branch}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.date}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {format(parseISO(item.timestamp), "dd/MM/yyyy HH:mm")}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {item.predictions.length}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-indigo-600 dark:text-indigo-400">
                              <Link 
                                href={`/sucursal/${encodeURIComponent(item.branch)}`}
                                className="hover:text-indigo-900 dark:hover:text-indigo-300"
                              >
                                Ver detalle
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center py-4 text-gray-500 dark:text-gray-400">
                    No hay predicciones históricas guardadas.
                  </p>
                )}
                
                {historicalData.length > 10 && (
                  <div className="mt-4 text-center">
                    <Link 
                      href="/enrique" 
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
                    >
                      Ver todas las predicciones →
                    </Link>
                  </div>
                )}
              </div>
            </div>
            
            {/* Resultados de predicción manual */}
            {predictionResult && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Resultados de Predicción Manual para {predictionResult.sucursal}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Fecha: {predictionResult.fecha} • Productos: {predictionResult.predicciones.length}
                  </p>
                </div>
                <div className="p-6">
                  <p className="text-green-600 dark:text-green-400 mb-4">
                    Predicción generada y guardada correctamente. 
                    <Link 
                      href={`/sucursal/${encodeURIComponent(predictionResult.sucursal)}`}
                      className="ml-2 underline"
                    >
                      Ver detalle
                    </Link>
                  </p>
                </div>
              </div>
            )}

            {/* New sections for submitting orders, batch orders, re-training the model, and uploading new datasets */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-6">
              <section>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Registrar Pedido Individual</h2>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="orderSucursal" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Sucursal
                    </label>
                    <select
                      id="orderSucursal"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={orderData.sucursal}
                      onChange={(e) => setOrderData({ ...orderData, sucursal: e.target.value })}
                    >
                      <option value="">Seleccionar sucursal</option>
                      {branches.map((branch) => (
                        <option key={`order-${branch}`} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="orderArticuloId" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      ID del Artículo
                    </label>
                    <input
                      id="orderArticuloId"
                      type="text"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={orderData.articulo_id}
                      onChange={(e) => setOrderData({ ...orderData, articulo_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="orderCantidad" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Cantidad
                    </label>
                    <input
                      id="orderCantidad"
                      type="number"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={orderData.cantidad}
                      onChange={(e) => setOrderData({ ...orderData, cantidad: parseInt(e.target.value, 10) })}
                    />
                  </div>
                  <div>
                    <label htmlFor="orderFecha" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Fecha
                    </label>
                    <input
                      id="orderFecha"
                      type="date"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={orderData.fecha}
                      onChange={(e) => setOrderData({ ...orderData, fecha: e.target.value })}
                    />
                  </div>
                  <button
                    onClick={handleOrderSubmit}
                    className="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Registrar Pedido
                  </button>
                </div>
              </section>

              <section className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Registrar Pedidos en Lote</h2>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="batchOrderSucursal" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Sucursal
                    </label>
                    <select
                      id="batchOrderSucursal"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={orderData.sucursal}
                      onChange={(e) => setOrderData({ ...orderData, sucursal: e.target.value })}
                    >
                      <option value="">Seleccionar sucursal</option>
                      {branches.map((branch) => (
                        <option key={`batch-${branch}`} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="batchOrderData" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Datos de Pedidos (JSON)
                    </label>
                    <textarea
                      id="batchOrderData"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      rows={5}
                      placeholder='[{"articulo_id": "236694", "cantidad": 10}, {"articulo_id": "237389", "cantidad": 15}]'
                      onChange={(e) => {
                        try {
                          const jsonData = JSON.parse(e.target.value);
                          setBatchOrderData(jsonData);
                        } catch (error) {
                          console.error("Formato JSON inválido:", error);
                        }
                      }}
                    />
                  </div>
                  <button
                    onClick={handleBatchOrderSubmit}
                    className="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Registrar Pedidos en Lote
                  </button>
                </div>
              </section>

              <section className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Subir Dataset</h2>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="datasetFile" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Archivo de Dataset
                    </label>
                    <input
                      id="datasetFile"
                      type="file"
                      accept=".json,.csv"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          setDatasetFile(files[0]);
                        }
                      }}
                    />
                    <p className="mt-1 text-xs text-gray-500">Formatos aceptados: JSON con estructura RecordSet o CSV</p>
                  </div>
                  <button
                    onClick={handleDatasetUpload}
                    className="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Subir Dataset
                  </button>
                </div>
              </section>

              <section className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Reentrenar Modelo</h2>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="retrainEpochs" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Épocas (10-300)
                    </label>
                    <input
                      id="retrainEpochs"
                      type="number"
                      min="10"
                      max="300"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={retrainParams.epochs}
                      onChange={(e) => setRetrainParams({ ...retrainParams, epochs: parseInt(e.target.value, 10) })}
                    />
                  </div>
                  <div>
                    <label htmlFor="retrainBatchSize" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tamaño de Lote (32-512)
                    </label>
                    <input
                      id="retrainBatchSize"
                      type="number"
                      min="32"
                      max="512"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={retrainParams.batch_size}
                      onChange={(e) => setRetrainParams({ ...retrainParams, batch_size: parseInt(e.target.value, 10) })}
                    />
                  </div>
                  <div>
                    <label htmlFor="retrainLearningRate" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tasa de Aprendizaje (0.0001-0.01)
                    </label>
                    <input
                      id="retrainLearningRate"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      max="0.01"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={retrainParams.learning_rate}
                      onChange={(e) => setRetrainParams({ ...retrainParams, learning_rate: parseFloat(e.target.value) })}
                    />
                  </div>
                  <button
                    onClick={handleRetrainModel}
                    className="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Iniciar Reentrenamiento
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}