import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import localFont from 'next/font/local';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

const geistSans = localFont({
  src: '../fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  src: '../fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

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
  motivo?: string;
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
}

interface PredictionData {
  timestamp: string;
  branch: string;
  date: string;
  predictions: Prediction[];
  recommendations?: Recommendation[];
  commonProducts?: {
    nombre: string;
    cantidadPredicha: number;
    cantidadSugerida: number;
    cantidadPromedio: number;
    confianzaPrediccion: number;
    confianzaRecomendacion: number;
    tipo: string;
    articulo_id?: string;
    // Campos para análisis comparativo
    diferenciaCantidad?: number;
    porcentajeDiferencia?: number;
    motivo: string;
    // Campos adicionales de la API
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
  }[];
}

export default function SucursalView() {
  const router = useRouter();
  const { id } = router.query;
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [predictionData, setPredictionData] = useState<PredictionData | null>(null);
  const [systemStatus, setSystemStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [branchName, setBranchName] = useState<string>("");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Establecer el nombre de la sucursal inicialmente desde el parámetro de la URL
        const decodedId = typeof id === 'string' ? decodeURIComponent(id) : '';
        setBranchName(decodedId);

        const statusResponse = await fetch('/api/proxy?endpoint=estado');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const isOnline = statusData.estado === "online" || statusData.originalResponse?.branches > 0;
          setSystemStatus(isOnline ? "online" : "offline");
        }
        
        console.log(`Fetching data for branch: ${decodedId}`);
        const response = await fetch(`/api/sucursal-predictions?id=${encodeURIComponent(decodedId)}`);
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.message || 'No se pudieron obtener las predicciones');
        }
        
        // Actualizar el nombre de la sucursal con el nombre real devuelto por la API
        if (data.branch) {
          setBranchName(data.branch);
        }
        
        // Manejar tanto 'recommendations' como 'recommendation' (singular y plural)
        const recommendations = data.recommendations?.recommendations || 
                               data.recommendation?.recommendations || 
                               [];
        
        const predictions = data.prediction.predictions || [];
        
        // Obtener los productos comunes (intersección) con análisis comparativo
        const commonProducts = getCommonProducts(predictions, recommendations);
        
        // Asegurarnos de que cantidadPromedio esté definido en todos los productos
        commonProducts.forEach(product => {
          if (product.cantidadPromedio === undefined) {
            product.cantidadPromedio = Math.round((product.cantidadPredicha + product.cantidadSugerida) / 2);
          }
        });
        
        setPredictionData({
          timestamp: data.prediction.timestamp,
          branch: data.branch,
          date: data.prediction.date,
          predictions: predictions,
          recommendations: recommendations,
          commonProducts: commonProducts
        });
        
        console.log(`Productos comunes encontrados: ${commonProducts.length}`);
      } catch (err) {
        console.error('Error al cargar datos:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // Función para encontrar productos comunes entre predicciones y recomendaciones
  const getCommonProducts = (predictions: Prediction[], recommendations: Recommendation[]) => {
    // Crear un mapa de productos predichos para búsqueda rápida
    const predictionMap = new Map();
    predictions.forEach(prediction => {
      predictionMap.set(prediction.nombre, prediction);
    });
    
    // Encontrar productos que están en ambas listas
    const commonProducts = [];
    for (const recommendation of recommendations) {
      if (predictionMap.has(recommendation.nombre)) {
        const prediction = predictionMap.get(recommendation.nombre);
        
        // Calcular métricas comparativas
        const diferenciaCantidad = recommendation.cantidad_sugerida - prediction.cantidad;
        const porcentajeDiferencia = prediction.cantidad === 0 
          ? 100 // Evitar división por cero
          : (diferenciaCantidad / prediction.cantidad) * 100;
        
        // Calcular el promedio entre cantidad predicha y recomendada
        const cantidadPromedio = Math.round((prediction.cantidad + recommendation.cantidad_sugerida) / 2);
        
        commonProducts.push({
          nombre: recommendation.nombre,
          cantidadPredicha: prediction.cantidad,
          cantidadSugerida: recommendation.cantidad_sugerida,
          cantidadPromedio: cantidadPromedio,
          confianzaPrediccion: prediction.confianza,
          confianzaRecomendacion: recommendation.confianza,
          tipo: recommendation.tipo || 'Recomendación',
          articulo_id: prediction.articulo_id,
          diferenciaCantidad,
          porcentajeDiferencia,
          motivo: recommendation.motivo || 'No disponible',
          // Campos adicionales de la API
          min_cantidad: recommendation.min_cantidad,
          max_cantidad: recommendation.max_cantidad,
          tipo_recomendacion: recommendation.tipo_recomendacion,
          frecuencia_otras: recommendation.frecuencia_otras,
          num_sucursales: recommendation.num_sucursales,
          nivel_recomendacion: recommendation.nivel_recomendacion,
          pedidos_recientes_otras: recommendation.pedidos_recientes_otras,
          ultima_fecha_pedido: recommendation.ultima_fecha_pedido,
          dias_desde_ultimo_pedido: recommendation.dias_desde_ultimo_pedido,
          cantidad_ultimo_pedido: recommendation.cantidad_ultimo_pedido
        });
      }
    }
    
    // Ordenar por diferencia porcentual descendente (para mostrar primero los que más difieren)
    return commonProducts.sort((a, b) => Math.abs(b.porcentajeDiferencia!) - Math.abs(a.porcentajeDiferencia!));
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 80) return "text-green-600 dark:text-green-400";
    if (confidence >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };
  
  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 80) return "Alto";
    if (confidence >= 60) return "Medio";
    return "Bajo";
  };

  // Solo mostrar el color si la confianza está disponible
  const getLevelBadgeClass = (confidence: number) => {
    if (confidence >= 80) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200";
    if (confidence >= 60) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200";
  };
  
  // Nuevo: Obtener clase CSS para la diferencia
  const getDifferenceClass = (difference: number) => {
    if (difference > 10) return "text-green-600 dark:text-green-400";
    if (difference < -10) return "text-red-600 dark:text-red-400";
    return "text-yellow-600 dark:text-yellow-400";
  };
  
  // Función para toggle la expansión de un producto
  const toggleProductExpansion = (productName: string) => {
    if (expandedProduct === productName) {
      setExpandedProduct(null);
    } else {
      setExpandedProduct(productName);
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
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Sucursal: {branchName}
                </h1>
                {predictionData && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Última actualización: {format(new Date(predictionData.timestamp), 'dd/MM/yyyy HH:mm')}
                  </p>
                )}
              </div>
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
        {loading ? (
          <div className="flex items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            <span className="ml-3 text-gray-700 dark:text-gray-300">Cargando datos...</span>
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
                    No se pudieron cargar las predicciones para esta sucursal. Es posible que aún no haya predicciones disponibles.
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
                      Análisis de Productos
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {predictionData.commonProducts?.length || 0} productos analizados para esta sucursal • Fecha: {predictionData.date}
                    </p>
                  </div>
                  
                  {/* Lista de productos con detalles completos */}
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {predictionData.commonProducts?.map((product, index) => {
                      const isExpanded = expandedProduct === product.nombre;
                      const differenceClass = getDifferenceClass(product.porcentajeDiferencia || 0);
                      
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
                            </div>
                            <div className="flex items-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${getLevelBadgeClass(product.confianzaPrediccion)}`}>
                                {getConfidenceLevel(product.confianzaPrediccion)}
                              </span>
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
                          
                          {/* Detalles expandibles */}
                          {isExpanded && (
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
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
                              
                              {/* Sección de motivo de la recomendación */}
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
                              
                              {/* Sección de detalles adicionales de la recomendación */}
                              {(product.tipo_recomendacion || product.frecuencia_otras || product.num_sucursales || product.nivel_recomendacion || product.pedidos_recientes_otras) && (
                                <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                  <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                                    Detalles Adicionales de la Recomendación
                                  </h4>
                                  <div className="space-y-4">
                                    {/* Rango de cantidad */}
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
                                    
                                    {/* Tipo y nivel de recomendación */}
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
                                    
                                    {/* Datos sobre otras sucursales */}
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
                                    
                                    {/* Último pedido */}
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
                                    
                                    {/* Pedidos recientes en otras sucursales */}
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
                              
                              {/* Sección de análisis comparativo */}
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
                                          style={{ width: `${33 * (product.cantidadPromedio / product.cantidadPredicha) || 0}%` }}
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
                        No hay productos que aparezcan tanto en predicciones como en recomendaciones para esta sucursal.
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      Información Adicional
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Detalles sobre las predicciones y recomendaciones
                    </p>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-2">Predicciones</h3>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Total productos</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{predictionData.predictions.length}</span>
                        </div>
                        <div className="mt-2 flex justify-between items-center">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Productos mostrados</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{predictionData.commonProducts?.length || 0}</span>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-2">Recomendaciones</h3>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Total productos</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{predictionData.recommendations?.length || 0}</span>
                        </div>
                        <div className="mt-2 flex justify-between items-center">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Productos comunes</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{predictionData.commonProducts?.length || 0}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                      <p>Nota: En esta vista solo se muestran los productos que aparecen tanto en predicciones como en recomendaciones.</p>
                      <p className="mt-1">Para ver el conjunto completo de datos, visite el <Link href="/enrique" className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300">Panel Avanzado</Link>.</p>
                    </div>
                  </div>
                </div>
              </>
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