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

  const [datasets, setDatasets] = useState<Array<{ id: string, name: string }>>([]);
  const [datasetDetails, setDatasetDetails] = useState<Record<string, any>>({});
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<string | null>(null);
  const [datasetsLoading, setDatasetsLoading] = useState<boolean>(false);

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
          // Check if modelo_cargado is true or if any memory stats are available
          const isOnline = statusData.modelo_cargado === true || 
                          statusData.memoria_total !== undefined ||
                          (statusData.originalResponse && statusData.originalResponse.modelo_cargado === true);
          
          console.log("API Status response:", statusData);
          setSystemStatus(isOnline ? "online" : "offline");
        } else {
          console.error("Error en la respuesta del estado:", statusResponse.status);
          setSystemStatus("offline");
        }
        
        // Cargar historial
        loadHistoricalData();

        // Also fetch datasets when component mounts
        fetchDatasets();
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
      
      const response = await fetch('/api/proxy?endpoint=predecir', {
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

      // Modified to add useLatestInventory parameter
      const response = await fetch('/api/auto-predictions?useLatestInventory=true', {
        method: 'POST'
      });

      const result = await response.json();
      
      if (!response.ok) {
        // Display inventory information if available
        if (result.inventoryStatus && result.inventoryStatus.availableInventories) {
          const availableDates = result.inventoryStatus.availableInventories.join(', ');
          setError(`${result.message} Inventarios disponibles: ${availableDates}`);
        } else {
          setError(result.message || 'Error al generar predicciones');
        }
      } else {
        setPredictionStatus(result);
        // Refrescar los datos históricos
        await loadHistoricalData();
      }
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
    
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', datasetFile);
      
      // Add required metadata fields
      const datasetName = `dataset_${new Date().getTime()}`;
      formData.append('dataset_name', datasetName);
      formData.append('start_date', '01/01/2023');
      formData.append('end_date', '31/12/2023');

      console.log("Subiendo dataset:", datasetFile.name);

      // Use our dedicated API route for file uploads instead of the proxy
      const response = await fetch('/api/upload-dataset', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header, browser will set it with correct boundary
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Dataset uploaded:', result);
      
      // Add success message to UI
      alert(`Dataset "${datasetName}" subido correctamente.`);
      
      // Clear file input
      setDatasetFile(null);
      
      // Refresh the datasets list
      fetchDatasets();
    } catch (error) {
      console.error('Error uploading dataset:', error);
      setError(`Error al subir el dataset: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setLoading(false);
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

  // Fetch datasets
  const fetchDatasets = async () => {
    try {
      setDatasetsLoading(true);
      // Use the proxy API instead of direct access
      const response = await fetch('/api/proxy?endpoint=datasets');
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      
      // Process dataset list - ensuring we correctly extract IDs and names
      const rawDatasetList = data.datasets || [];
      const processedDatasets: Array<{ id: string, name: string }> = [];
      const detailsMap: Record<string, any> = {};
      
      // Handle both array of strings and array of objects
      for (const item of rawDatasetList) {
        let dataset: { id: string, name: string };
        
        if (typeof item === 'string') {
          // If it's a simple string, use it as both id and name
          dataset = { id: item, name: item };
        } else if (typeof item === 'object' && item !== null) {
          // If it's an object, extract both id and name
          const id = item.id || item.name || String(item);
          const name = item.name || item.id || String(item);
          dataset = { id, name };
          detailsMap[id] = item;
        } else {
          continue; // Skip invalid items
        }
        
        processedDatasets.push(dataset);
      }
      
      setDatasets(processedDatasets);
      setDatasetDetails(detailsMap);
      
      // Fetch additional details if needed
      for (const dataset of processedDatasets) {
        if (!detailsMap[dataset.id]) {
          try {
            const detailsResponse = await fetch(`/api/proxy?endpoint=dataset_details&dataset_name=${encodeURIComponent(dataset.id)}`);
            if (detailsResponse.ok) {
              const detailsData = await detailsResponse.json();
              detailsMap[dataset.id] = detailsData;
            }
          } catch (e) {
            console.warn(`Could not fetch details for dataset ${dataset.name}`, e);
          }
        }
      }
      
      setDatasetDetails(detailsMap);
    } catch (error) {
      console.error('Error fetching datasets:', error);
    } finally {
      setDatasetsLoading(false);
    }
  };

  // Delete a dataset - updated to work with our new dataset structure
  const deleteDataset = async (datasetId: string) => {
    const datasetToDelete = datasets.find(d => d.id === datasetId);
    const displayName = datasetToDelete?.name || datasetId;
    
    if (!confirm(`¿Está seguro que desea eliminar el dataset "${displayName}"?`)) {
      return;
    }
    
    try {
      // Use proxy API for dataset deletion
      const response = await fetch(`/api/proxy?endpoint=delete_dataset&dataset_name=${encodeURIComponent(datasetId)}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      // Remove from the local state
      setDatasets(datasets.filter(dataset => dataset.id !== datasetId));
      setSuccess(`Dataset "${displayName}" eliminado correctamente.`);
    } catch (error) {
      console.error('Error deleting dataset:', error);
      setError(`Error al eliminar dataset: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  // Check training status
  const fetchTrainingStatus = async () => {
    try {
      const response = await axios.get('/api/proxy?endpoint=training-status');
      setTrainingStatus(response.data.status || 'Desconocido');
    } catch (error) {
      console.error('Error fetching training status:', error);
    }
  };

  // Retrain model - updated to pass the correct dataset IDs
  const retrainModel = async () => {
    try {
      // Log what we're sending to help debug the issue
      const requestParams = {
        epochs: retrainParams.epochs,
        batch_size: retrainParams.batch_size,
        learning_rate: retrainParams.learning_rate,
        use_all_datasets: selectedDatasets.length === 0,
        dataset_ids: selectedDatasets, // Now contains actual dataset IDs
      };
      
      console.log('Attempting to retrain model with parameters:', requestParams);
      
      // Ensure values are within acceptable ranges
      const validatedParams = {
        epochs: Math.max(10, Math.min(300, retrainParams.epochs)),
        batch_size: Math.max(32, Math.min(512, retrainParams.batch_size)),
        learning_rate: Math.max(0.0001, Math.min(0.01, retrainParams.learning_rate)),
        use_all_datasets: selectedDatasets.length === 0,
        dataset_ids: selectedDatasets, // Now contains actual dataset IDs
      };

      // Use fetch instead of axios for more control over the request
      const response = await fetch('/api/proxy?endpoint=retrain-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validatedParams),
      });
      
      // More detailed error handling
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `Error ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('Model retraining started successfully:', data);
      
      // Show success message
      setSuccess('El reentrenamiento del modelo ha comenzado correctamente');
    } catch (error) {
      console.error('Error retraining model:', error);
      setError(`Error al iniciar reentrenamiento: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  // Add new function for automatic retraining
  const retrainModelAutomatic = async () => {
    try {
      // Log what we're sending
      const requestParams = {
        epochs: retrainParams.epochs,
        batch_size: retrainParams.batch_size,
        learning_rate: retrainParams.learning_rate,
        preserve_original_model: true
      };
      
      console.log('Starting automatic retraining with parameters:', requestParams);
      
      // Use fetch for the request
      const response = await fetch('/api/proxy?endpoint=retrain-automatic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
      });
      
      // Error handling
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `Error ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('Automatic retraining started successfully:', data);
      
      // Show success message
      setSuccess('El reentrenamiento automático ha comenzado correctamente');
    } catch (error) {
      console.error('Error starting automatic retraining:', error);
      setError(`Error al iniciar reentrenamiento automático: ${error instanceof Error ? error.message : 'Error desconocido'}`);
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
              <Link 
                href="/admin/inventario" 
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Carga de Inventario CEDIS
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
                            : result.status === 'skipped'
                              ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/50'
                              : 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50'
                        }`}
                      >
                        <div className="flex justify-between">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{result.sucursal}</h3>
                          {result.status === 'success' && (
                            <Link 
                              href={`/sucursal/${encodeURIComponent(result.sucursal)}`}
                              className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              Ver detalle
                            </Link>
                          )}
                        </div>
                        <p className={`text-sm ${
                          result.status === 'success' 
                            ? 'text-green-600 dark:text-green-400' 
                            : result.status === 'skipped'
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-red-600 dark:text-red-400'
                        }`}>
                          {result.status === 'success' && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {result.status === 'skipped' && (
                            <span title="Esta sucursal solo puede generar predicciones en días específicos">
                              <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </span>
                          )}
                          {result.status !== 'success' && result.status !== 'skipped' && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          )}
                          {result.message}
                        </p>
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

            {/* Enhanced dataset management and other admin sections */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Gestión de Datasets</h2>
              </div>
              <div className="p-6">
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-md font-semibold">Datasets Disponibles</h3>
                    <button
                      onClick={fetchDatasets}
                      className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
                      disabled={datasetsLoading}
                    >
                      {datasetsLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Cargando...</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Actualizar</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  {datasets.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Registros</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Periodo</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {datasets.map((dataset) => {
                            const details = datasetDetails[dataset.id] || {};
                            // Convert potentially complex values to strings to avoid rendering objects directly
                            const recordCount = typeof details.record_count === 'object' ? JSON.stringify(details.record_count) : details.record_count;
                            const rows = typeof details.rows === 'object' ? JSON.stringify(details.rows) : details.rows;
                            const count = typeof details.count === 'object' ? JSON.stringify(details.count) : details.count;
                            
                            return (
                              <tr key={dataset.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{dataset.name}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                  {recordCount || rows || count || "N/A"}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                  {typeof details.period === 'object' ? JSON.stringify(details.period) : 
                                    details.period || (
                                      details.start_date && details.end_date ? 
                                      `${details.start_date} - ${details.end_date}` : "N/A"
                                    )
                                  }
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm">
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => deleteDataset(dataset.id)}
                                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                      title="Eliminar dataset"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                      {datasetsLoading ? 'Cargando datasets...' : 'No hay datasets disponibles.'}
                    </div>
                  )}
                </div>
                
                {/* Dataset Upload Section */}
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-md font-semibold mb-4">Subir Nuevo Dataset</h3>
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
                      className="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex justify-center items-center"
                      disabled={loading || !datasetFile}
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Subiendo...
                        </>
                      ) : (
                        'Subir Dataset'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Training Section - Improved UI */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Entrenamiento del Modelo</h2>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-md font-semibold">Estado Actual</h3>
                    <button
                      onClick={fetchTrainingStatus}
                      className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
                    >
                      Verificar Estado
                    </button>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                    <p className="text-gray-700 dark:text-gray-300">
                      {trainingStatus || "No se ha consultado el estado del entrenamiento"}
                    </p>
                  </div>
                </div>
                
                <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-md font-semibold mb-4">Parámetros de Entrenamiento</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                        Tasa de Aprendizaje
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
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="selectDatasets" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Datasets a utilizar (Seleccione múltiples o deje vacío para usar todos)
                    </label>
                    <select
                      id="selectDatasets"
                      multiple
                      className="w-full h-32 rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={selectedDatasets}
                      onChange={(e) =>
                        setSelectedDatasets(Array.from(e.target.selectedOptions, (option) => option.value))
                      }
                    >
                      {datasets.map((dataset) => (
                        <option key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {selectedDatasets.length === 0 
                        ? 'Se usarán todos los datasets disponibles' 
                        : `Seleccionados: ${selectedDatasets.length} datasets`}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <button
                      onClick={retrainModel}
                      className="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Iniciar Reentrenamiento
                    </button>
                    
                    <button
                      onClick={retrainModelAutomatic}
                      className="w-full px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white"
                    >
                      Reentrenamiento Automático
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Other sections (orders, etc.) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Gestión de Pedidos</h2>
              </div>
              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section>
                  <h3 className="text-md font-semibold mb-4">Registrar Pedido Individual</h3>
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
                    <div className="grid grid-cols-2 gap-4">
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
                    </div>
                    <button
                      onClick={handleOrderSubmit}
                      className="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Registrar Pedido
                    </button>
                  </div>
                </section>

                <section>
                  <h3 className="text-md font-semibold mb-4">Registrar Pedidos en Lote</h3>
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
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Implement the success message state and handler
function setSuccess(message: string) {
  // In a real implementation, this would update a state variable
  alert(message);
}
