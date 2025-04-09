import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { Prediction, NoOrdenadoRazon, FeedbackProduct } from '../../types/models';
import { isUserLoggedIn, getCurrentUser } from '../../utils/auth';
import OrderFeedbackModal from '../../components/OrderFeedbackModal';
import { FiInfo, FiCheck, FiX, FiDownload } from 'react-icons/fi';
import { getDisplayBranchName } from '../../utils/branchMapping';
import { useAppStore } from '../../utils/store';
import StatusIndicator from '../../components/StatusIndicator';
import { getActivityTracker } from '../../utils/activityTracker';

// Add imports for export functionality
import { utils as xlsxUtils, write } from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Interface for inventory data
interface InventoryData {
  articulo: string;
  existencia: number;
  disponible: boolean;
}

// Add this new interface for UniCompra product data
interface UniCompraProduct {
  _id: string;
  ARTICULO_ID: number;
  NOMBRE: string;
  CLAVE_ARTICULO: string;
  CONTENIDO_UNIDAD_COMPRA: number;
  ESTATUS: string;
}

interface CommonProduct {
  producto: string; // Add this line
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
  // Campos adicionales de recomendación
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
  // Feedback fields
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

const SucursalPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
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
  // Add new state for UniCompra products
  const [uniCompraProducts, setUniCompraProducts] = useState<UniCompraProduct[]>([]);
  
  // Add new state for export menu
  const [showExportMenu, setShowExportMenu] = useState(false);

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

