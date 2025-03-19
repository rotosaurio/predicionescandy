import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { Prediction, NoOrdenadoRazon, FeedbackProduct } from '../../types/models';
import { isUserLoggedIn, getCurrentUser } from '../../utils/auth';
import OrderFeedbackModal from '../../components/OrderFeedbackModal';
import { FiInfo, FiCheck, FiX } from 'react-icons/fi';
import { getDisplayBranchName } from '../../utils/branchMapping';
import { useAppStore } from '../../utils/store';
import StatusIndicator from '../../components/StatusIndicator';
import { getCommonProducts } from '../../utils/helpers'; // Import from helpers

// Interface for inventory data
interface InventoryData {
  articulo: string;
  existencia: number;
  disponible: boolean;
}

interface CommonProduct {
  producto: string;
  nombre: string;
  cantidadPredicha: number;
  cantidadSugerida: number;
  cantidadPromedio?: number;
  confianzaPrediccion: number;
  confianzaRecomendacion: number;
  diferenciaCantidad?: number;
  porcentajeDiferencia?: number;
  tipo?: string;
  motivo?: string;
  articulo_id?: string;
  min_cantidad?: number;
  max_cantidad?: number;
  tipo_recomendacion?: string;
  frecuencia_otras?: number;
  num_sucursales?: number;
  nivel_recomendacion?: number;
  pedidos_recientes_otras?: Array<{
    sucursal: string;
    dias_desde_pedido: number;
    cantidad: number;
  }>;
  ultima_fecha_pedido?: string;
  dias_desde_ultimo_pedido?: number;
  cantidad_ultimo_pedido?: number;
  ordenado?: boolean;
  razon_no_ordenado?: NoOrdenadoRazon;
  comentario_no_ordenado?: string;
}

interface PredictionData {
  timestamp: string;
  branch: string;
  date: string;
  predictions: Prediction[];
  recommendations: any[];
  commonProducts: CommonProduct[];
}

interface HistoricalPrediction {
  _id: string;
  timestamp: string;
  branch: string;
  date: string;
  predictions: Prediction[];
  recommendations: any[];
}