  // Rename this function and modify to get all recommendations instead of just common products
  const getAllRecommendedProducts = (predictions: Prediction[], recommendations: any[]): CommonProduct[] => {
    const result: CommonProduct[] = [];
    
    // Create maps for faster lookup - still useful for matching with predictions
    const predMap = new Map(predictions.map(p => [p.nombre.toLowerCase(), p]));
    
    // Process all recommendations
    for (const rec of recommendations) {
      const recName = rec.nombre.toLowerCase();
      const pred = predMap.get(recName); // This might be undefined if no matching prediction
      
      // Create product object from recommendation, adding prediction data if available
      result.push({
        producto: rec.nombre,
        nombre: rec.nombre,
        // Use prediction quantity if available, otherwise default to 0
        cantidadPredicha: pred ? pred.cantidad : 0,
        cantidadSugerida: rec.cantidad_sugerida,
        cantidadPromedio: pred ? Math.round((pred.cantidad + rec.cantidad_sugerida) / 2) : rec.cantidad_sugerida,
        confianzaPrediccion: pred ? pred.confianza : 0,
        confianzaRecomendacion: rec.confianza,
        diferenciaCantidad: pred ? (rec.cantidad_sugerida - pred.cantidad) : rec.cantidad_sugerida,
        porcentajeDiferencia: pred && pred.cantidad > 0 ? ((rec.cantidad_sugerida - pred.cantidad) / pred.cantidad) * 100 : 0,
        tipo: rec.tipo,
        motivo: rec.motivo,
        // Additional fields from recommendation
        min_cantidad: rec.min_cantidad,
        max_cantidad: rec.max_cantidad,
        tipo_recomendacion: rec.tipo_recomendacion,
        frecuencia_otras: rec.frecuencia_otras,
        num_sucursales: rec.num_sucursales,
        nivel_recomendacion: rec.nivel_recomendacion,
        pedidos_recientes_otras: rec.pedidos_recientes_otras,
        ultima_fecha_pedido: rec.ultima_fecha_pedido,
        dias_desde_ultimo_pedido: rec.dias_desde_ultimo_pedido,
        cantidad_ultimo_pedido: rec.cantidad_ultimo_pedido,
        articulo_id: rec.articulo_id,
        // Feedback fields from prediction if available
        ordenado: pred ? pred.ordenado : undefined,
        razon_no_ordenado: pred ? pred.razon_no_ordenado : undefined,
        comentario_no_ordenado: pred ? pred.comentario_no_ordenado : undefined,
      });
    }
    
    // Sort by name
    return result.sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const fetchFeedbackData = async () => {
    try {
      // Include predictionId in the query params if available
      const predictionIdParam = predictionData?.timestamp ? 
        `&predictionId=${encodeURIComponent(predictionData.timestamp)}` : '';
      
      const response = await fetch(`/api/feedback?sucursal=${encodeURIComponent(id as string)}${predictionIdParam}`);
      if (!response.ok) throw new Error('Error fetching feedback data');
      
      const data = await response.json();
      
      // No need to filter by date here as we're already filtering by predictionId in the API
      return data.feedback;
    } catch (error) {
      console.error('Error fetching feedback data:', error);
      return [];
    }
  };

  useEffect(() => {
    if (!id || !router.isReady) return;

    // Start activity tracking when the component mounts
    if (typeof window !== 'undefined') {
      const activityTracker = getActivityTracker();
      activityTracker.startTracking();
      activityTracker.recordPageView(`Branch: ${id}`);
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch feedback data
        const feedbackData = await fetchFeedbackData();

        // Establecer el nombre de la sucursal inicialmente desde el parámetro de la URL
        const decodedId = typeof id === 'string' ? decodeURIComponent(id) : '';
        setBranchName(getDisplayBranchName(decodedId));

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
          setBranchName(getDisplayBranchName(data.branch));
        }
        
        // Manejar tanto 'recommendations' como 'recommendation' (singular y plural)
        const recommendations = data.recommendations?.recommendations || 
                               data.recommendation?.recommendations || 
                               [];
        
        const predictions = data.prediction.predictions || [];
        
        // Changed: Get all recommended products using the new function
        const recommendedProducts = getAllRecommendedProducts(predictions, recommendations);
        
        // Merge feedback data with recommended products
        const mergedProducts = recommendedProducts.map(product => {
          // Match by product name AND predictionId to ensure correct associations
          const feedback = feedbackData.find((fb: { producto: string; predictionId?: string; fecha?: string }) => 
            fb.producto === product.nombre && 
            // Either match specific predictionId or allow backward compatibility for old data
            (fb.predictionId === data.prediction.timestamp || 
             (!fb.predictionId && fb.fecha === data.prediction.date))
          );
          return feedback ? { ...product, ...feedback } : product;
        });

        // Ensure cantidadPromedio is defined for all products
        mergedProducts.forEach(product => {
          if (product.cantidadPromedio === undefined) {
            product.cantidadPromedio = product.cantidadSugerida;
          }
        });
        
        setPredictionData({
          timestamp: data.prediction.timestamp,
          branch: data.branch,
          date: data.prediction.date,
          predictions: predictions,
          recommendations: recommendations,
          commonProducts: mergedProducts // Using our new list of all recommended products
        });
        
        console.log(`Recommended products found: ${mergedProducts.length}`);
        
        // Set loading to false here before inventory data fetching
        setLoading(false);
        
        // Fetch inventory data for all recommended products
        fetchInventoryData(mergedProducts).catch((err) => {
          console.error("Error fetching inventory data:", err);
        });
        
        // Fetch UniCompra product data
        await fetchUniCompraProducts();
        
      } catch (err) {
        console.error('Error al cargar datos:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar datos');
        setLoading(false);
      }
    };

    fetchData();

    // Stop activity tracking when the component unmounts
    return () => {
      if (typeof window !== 'undefined') {
        const activityTracker = getActivityTracker();
        activityTracker.stopTracking();
      }
    };
  }, [id, router.isReady]);

  // Fetch inventory data ONLY for common products (those that appear in the final table)
  const fetchInventoryData = async (commonProducts: CommonProduct[]) => {
    try {
      const inventoryData: Record<string, InventoryData> = {};
      console.log(`Starting inventory fetch for ${commonProducts.length} common products with date: ${predictionData?.date || 'unknown'}`);
      
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
            
            console.log(`[${i+1}/${commonProducts.length}] Checking inventory for: "${searchTerm}"`);
            
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
              // Add predictionDate parameter to get the closest historical inventory
              const predictionDateParam = predictionData?.date ? 
                `&predictionDate=${encodeURIComponent(predictionData.date)}` : '';
              
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
                  console.log(`✅ Found inventory for "${product.nombre}": ${data.data.existencia} units using collection: ${data.collection}`);
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
          
          // Add a small delay between requests to avoid overwhelming the server
          // Only if there are many products
          if (commonProducts.length > 10 && i % 5 === 4) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
        } catch (itemError) {
          console.error(`Error processing inventory for "${product.nombre}":`, itemError);
          // Continue with the next product even if this one fails
        }
      }
      
      console.log(`✓ Completed inventory lookup: found data for ${Object.keys(inventoryData).length}/${commonProducts.length} products`);
      setInventory(inventoryData);
      
    } catch (error) {
      console.error('Error in inventory data processing:', error);
      // We still set inventory to whatever we've collected so far
      setInventory({});
    }
  };

  // Add new function to fetch UniCompra products
  const fetchUniCompraProducts = async () => {
    try {
      const response = await fetch('/api/unicompra-products');
      
      if (!response.ok) {
        console.error('Error fetching UniCompra products:', response.statusText);
        return;
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.products)) {
        setUniCompraProducts(data.products);
        console.log(`Loaded ${data.products.length} UniCompra products`);
      }
    } catch (error) {
      console.error('Error fetching UniCompra products:', error);
    }
  };

  // Add helper function to find matching UniCompra product
  const findUniCompraProduct = (productName: string): UniCompraProduct | null => {
    // First try an exact match
    let match = uniCompraProducts.find(p => 
      p.NOMBRE.toLowerCase() === productName.toLowerCase()
    );
    
    // If no exact match, try a fuzzy match (product name contains UniCompra name or vice versa)
    if (!match) {
      match = uniCompraProducts.find(p => 
        p.NOMBRE.toLowerCase().includes(productName.toLowerCase()) || 
        productName.toLowerCase().includes(p.NOMBRE.toLowerCase())
      );
    }
    
    return match || null;
  };
  
  // Add helper to calculate pack quantity
  const calculatePackQuantity = (quantity: number, packSize: number): string => {
    if (!packSize || packSize <= 0) return 'N/A';
    
    const packs = quantity / packSize;
    // If it's a whole number, show it as is
    if (packs % 1 === 0) return packs.toString();
    // Otherwise show with 2 decimal places
    return packs.toFixed(2);
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
      
      // Ensure we have the current predictionId
      if (!predictionData?.timestamp) {
        throw new Error('Missing prediction timestamp for feedback');
      }
      
      const response = await fetch('/api/order-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          producto: product.producto,
          cantidad: product.cantidadPredicha ?? product.cantidad ?? 0,
          sucursal: id,
          fecha: predictionData.date,
          ordenado: ordered,
          razon_no_ordenado: reason,
          comentario: comment,
          predictionId: predictionData.timestamp // Always use the current prediction's timestamp
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

  // Modified rendering of product items to include inventory data
  const renderPredictionItem = (prediction: any, index: number) => {
    const productName = prediction.articulo || prediction.producto;
    const inventoryItem = inventory[productName];
    
    return (
      <div key={index} className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4 relative overflow-hidden">
        {/* ...existing product content... */}
        
        {/* Add inventory information */}
        <div className="mt-3 border-t pt-2 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Inventario CEDIS:</h4>
          {inventoryItem ? (
            <div className="flex items-center mt-1">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                inventoryItem.disponible ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className="text-sm">
                {inventoryItem.disponible 
                  ? `Disponible (${inventoryItem.existencia} unidades)` 
                  : 'No disponible en CEDIS'}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">No encontrado en inventario</span>
          )}
        </div>
        
        {/* ...other UI elements... */}
      </div>
    );
  };

  // Add a utility function to get badge class based on recommendation type
  const getRecommendationBadgeClass = (type: string | undefined) => {
    if (!type) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    
    switch(type.toLowerCase()) {
      case 'frecuente':
      case 'muy frecuente':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200';
      case 'regular':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200';
      case 'ocasional':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
      case 'raro':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200';
      case 'nunca pedido':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200';
    }
  };

  // Function to export data to Excel
  const exportToExcel = () => {
    if (!predictionData?.commonProducts?.length) {
      alert('No hay datos para exportar');
      return;
    }

    // Create worksheet data
    const worksheetData = predictionData.commonProducts.map((product, index) => {
      const uniCompraProduct = findUniCompraProduct(product.nombre);
      const inventoryItem = inventory[product.nombre];
      const boxCount = uniCompraProduct 
        ? calculatePackQuantity(product.cantidadSugerida || 0, uniCompraProduct.CONTENIDO_UNIDAD_COMPRA) 
        : 'N/A';
      const cedisInventory = inventoryItem 
        ? inventoryItem.existencia > 0 
          ? uniCompraProduct 
            ? `${calculatePackQuantity(inventoryItem.existencia, uniCompraProduct.CONTENIDO_UNIDAD_COMPRA)} cajas en CEDIS` 
            : `${inventoryItem.existencia} pz en CEDIS`
          : 'No disponible en CEDIS' 
        : 'Sin datos CEDIS';
      
      return {
        'No': index + 1,
        'Producto': product.nombre,
        'Clave Producto': uniCompraProduct?.CLAVE_ARTICULO || 'N/A',
        'Cajas Recomendadas': boxCount,
        'Piezas Recomendadas': product.cantidadSugerida,
        'Disponibilidad CEDIS': cedisInventory,
        'Tipo Recomendación': product.tipo_recomendacion || 'N/A',
        'Frecuencia Otras Sucursales': product.frecuencia_otras || 0,
        'Número de Sucursales': product.num_sucursales || 0,
        'Estado': product.ordenado === true ? 'Ordenado' : 
                 product.ordenado === false ? 'No ordenado' : 'Sin decisión',
        'Razón (si no ordenado)': product.ordenado === false && product.razon_no_ordenado 
          ? product.razon_no_ordenado === 'hay_en_tienda' 
            ? 'Hay producto en tienda' 
            : product.razon_no_ordenado === 'no_hay_en_cedis' 
              ? 'No hay producto en CEDIS' 
              : product.comentario_no_ordenado || product.razon_no_ordenado
          : ''
      };
    });

    // Create worksheet and workbook
    const worksheet = xlsxUtils.json_to_sheet(worksheetData);
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, worksheet, 'Productos');

    // Generate Excel file
    const excelBuffer = write(workbook, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Create download link
    const fileName = `Productos_${branchName.replace(/\s+/g, '_')}_${predictionData.date}.xlsx`;
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    
    // Clean up
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // Function to export data to PDF
  const exportToPDF = () => {
    if (!predictionData?.commonProducts?.length) {
      alert('No hay datos para exportar');
      return;
    }

    // Create new PDF document
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text(`Productos Recomendados - ${branchName}`, 14, 22);
    
    // Add date
    doc.setFontSize(12);
    doc.text(`Fecha: ${predictionData.date}`, 14, 30);
    
    // Prepare table data
    const tableRows = predictionData.commonProducts.map((product, index) => {
      const uniCompraProduct = findUniCompraProduct(product.nombre);
      const inventoryItem = inventory[product.nombre];
      const boxCount = uniCompraProduct 
        ? calculatePackQuantity(product.cantidadSugerida || 0, uniCompraProduct.CONTENIDO_UNIDAD_COMPRA) 
        : 'N/A';
      const cedisInventory = inventoryItem 
        ? inventoryItem.existencia > 0 
          ? uniCompraProduct 
            ? `${calculatePackQuantity(inventoryItem.existencia, uniCompraProduct.CONTENIDO_UNIDAD_COMPRA)} cajas` 
            : `${inventoryItem.existencia} pz` 
          : 'No disponible' 
        : 'Sin datos';
      
      return [
        index + 1,
        product.nombre,
        uniCompraProduct?.CLAVE_ARTICULO || 'N/A',
        boxCount,
        cedisInventory,
        product.tipo_recomendacion || 'N/A',
        product.frecuencia_otras || 0,
        product.num_sucursales || 0,
        product.ordenado === true ? 'Ordenado' : 
        product.ordenado === false ? 'No ordenado' : 'Sin decisión'
      ];
    });
    
    // Add table to PDF
    (doc as any).autoTable({
      head: [['#', 'Producto', 'Clave', 'Cajas', 'Inventario', 'Tipo Rec.', 'Frec.', 'Suc.', 'Estado']],
      body: tableRows,
      startY: 35,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      columnStyles: { 
        0: { cellWidth: 8 },
        1: { cellWidth: 50 },
        2: { cellWidth: 20 },
        3: { cellWidth: 12 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 10 },
        7: { cellWidth: 10 },
        8: { cellWidth: 20 }
      }
    });
    
    // Save PDF
    const fileName = `Productos_${branchName.replace(/\s+/g, '_')}_${predictionData.date}.pdf`;
    doc.save(fileName);
    setShowExportMenu(false);
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
                   {branchName}
                </h1>
                {predictionData && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Última actualización: {format(new Date(predictionData.timestamp), 'dd/MM/yyyy HH:mm')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Add export dropdown button */}
              {!loading && !error && predictionData && (
                <div className="relative">
                  <button 
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 flex items-center"
                  >
                    <FiDownload className="mr-2" />
                    Exportar
                  </button>
                  
                  {showExportMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10 border border-gray-200 dark:border-gray-700">
                      <ul className="py-1">
                        <li>
                          <button
                            onClick={exportToExcel}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Exportar a Excel
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={exportToPDF}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Exportar a PDF
                          </button>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
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
                      Productos Recomendados
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {predictionData.commonProducts?.length || 0} productos recomendados para esta sucursal • Fecha: {predictionData.date}
                    </p>
                  </div>
                  
                  {/* Lista simplificada de productos */}
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {predictionData.commonProducts?.map((product, index) => {
                      const inventoryItem = inventory[product.nombre];
                      const uniCompraProduct = findUniCompraProduct(product.nombre);
                      
                      return (
                        <div key={index} className="bg-white dark:bg-gray-800">
                          <div className="px-6 py-4 flex items-center justify-between">
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
                                
                                {uniCompraProduct && (
                                  <div className="mt-1 flex flex-col">
                                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                      CLAVE PRODUCTO: {uniCompraProduct.CLAVE_ARTICULO || 'N/A'}
                                    </span>
                                  </div>
                                )}
                                
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex items-center">
                                  <span>
                                     Cajas Recomendadas: {uniCompraProduct ? 
                                        calculatePackQuantity(
                                          product.cantidadSugerida || 0, 
                                          uniCompraProduct.CONTENIDO_UNIDAD_COMPRA
                                        ) : 'N/A'}
                                  </span>
                                </p>
                              </div>
                              
                              {product.ordenado === undefined && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenFeedbackModal(product);
                                  }}
                                  className="px-2 py-1 text-xs font-medium text-white bg-[#0B9ED9] rounded hover:bg-[#0989c0] flex items-center"
                                >
                                  <FiInfo className="mr-2" />
                                  Motivo de omisión
                                </button>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {inventoryItem ? (
                                <div className="flex items-center bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1">
                                  <div className={`w-2 h-2 rounded-full ${
                                    inventoryItem.disponible ? 'bg-green-500' : 'bg-red-500'
                                  }`}></div>
                                  <span className="ml-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {inventoryItem.existencia > 0 ? (
                                      <>
                                        {uniCompraProduct ? (
                                          <>{calculatePackQuantity(inventoryItem.existencia, uniCompraProduct.CONTENIDO_UNIDAD_COMPRA)} cajas en CEDIS</>
                                        ) : (
                                          <>{inventoryItem.existencia} pz en CEDIS</>
                                        )}
                                      </>
                                    ) : 'No disponible en CEDIS'}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1">
                                  Sin datos CEDIS
                                </div>
                              )}
                              
                              {/* Replace confidence with recommendation type */}
                              {product.tipo_recomendacion && (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRecommendationBadgeClass(product.tipo_recomendacion)}`}>
                                  {product.tipo_recomendacion}
                                </span>
                              )}
                              
                              {/* Add frequency and branch count */}
                              {product.frecuencia_otras !== undefined && product.num_sucursales !== undefined && (
                                <span className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 px-2 py-0.5 rounded">
                                  {product.frecuencia_otras} veces en {product.num_sucursales} sucursales
                                </span>
                              )}
                              
                              {renderOrderStatus(product)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {(!predictionData.commonProducts || predictionData.commonProducts.length === 0) && (
                    <div className="text-center py-12">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No hay productos disponibles</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        No hay productos recomendados para esta sucursal.
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

export default SucursalPage;