const HistoricalPredictionPage: React.FC = () => {
  const router = useRouter();
  const { id, timestamp } = router.query;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('');
  const [systemStatus, setSystemStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [predictionData, setPredictionData] = useState<PredictionData | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CommonProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState<{[key: string]: boolean}>({});
  const [inventory, setInventory] = useState<Record<string, InventoryData>>({});
  
  // Function to toggle product expansion
  const toggleProductExpansion = (productName: string) => {
    if (expandedProduct === productName) {
      setExpandedProduct(null);
    } else {
      setExpandedProduct(productName);
    }
  };

  // Helper functions for styling
  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 dark:text-green-400';
    if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };
  
  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 90) return 'Muy Alta';
    if (confidence >= 80) return 'Alta';
    if (confidence >= 70) return 'Media';
    if (confidence >= 60) return 'Baja';
    return 'Muy Baja';
  };
  
  const getLevelBadgeClass = (confidence: number) => {
    if (confidence >= 90) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200';
    if (confidence >= 80) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200';
    if (confidence >= 70) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
    if (confidence >= 60) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200';
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
  };
  
  const getDifferenceClass = (difference: number) => {
    if (Math.abs(difference) < 2) return 'text-gray-600 dark:text-gray-400';
    if (difference > 0) return 'text-green-600 dark:text-green-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Open modal for feedback
  const handleOpenFeedbackModal = (product: CommonProduct) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };
  
  // Helper function to render order status
  const renderOrderStatus = (product: CommonProduct) => {
    if (product.ordenado === true) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <FiCheck className="mr-1" /> Ordenado
        </span>
      );
    } else if (product.ordenado === false) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <FiX className="mr-1" /> No ordenado
          {product.razon_no_ordenado && (
            <span className="ml-1">
              ({product.razon_no_ordenado === 'hay_en_tienda' 
                ? 'Hay producto en tienda' 
                : product.razon_no_ordenado === 'no_hay_en_cedis' 
                  ? 'No hay producto en CEDIS' 
                  : product.comentario_no_ordenado || product.razon_no_ordenado})
            </span>
          )}
        </span>
      );
    }
    return null;
  };

  const fetchFeedbackData = async () => {
    try {
      // Include predictionId in the query params if available
      const predictionIdParam = predictionData?.timestamp ? 
        `&predictionId=${encodeURIComponent(predictionData.timestamp)}` : '';
      
      const response = await fetch(`/api/feedback?sucursal=${encodeURIComponent(id as string)}${predictionIdParam}`);
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();

      // No need to filter by date here as we're already filtering by predictionId
      return data.feedback;
    } catch (error) {
      console.error('Error fetching feedback data:', error);
      return [];
    }
  };

  useEffect(() => {
    if (!id || !router.isReady) return;

    const fetchHistoricalData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Set branch name initially from URL parameter
        const decodedId = typeof id === 'string' ? decodeURIComponent(id) : '';
        setBranchName(getDisplayBranchName(decodedId));

        const statusResponse = await fetch('/api/proxy?endpoint=estado');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const isOnline = statusData.estado === "online" || statusData.originalResponse?.branches > 0;
          setSystemStatus(isOnline ? "online" : "offline");
        }
        
        // Construct query parameters for API request
        const timestampParam = timestamp ? `?timestamp=${encodeURIComponent(timestamp as string)}` : '';
        
        // Fetch historical prediction data
        console.log(`Fetching historical data for branch: ${decodedId}, timestamp: ${timestamp || 'latest'}`);
        const apiUrl = `/api/historical-predictions/${encodeURIComponent(decodedId)}${timestampParam}`;
        console.log("API URL:", apiUrl);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `Error ${response.status}: ${response.statusText}` + 
            (errorData?.error ? `\n${errorData.error}` : '')
          );
        }
        
        const data = await response.json();
        
        if (!data.historicalPredictions || data.historicalPredictions.length === 0) {
          throw new Error('No hay predicciones históricas para esta sucursal y fecha');
        }
        
        const historicalPrediction = data.historicalPredictions[0];
        console.log("Loaded historical prediction ID:", historicalPrediction._id);

        // Update branch name with the real name returned by API
        setBranchName(getDisplayBranchName(historicalPrediction.branch));
        
        // Handle both weekly predictions (with dailyPredictions) and regular predictions
        let predictions, recommendations;
        
        if (historicalPrediction.dailyPredictions) {
          // This is a weekly prediction - find the first day that has data
          const firstDate = Object.keys(historicalPrediction.dailyPredictions)[0];
          predictions = historicalPrediction.dailyPredictions[firstDate]?.predicciones || historicalPrediction.predictions || [];
          recommendations = historicalPrediction.dailyPredictions[firstDate]?.recomendaciones || historicalPrediction.recommendations || [];
          console.log(`Using daily prediction data from ${firstDate}`);
        } else {
          // Regular prediction
          predictions = historicalPrediction.predictions || [];
          recommendations = historicalPrediction.recommendations || [];
        }
        
        // Get common products with comparative analysis - using imported function
        const commonProducts = getCommonProducts(predictions, recommendations);
        
        // Fetch feedback data
        const feedbackData = await fetchFeedbackData();

        // Merge feedback data with common products
        const mergedProducts = commonProducts.map(product => {
            const feedback = feedbackData.find((fb: { producto: string }) => fb.producto === product.nombre);
          return feedback ? { ...product, ...feedback } : product;
        });

        // Make sure cantidadPromedio is defined for all products
        mergedProducts.forEach(product => {
          if (product.cantidadPromedio === undefined) {
            product.cantidadPromedio = Math.round((product.cantidadPredicha + product.cantidadSugerida) / 2);
          }
        });
        
        setPredictionData({
          timestamp: historicalPrediction.timestamp,
          branch: historicalPrediction.branch,
          date: historicalPrediction.date,
          predictions: predictions,
          recommendations: recommendations,
          commonProducts: mergedProducts
        });
        
        console.log(`Found ${mergedProducts.length} common products`);
        
        // Set loading to false before inventory data fetching
        setLoading(false);
        
        // Fetch inventory data in the background
        fetchInventoryData(mergedProducts).catch((err) => {
          console.error("Error fetching inventory data:", err);
        });
        
      } catch (err) {
        console.error('Error loading historical data:', err);
        setError(err instanceof Error ? err.message : 'Error loading historical data');
        setLoading(false);
      }
    };

    fetchHistoricalData();
  }, [id, timestamp, router.isReady]);

  // Fetch inventory data only for common products
  const fetchInventoryData = async (commonProducts: CommonProduct[]) => {
    try {
      const inventoryData: Record<string, InventoryData> = {};
      console.log(`Starting inventory fetch for ${commonProducts.length} common products with historical date: ${predictionData?.date || 'unknown'}`);
      
      // Process products one by one to avoid overwhelming the server
      for (let i = 0; i < commonProducts.length; i++) {
        const product = commonProducts[i];
        try {
          // Gather all possible identifiers for this product
          const searchOptions = [
            product.nombre,             // Main product name
            product.articulo_id,        // Article ID if available
            product.nombre?.trim()      // Trimmed name (removes whitespace)
          ].filter(Boolean); // Remove any undefined or empty values
          
          let found = false;
          
          for (const searchTerm of searchOptions) {
            if (found) break;
            if (!searchTerm || searchTerm.length < 3) continue;
            
            console.log(`[${i+1}/${commonProducts.length}] Checking historical inventory for: "${searchTerm}"`);
            
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
              // Add predictionDate parameter to get the closest historical inventory
              const predictionDateParam = predictionData?.date ? 
                `&predictionDate=${encodeURIComponent(predictionData.date)}` : 
                predictionData?.timestamp ? 
                `&predictionDate=${encodeURIComponent(predictionData.timestamp)}` : '';
              
              const response = await fetch(
                `/api/check-inventory?productName=${encodeURIComponent(searchTerm)}${predictionDateParam}`,
                { signal: controller.signal }
              );
              
              clearTimeout(timeoutId);
              
              if (response.ok) {
                const data = await response.json();
                if (data.success && data.found) {
                  // Store the inventory data keyed by the main product name
                  inventoryData[product.nombre] = data.data;
                  console.log(`✅ Found historical inventory for "${product.nombre}": ${data.data.existencia} units using collection: ${data.collection}`);
                  found = true;
                  break;
                }
              }
            } catch (error) {
              const fetchError = error as Error;
              if (fetchError.name === 'AbortError') {
                console.warn(`Inventory request for "${searchTerm}" timed out`);
              } else {
                console.error(`Error fetching inventory for "${searchTerm}":`, fetchError);
              }
            }
          }
          
          if (!found) {
            console.log(`❌ No inventory found for "${product.nombre}"`);
          }
          
          // Add a small delay between requests
          if (commonProducts.length > 10 && i % 5 === 4) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
        } catch (itemError) {
          console.error(`Error processing inventory for "${product.nombre}":`, itemError);
        }
      }
      
      console.log(`✓ Completed inventory lookup: found data for ${Object.keys(inventoryData).length}/${commonProducts.length} products`);
      setInventory(inventoryData);
      
    } catch (error) {
      console.error('Error in inventory data processing:', error);
      setInventory({});
    }
  };

  // Handle feedback submission for common products
  const handleSaveFeedback = async (
    product: FeedbackProduct,
    ordered: boolean,
    reason?: NoOrdenadoRazon,
    comment?: string
  ): Promise<void> => {
    try {
      setLoadingFeedback(prev => ({ ...prev, [product.producto]: true }));
      
      const response = await fetch('/api/order-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          producto: product.producto,
          cantidad: product.cantidadPredicha ?? product.cantidad ?? 0,
          sucursal: id,
          fecha: predictionData?.date || new Date().toISOString().split('T')[0],
          ordenado: ordered,
          razon_no_ordenado: reason,
          comentario: comment,
          predictionId: predictionData?.timestamp || null // Add the prediction timestamp as ID
        }),
      });
      
      if (!response.ok) {
        throw new Error('Error saving feedback');
      }

      // Update the product in the commonProducts array
      if (predictionData) {
        const updatedProducts = predictionData.commonProducts.map(p => {
          if (p.nombre === product.producto) {
            return {
              ...p,
              ordenado: ordered,
              razon_no_ordenado: reason,
              comentario_no_ordenado: comment
            };
          }
          return p;
        });
        
        setPredictionData({
          ...predictionData,
          commonProducts: updatedProducts
        });
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error saving feedback:', error);
      throw error;
    } finally {
      setLoadingFeedback(prev => ({ ...prev, [product.producto]: false }));
      setIsModalOpen(false);
    }
  };

  return (
    <div>
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
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {branchName} (Histórico)
                </h1>
                {predictionData && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Fecha: {predictionData.date} • Actualizado: {format(new Date(predictionData.timestamp), 'dd/MM/yyyy HH:mm')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200`}>
                Datos Históricos
              </div>
              <Link 
                href="/enrique" 
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-2"
              >
                ← Volver al panel
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            <span className="ml-3 text-gray-700 dark:text-gray-300">Cargando datos históricos...</span>
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
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>{error}</p>
                  <p className="mt-2">
                    No se pudieron cargar las predicciones históricas para esta sucursal y fecha.
                    <button 
                      className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      onClick={() => window.location.href = '/enrique'}
                    >
                      Volver al panel
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {predictionData && (
              <>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      Análisis de Productos (Datos Históricos)
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {predictionData.commonProducts?.length || 0} productos analizados para esta sucursal • Fecha: {predictionData.date}
                    </p>
                  </div>
                  
                  {/* Lista de productos con detalles completos */}
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {predictionData.commonProducts?.map((product, index) => {
                      const isExpanded = expandedProduct  === product.nombre;
                      const differenceClass = getDifferenceClass(product.porcentajeDiferencia || 0);
                      // Get inventory data for this product
                      const inventoryItem = inventory[product.nombre];
                      
                      return (
                        <div key={index} className="bg-white dark:bg-gray-800">
                          {/* Cabecera del producto (siempre visible) */}
                          <div 
                            className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            onClick={() => toggleProductExpansion(product.nombre)}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30">
                                <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                                  {index + 1}
                                </span>
                              </div>
                              <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate max-w-xs md:max-w-md">
                                  {product.nombre}
                                </h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex items-center">
                                  <span>
                                    Pred: {product.cantidadPredicha?.toLocaleString() || 0} | Rec: {product.cantidadSugerida?.toLocaleString() || 0} | Prom: {product.cantidadPromedio?.toLocaleString() || 0}
                                  </span>
                                </p>
                              </div>
                              {/* Only show the button if feedback doesn't exist (ordenado is undefined) */}
                              {product.ordenado === undefined && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent row expansion when clicking button
                                    handleOpenFeedbackModal(product);
                                  }}
                                  className="px-2 py-1 text-xs font-medium text-white bg-[#0B9ED9] rounded hover:bg-[#0989c0] flex items-center"
                                >
                                  <FiInfo className="mr-2" />
                                  Motivo de omisión
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Add inventory status before confidence level */}
                              {inventoryItem ? (
                                <div className="flex items-center bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1">
                                  <div className={`w-2 h-2 rounded-full ${
                                    inventoryItem.disponible ? 'bg-green-500' : 'bg-red-500'
                                  }`}></div>
                                  <span className="ml-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {inventoryItem.existencia > 0 ? `${inventoryItem.existencia} pz en CEDIS` : 'No disponible en CEDIS'}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1">
                                  Sin datos CEDIS
                                </div>
                              )}
                              
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLevelBadgeClass(product.confianzaPrediccion)}`}>
                                {getConfidenceLevel(product.confianzaPrediccion)}
                              </span>
                              {renderOrderStatus(product)}
                              <svg 
                                className={`h-5 w-5 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                                xmlns="http://www.w3.org/2000/svg" 
                                viewBox="0 0 20 20" 
                                fill="currentColor"
                              >
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                          
                          {/* Product detail sections - only shown when expanded */}
                          {isExpanded && (
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                              {/* Add Inventory CEDIS section */}
                              <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                                  Inventario CEDIS
                                </h4>
                                
                                {inventoryItem ? (
                                  <div className="flex items-center">
                                    <div className={`w-3 h-3 rounded-full mr-3 ${
                                      inventoryItem.disponible ? 'bg-green-500' : 'bg-red-500'
                                    }`}></div>
                                    <div>
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {inventoryItem.disponible 
                                          ? `Disponible (${inventoryItem.existencia} piezas en CEDIS)` 
                                          : 'No disponible en CEDIS'}
                                      </span>
                                      {inventoryItem.disponible && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          {inventoryItem.existencia >= (product.cantidadPromedio || 0)
                                            ? 'Hay suficiente inventario para este pedido'
                                            : 'Inventario insuficiente para la cantidad recomendada'}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    No se encontró información de inventario para este producto en CEDIS
                                  </div>
                                )}
                              </div>
                              
                              {/* Prediction and Recommendation sections */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Columna de predicción */}
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                  <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                                    Predicción
                                  </h4>
                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-500 dark:text-gray-400">Cantidad predicha:</span>
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">{product.cantidadPredicha?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-500 dark:text-gray-400">Confianza:</span>
                                      <span className={`text-sm font-medium ${getConfidenceClass(product.confianzaPrediccion)}`}>
                                        {product.confianzaPrediccion.toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-500 dark:text-gray-400">Nivel de confianza:</span>
                                      <span className={`text-sm font-medium ${getConfidenceClass(product.confianzaPrediccion)}`}>
                                        {getConfidenceLevel(product.confianzaPrediccion)}
                                      </span>
                                    </div>
                                    {product.articulo_id && (
                                      <div className="flex justify-between">
                                        <span className="text-sm text-gray-500 dark:text-gray-400">ID de artículo:</span>
                                        <span className="text-sm font-mono text-gray-900 dark:text-white">{product.articulo_id}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Columna de recomendación */}
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                  <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                                    Recomendación
                                  </h4>
                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-500 dark:text-gray-400">Cantidad sugerida:</span>
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">{product.cantidadSugerida?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-500 dark:text-gray-400">Confianza:</span>
                                      <span className={`text-sm font-medium ${getConfidenceClass(product.confianzaRecomendacion)}`}>
                                        {product.confianzaRecomendacion.toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-500 dark:text-gray-400">Tipo:</span>
                                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{product.tipo}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Recommendation reason section */}
                              {product.motivo && (
                                <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                  <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                                    Motivo de la Recomendación
                                  </h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-300">
                                    {product.motivo}
                                  </p>
                                </div>
                              )}
                              
                              {/* Additional recommendation details section */}
                              {(product.tipo_recomendacion || product.frecuencia_otras || product.num_sucursales || product.nivel_recomendacion || product.pedidos_recientes_otras) && (
                                <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                  <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                                    Detalles Adicionales de la Recomendación
                                  </h4>
                                  <div className="space-y-4">
                                    {/* Quantity range */}
                                    {(product.min_cantidad !== undefined || product.max_cantidad !== undefined) && (
                                      <div>
                                        <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Rango de Cantidad Recomendada</h5>
                                        <div className="grid grid-cols-2 gap-2">
                                          {product.min_cantidad !== undefined && (
                                            <div className="bg-gray-50 dark:bg-gray-800/60 rounded p-2">
                                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Mínimo:</span>
                                              <span className="text-sm font-bold text-gray-900 dark:text-white">{product.min_cantidad}</span>
                                            </div>
                                          )}
                                          {product.max_cantidad !== undefined && (
                                            <div className="bg-gray-50 dark:bg-gray-800/60 rounded p-2">
                                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Máximo:</span>
                                              <span className="text-sm font-bold text-gray-900 dark:text-white">{product.max_cantidad}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Recommendation type and level */}
                                    {(product.tipo_recomendacion || product.nivel_recomendacion !== undefined) && (
                                      <div>
                                        <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Clasificación</h5>
                                        <div className="grid grid-cols-2 gap-2">
                                          {product.tipo_recomendacion && (
                                            <div className="bg-gray-50 dark:bg-gray-800/60 rounded p-2">
                                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Tipo:</span>
                                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{product.tipo_recomendacion}</span>
                                            </div>
                                          )}
                                          {product.nivel_recomendacion !== undefined && (
                                            <div className="bg-gray-50 dark:bg-gray-800/60 rounded p-2">
                                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Nivel:</span>
                                              <div className="flex items-center mt-1">
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                  <svg 
                                                    key={i}
                                                    className={`w-4 h-4 ${i < product.nivel_recomendacion! ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                                                    fill="currentColor" 
                                                    viewBox="0 0 20 20"
                                                  >
                                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                  </svg>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Data from other branches */}
                                    {(product.frecuencia_otras !== undefined || product.num_sucursales !== undefined) && (
                                      <div>
                                        <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Datos de Otras Sucursales</h5>
                                        <div className="grid grid-cols-2 gap-2">
                                          {product.frecuencia_otras !== undefined && (
                                            <div className="bg-gray-50 dark:bg-gray-800/60 rounded p-2">
                                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Frecuencia:</span>
                                              <span className="text-sm font-medium">{(product.frecuencia_otras * 100).toFixed(1)}%</span>
                                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">de las sucursales</span>
                                            </div>
                                          )}
                                          {product.num_sucursales !== undefined && (
                                            <div className="bg-gray-50 dark:bg-gray-800/60 rounded p-2">
                                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Número de Sucursales:</span>
                                              <span className="text-sm font-medium text-gray-900 dark:text-white">{product.num_sucursales}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Last order data */}
                                    {(product.ultima_fecha_pedido || product.dias_desde_ultimo_pedido !== undefined || product.cantidad_ultimo_pedido !== undefined) && (
                                      <div>
                                        <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Último Pedido</h5>
                                        <div className="bg-gray-50 dark:bg-gray-800/60 rounded p-3">
                                          {product.ultima_fecha_pedido && (
                                            <div className="mb-2">
                                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Fecha:</span>
                                              <span className="text-sm font-medium text-gray-900 dark:text-white">{product.ultima_fecha_pedido}</span>
                                            </div>
                                          )}
                                          <div className="grid grid-cols-2 gap-2">
                                            {product.dias_desde_ultimo_pedido !== undefined && (
                                              <div>
                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Hace:</span>
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">{product.dias_desde_ultimo_pedido} días</span>
                                              </div>
                                            )}
                                            {product.cantidad_ultimo_pedido !== undefined && (
                                              <div>
                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">Cantidad:</span>
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">{product.cantidad_ultimo_pedido}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Recent orders from other branches */}
                                    {product.pedidos_recientes_otras && product.pedidos_recientes_otras.length > 0 && (
                                      <div>
                                        <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                                          Pedidos Recientes en Otras Sucursales
                                        </h5>
                                        <div className="overflow-x-auto">
                                          <table className="min-w-full text-xs">
                                            <thead className="bg-gray-50 dark:bg-gray-800/60">
                                              <tr>
                                                <th className="px-2 py-1 text-left text-gray-500 dark:text-gray-400 font-medium">Sucursal</th>
                                                <th className="px-2 py-1 text-left text-gray-500 dark:text-gray-400 font-medium">Días</th>
                                                <th className="px-2 py-1 text-left text-gray-500 dark:text-gray-400 font-medium">Cantidad</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                              {product.pedidos_recientes_otras.map((pedido, idx) => (
                                                <tr key={idx} className="bg-white dark:bg-gray-800/30">
                                                  <td className="px-2 py-1 text-gray-900 dark:text-white">{pedido.sucursal}</td>
                                                  <td className="px-2 py-1 text-gray-900 dark:text-white">{pedido.dias_desde_pedido}</td>
                                                  <td className="px-2 py-1 text-gray-900 dark:text-white">{pedido.cantidad}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Comparative analysis section */}
                              <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                                  Análisis Comparativo
                                </h4>
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Diferencia absoluta:</span>
                                    <span className={`text-sm font-medium ${getDifferenceClass(product.diferenciaCantidad || 0)}`}>
                                      {product.diferenciaCantidad! > 0 ? '+' : ''}{product.diferenciaCantidad?.toLocaleString() || 0}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Cantidad promedio:</span>
                                    <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                      {product.cantidadPromedio?.toLocaleString() || 0}
                                    </span>
                                  </div>
                                  <div className="mt-3">
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Comparación visual:</div>
                                    <div className="relative pt-1">
                                      <div className="flex mb-2 items-center justify-between">
                                        <div>
                                          <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                                            Predicción
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-indigo-600 bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300">
                                            Promedio
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-purple-600 bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300">
                                            Recomendación
                                          </span>
                                        </div>
                                      </div>
                                      <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200 dark:bg-gray-700">
                                        <div 
                                          className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 dark:bg-blue-600"
                                          style={{ width: '33%' }}
                                        />
                                        <div 
                                          className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500 dark:bg-indigo-600"
                                          style={{ width: `${33 * ((product.cantidadPromedio ?? 0) / (product.cantidadPredicha ?? 1))}%` }}
                                        />
                                        <div 
                                          className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-purple-500 dark:bg-purple-600"
                                          style={{ width: `${33 * (product.cantidadSugerida / product.cantidadPredicha) || 0}%` }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                  <p className="italic">
                                    {product.diferenciaCantidad! > 0 
                                      ? 'Se recomienda aumentar el inventario respecto a la predicción.' 
                                      : product.diferenciaCantidad! < 0 
                                        ? 'Se recomienda reducir el inventario respecto a la predicción.'
                                        : 'La recomendación coincide con la predicción.'}
                                  </p>
                                  <p className="mt-1 italic">
                                    La cantidad promedio sugerida es: <span className="font-medium">{product.cantidadPromedio?.toLocaleString() || 0}</span> unidades.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {(!predictionData.commonProducts || predictionData.commonProducts.length === 0) && (
                    <div className="text-center py-12">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No hay productos comunes</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        No hay productos que aparezcan tanto en predicciones como en recomendaciones para esta sucursal en esta fecha.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="mt-16 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Sistema de Predicción de Requerimientos © {new Date().getFullYear()}</p>
      </footer>

      {/* Modal for feedback */}
      {selectedProduct && (
        <OrderFeedbackModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          product={selectedProduct}
          onSubmit={handleSaveFeedback}
          loading={loadingFeedback[selectedProduct.nombre] || false}
        />
      )}
    </div>
  );
};

export default HistoricalPredictionPage;
