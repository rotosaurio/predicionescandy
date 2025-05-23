import Image from "next/image";
import localFont from "next/font/local";
import { useState, useEffect } from "react";
import { format, parseISO, startOfMonth, endOfMonth, isSameDay, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import Link from "next/link";
import { useRouter } from 'next/router';
import ObservationsTable from '../../components/ObservationsTable';
import { FeedbackProduct } from '../../types/models';
import { clearCurrentUser } from '../../utils/auth';
import { getActivityTracker } from '../../utils/activityTracker';
import UserActivityStats from '../../components/UserActivityStats';

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

interface Prediction {
  nombre: string;
  cantidad: number;
  confianza: number;
  articulo_id?: string;
}

interface Recommendation {
  nombre: string;
  cantidad_sugerida: number;
  confianza: number;
  tipo: string;
}

interface HistoricalPrediction {
  _id?: string;
  timestamp: string;
  branch: string;
  date: string;
  predictions: Prediction[];
  recommendations?: Recommendation[];
}

interface BranchStats {
  name: string;
  predictionsCount: number;
  lastUpdate: string;
  averageConfidence: number;
  topProducts: {
    name: string;
    quantity: number;
    confidence: number;
  }[];
}

interface FeedbackData {
  sucursal: string;
  fecha: string;
  feedback: FeedbackProduct[];
  predictionId?: string; // Add the predictionId property as optional
}

export default function AdvancedPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalPrediction[]>([]);
  const [systemStatus, setSystemStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "this-month" | "last-week" | "custom">("all");
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "branch" | "products">("date-desc");
  const [branchStats, setBranchStats] = useState<BranchStats[]>([]);
  const [totalStats, setTotalStats] = useState({
    predictions: 0,
    branches: 0,
    products: 0,
    averageConfidence: 0,
  });
  const [observations, setObservations] = useState<FeedbackProduct[]>([]);
  const [feedbackData, setFeedbackData] = useState<FeedbackData[]>([]);
  const [filterSucursal, setFilterSucursal] = useState<string>('');
  const [filterFecha, setFilterFecha] = useState<string>('');
  const [filterProducto, setFilterProducto] = useState<string>('');
  const [uniqueSucursales, setUniqueSucursales] = useState<string[]>([]);
  const [uniqueFechas, setUniqueFechas] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedPredictionGroups, setExpandedPredictionGroups] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'predictions' | 'feedback' | 'userActivity'>('predictions');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const activityTracker = getActivityTracker();
      activityTracker.startTracking();
      activityTracker.recordPageView('Advanced Panel');
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Verificar estado del sistema
        const statusResponse = await fetch('/api/proxy?endpoint=estado');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const isOnline = statusData.estado === "online" || statusData.originalResponse?.branches > 0;
          setSystemStatus(isOnline ? "online" : "offline");
        }
        
        // Obtener sucursales
        const response = await fetch('/api/proxy?endpoint=sucursales');
        if (!response.ok) throw new Error("Error al obtener sucursales");
        
        const data = await response.json();
        if (data && Array.isArray(data.sucursales)) {
          setBranches(data.sucursales);
        }
        
        // Cargar historial de predicciones
        await loadHistoricalData();
        // Cargar feedback
        await loadFeedbackData();
      } catch (err) {
        setError("Error al cargar datos. Por favor, intente más tarde.");
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    return () => {
      if (typeof window !== 'undefined') {
        const activityTracker = getActivityTracker();
        activityTracker.stopTracking();
      }
    };
  }, []);

  useEffect(() => {
    if (historicalData.length > 0) {
      calculateStatistics();
    }
  }, [historicalData, selectedBranch, dateFilter, startDate, endDate]);

  const loadHistoricalData = async () => {
    try {
      console.log("Cargando historial de predicciones desde MongoDB...");
      const response = await fetch('/api/predictions-history');
      
      if (!response.ok) {
        throw new Error(`Error al cargar historial: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.history)) {
        console.log(`${data.history.length} predicciones cargadas desde MongoDB`);
        
        if (data.history.length === 0) {
          console.log("No se encontraron datos en la colección principal, intentando cargar desde colecciones individuales");
          await tryLoadFromIndividualCollections();
          return;
        }
        
        // Verificar si hay sucursales sin datos
        const branchesWithData = new Set(data.history.map((item: any) => item.branch));
        const missingBranches = branches.filter(branch => !branchesWithData.has(branch));
        
        if (missingBranches.length > 0) {
          console.log(`Faltan datos para ${missingBranches.length} sucursales. Intentando cargar datos específicos.`);
          // Cargar datos para sucursales específicas faltantes
          await loadMissingBranchData(missingBranches, data.history);
          return;
        }
        
        setHistoricalData(data.history);
        console.log("Datos cargados correctamente:", data.history);
      } else {
        console.log("No se encontraron predicciones en la base de datos");
        
        // Si no hay datos, intentamos cargar desde las colecciones individuales
        await tryLoadFromIndividualCollections();
      }
    } catch (err) {
      console.error("Error al cargar el historial:", err);
      setError("Error al cargar el historial de predicciones");
      
      // Si hay error, intentamos cargar desde las colecciones individuales
      await tryLoadFromIndividualCollections();
    }
  };
  
  const tryLoadFromIndividualCollections = async () => {
    console.log("Intentando cargar datos desde colecciones individuales...");
    try {
      // Para cada sucursal, intentamos cargar sus predicciones
      const allData: HistoricalPrediction[] = [];
      
      for (const branch of branches) {
        try {
          const response = await fetch(`/api/sucursal-predictions?id=${encodeURIComponent(branch)}`);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.prediction) {
              allData.push({
                timestamp: data.prediction.timestamp || new Date().toISOString(),
                branch: branch, // Usamos el nombre exacto de la sucursal
                date: data.prediction.date || new Date().toISOString().split('T')[0],
                predictions: data.prediction.predictions || [],
                recommendations: data.recommendation?.recommendations || []
              });
              console.log(`Datos cargados correctamente para sucursal: ${branch}`);
            } else {
              console.log(`No se encontraron datos para sucursal: ${branch}`);
            }
          }
        } catch (e) {
          console.error(`Error cargando datos para sucursal ${branch}:`, e);
        }
      }
      
      if (allData.length > 0) {
        console.log(`Recuperados ${allData.length} registros de predicciones desde APIs individuales`);
        setHistoricalData(allData);
      } else {
        console.log("No se pudieron encontrar datos en ninguna colección");
        setHistoricalData([]);
      }
    } catch (e) {
      console.error("Error al intentar cargar desde colecciones individuales:", e);
      setHistoricalData([]);
    }
  };

  const loadMissingBranchData = async (missingBranches: string[], existingData: HistoricalPrediction[]) => {
    console.log(`Cargando datos para ${missingBranches.length} sucursales faltantes`);
    const additionalData: HistoricalPrediction[] = [];
    
    for (const branch of missingBranches) {
      try {
        const response = await fetch(`/api/sucursal-predictions?id=${encodeURIComponent(branch)}`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.prediction) {
            additionalData.push({
              timestamp: data.prediction.timestamp || new Date().toISOString(),
              branch: branch, // Nombre exacto de la sucursal
              date: data.prediction.date || new Date().toISOString().split('T')[0],
              predictions: data.prediction.predictions || [],
              recommendations: data.recommendation?.recommendations || []
            });
            console.log(`Datos adicionales cargados para sucursal: ${branch}`);
          }
        }
      } catch (e) {
        console.error(`Error cargando datos adicionales para ${branch}:`, e);
      }
    }
    
    if (additionalData.length > 0) {
      console.log(`Añadiendo ${additionalData.length} registros adicionales a los datos históricos`);
      const combinedData = [...existingData, ...additionalData];
      setHistoricalData(combinedData);
    } else {
      console.log("No se pudieron cargar datos adicionales");
      setHistoricalData(existingData);
    }
  };

  const calculateStatistics = () => {
    // Filtrar datos según los criterios seleccionados
    const filteredData = filterHistoricalData();
    
    // Calcular estadísticas por sucursal
    const branchesMap = new Map<string, any>();
    const allProducts = new Set<string>();
    let totalConfidence = 0;
    let totalPredictionItems = 0;
    
    filteredData.forEach(item => {
      const branch = item.branch;
      const timestamp = item.timestamp;
      const predictions = item.predictions || [];
      
      // Actualizar productos únicos
      predictions.forEach(prediction => {
        allProducts.add(prediction.nombre);
        totalConfidence += prediction.confianza;
        totalPredictionItems++;
      });
      
      // Actualizar estadísticas de la sucursal
      if (!branchesMap.has(branch)) {
        branchesMap.set(branch, {
          name: branch,
          predictionsCount: 0,
          lastUpdate: timestamp,
          totalConfidence: 0,
          predictionsItems: 0,
          products: {},
        });
      }
      
      const branchData = branchesMap.get(branch);
      
      // Actualizar contador de predicciones
      branchData.predictionsCount++;
      
      // Actualizar última actualización si es más reciente
      if (new Date(timestamp) > new Date(branchData.lastUpdate)) {
        branchData.lastUpdate = timestamp;
      }
      
      // Agregar productos y confianza
      predictions.forEach(prediction => {
        branchData.totalConfidence += prediction.confianza;
        branchData.predictionsItems++;
        
        if (!branchData.products[prediction.nombre]) {
          branchData.products[prediction.nombre] = {
            count: 0,
            totalQuantity: 0,
            totalConfidence: 0,
          };
        }
        
        branchData.products[prediction.nombre].count++;
        branchData.products[prediction.nombre].totalQuantity += prediction.cantidad;
        branchData.products[prediction.nombre].totalConfidence += prediction.confianza;
      });
    });
    
    // Convertir el mapa a un array de estadísticas por sucursal
    const branchStatsArray: BranchStats[] = Array.from(branchesMap.values()).map(branchData => {
      // Obtener los 5 productos más populares
      const topProducts = Object.entries(branchData.products)
        .map(([name, data]: [string, any]) => ({
          name,
          quantity: Math.round(data.totalQuantity / data.count),
          confidence: data.totalConfidence / data.count
        }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
      
      return {
        name: branchData.name,
        predictionsCount: branchData.predictionsCount,
        lastUpdate: branchData.lastUpdate,
        averageConfidence: branchData.predictionsItems > 0 
          ? branchData.totalConfidence / branchData.predictionsItems 
          : 0,
        topProducts
      };
    });
    
    // Ordenar estadísticas
    branchStatsArray.sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    
    setBranchStats(branchStatsArray);
    
    // Actualizar estadísticas totales
    setTotalStats({
      predictions: filteredData.length,
      branches: branchesMap.size,
      products: allProducts.size,
      averageConfidence: totalPredictionItems > 0 ? totalConfidence / totalPredictionItems : 0,
    });
  };

  const filterHistoricalData = () => {
    let filtered = [...historicalData];
    
    // Filtrar por sucursal
    if (selectedBranch !== "all") {
      filtered = filtered.filter(item => item.branch === selectedBranch);
    }
    
    // Filtrar por fecha
    if (dateFilter === "this-month") {
      const now = new Date();
      const firstDay = startOfMonth(now);
      const lastDay = endOfMonth(now);
      
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= firstDay && itemDate <= lastDay;
      });
    } else if (dateFilter === "last-week") {
      const now = new Date();
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); // Lunes de la semana pasada
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); // Domingo de la semana pasada

      filtered = filtered.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= lastWeekStart && itemDate <= lastWeekEnd;
      });
    } else if (dateFilter === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);  // Set to end of day
      
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= start && itemDate <= end;
      });
    }
    
    // Ordenar resultados
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        case "date-asc":
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        case "branch":
          return a.branch.localeCompare(b.branch);
        case "products":
          return (b.predictions?.length || 0) - (a.predictions?.length || 0);
        default:
          return 0;
      }
    });
    
    return filtered;
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 80) return "text-green-600 dark:text-green-400";
    if (confidence >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const isTodayPrediction = (date: string) => {
    const predictionDate = new Date(date);
    const today = new Date();
    return isSameDay(predictionDate, today);
  };

  const getFilteredFeedbackData = () => {
    return feedbackData.filter(data => {
      // Filter by branch/sucursal
      if (filterSucursal && data.sucursal !== filterSucursal) {
        return false;
      }
      
      // Filter by date/fecha
      if (filterFecha && data.fecha !== filterFecha) {
        return false;
      }
      
      // Filter by product name
      if (filterProducto) {
        const lowercaseFilter = filterProducto.toLowerCase();
        // Check if any product in feedback matches the filter
        const hasMatchingProduct = data.feedback.some(item => 
          item.producto && item.producto.toLowerCase().includes(lowercaseFilter)
        );
        if (!hasMatchingProduct) {
          return false;
        }
      }
      
      return true;
    }).map(data => {
      // If filtering by product, also filter the feedback array
      if (filterProducto) {
        const lowercaseFilter = filterProducto.toLowerCase();
        return {
          ...data,
          feedback: data.feedback.filter(item => 
            item.producto && item.producto.toLowerCase().includes(lowercaseFilter)
          )
        };
      }
      return data;
    });
  };

  const loadFeedbackData = async () => {
    try {
      console.log("Cargando feedback desde MongoDB...");
      const response = await fetch('/api/feedback');
      
      if (!response.ok) {
        throw new Error(`Error al cargar feedback: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.feedback)) {
        console.log(`${data.feedback.length} feedbacks cargados desde MongoDB`);
        
        // Agrupar feedback por sucursal, fecha y predictionId
        const groupedData: FeedbackData[] = [];
        const feedbackMap = new Map<string, Map<string, Map<string, FeedbackProduct[]>>>();
        
        data.feedback.forEach((item: FeedbackProduct) => {
          // Extract values safely
          const sucursal = item.sucursal || 'unknown';
          const fecha = item.fecha || 'unknown';
          const predictionId = item.predictionId || fecha; // Use fecha as fallback for old data
          
          // Create nested maps if they don't exist
          if (!feedbackMap.has(sucursal)) {
            feedbackMap.set(sucursal, new Map<string, Map<string, FeedbackProduct[]>>());
          }
          
          const sucursalMap = feedbackMap.get(sucursal)!;
          
          if (!sucursalMap.has(fecha)) {
            sucursalMap.set(fecha, new Map<string, FeedbackProduct[]>());
          }
          
          const fechaMap = sucursalMap.get(fecha)!;
          
          if (!fechaMap.has(predictionId)) {
            fechaMap.set(predictionId, []);
          }
          
          fechaMap.get(predictionId)!.push(item);
        });
        
        // Convert map to array structure
        feedbackMap.forEach((fechaMaps, sucursal) => {
          fechaMaps.forEach((predictionMaps, fecha) => {
            predictionMaps.forEach((feedback, predictionId) => {
              groupedData.push({
                sucursal,
                fecha,
                predictionId,
                feedback
              });
            });
          });
        });
        
        setFeedbackData(groupedData);
        console.log("Datos de feedback cargados correctamente:", groupedData);
      } else {
        console.log("No se encontró feedback en la base de datos");
        setFeedbackData([]);
        setUniqueSucursales([]);
        setUniqueFechas([]);
      }
    } catch (err) {
      console.error("Error al cargar el feedback:", err);
      setError("Error al cargar el feedback");
    }
  };

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };
  
  const togglePredictionGroupExpansion = (groupId: string) => {
    setExpandedPredictionGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Add a function to group predictions by date
  const groupPredictionsByDate = () => {
    const filteredData = filterHistoricalData();
    const groupedByDate: Record<string, HistoricalPrediction[]> = {};
    
    filteredData.forEach(prediction => {
      const date = format(new Date(prediction.timestamp), "yyyy-MM-dd");
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push(prediction);
    });
    
    return Object.entries(groupedByDate)
      .map(([date, predictions]) => ({
        date,
        formattedDate: format(new Date(date), "dd/MM/yyyy"),
        predictions
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const viewPredictionDetails = (branch: string, date: string) => {
    // Get the timestamp from the selected prediction
    const prediction = historicalData.find(item => 
      item.branch === branch && item.date === date
    );
    
    if (prediction) {
      console.log("Found prediction with timestamp:", prediction.timestamp);
      // Use Next.js router instead of window.location.href
      const encodedBranch = encodeURIComponent(branch);
      const encodedTimestamp = encodeURIComponent(prediction.timestamp);
      router.push(`/sucursal/historical?id=${encodedBranch}&timestamp=${encodedTimestamp}`);
    } else {
      console.log("No specific prediction found for", branch, date);
      // Use router.push instead of window.location.href
      router.push(`/sucursal/historical?id=${encodeURIComponent(branch)}`);
    }
  };

  // Add logout handler function
  const handleLogout = () => {
    clearCurrentUser();
    router.push('/login');
  };

  const filteredData = filterHistoricalData();
  const groupedPredictions = groupPredictionsByDate();

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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel Avanzado</h1>
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
                  href="/" 
                  className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-2"
                >
                  ← Volver al inicio
                </Link>
                <button
                  onClick={handleLogout}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
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
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Estadísticas Generales */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Resumen General</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-100 dark:border-purple-900/50">
                    <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">Total Predicciones</h3>
                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{totalStats.predictions}</p>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900/50">
                    <h3 className="text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Sucursales</h3>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{totalStats.branches}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-900/50">
                    <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Productos Únicos</h3>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{totalStats.products}</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-100 dark:border-green-900/50">
                    <h3 className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">Confianza Promedio</h3>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {totalStats.averageConfidence.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Navigation Tabs */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex -mb-px">
                  <button
                    onClick={() => setActiveTab('predictions')}
                    className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                      activeTab === 'predictions'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Predicciones
                  </button>
                  <button
                    onClick={() => setActiveTab('feedback')}
                    className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                      activeTab === 'feedback'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Feedback
                  </button>
                  <button
                    onClick={() => setActiveTab('userActivity')}
                    className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                      activeTab === 'userActivity'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Actividad de Usuarios
                  </button>
                </nav>
              </div>
              
              <div className="p-6">
                {activeTab === 'predictions' && (
                  <div className="space-y-8">
                    {/* Estadísticas por Sucursal */}
                    <div className="space-y-6">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Estadísticas por Sucursal</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {branchStats.map((branch) => (
                          <div 
                            key={branch.name}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden"
                          >
                            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                              <div className="flex justify-between items-center">
                                <h3 className="font-semibold text-gray-900 dark:text-white">{branch.name}</h3>
                                <Link
                                  href={`/sucursal/${encodeURIComponent(branch.name)}`}
                                  className="text-sm text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                                >
                                  Ver detalle
                                </Link>
                              </div>
                            </div>
                            
                            <div className="p-4">
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Predicciones</p>
                                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{branch.predictionsCount}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Confianza Promedio</p>
                                  <p className={`text-lg font-semibold ${getConfidenceClass(branch.averageConfidence)}`}>
                                    {branch.averageConfidence.toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                              
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Top Productos</p>
                              {branch.topProducts.length > 0 ? (
                                <ul className="text-sm space-y-1">
                                  {branch.topProducts.map((product, index) => (
                                    <li key={index} className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800">
                                      <span className="text-gray-800 dark:text-gray-200 truncate" style={{ maxWidth: '170px' }}>
                                        {product.name}
                                      </span>
                                      <span className={`${getConfidenceClass(product.confidence)}`}>
                                        {product.confidence.toFixed(1)}%
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No hay productos disponibles</p>
                              )}
                              
                              <div className="mt-4 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                                Última actualización: {format(new Date(branch.lastUpdate), "dd/MM/yyyy HH:mm")}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {branchStats.length === 0 && (
                        <p className="text-center py-4 text-gray-500 dark:text-gray-400">
                          No hay datos estadísticos disponibles para los filtros seleccionados.
                        </p>
                      )}
                    </div>
                    
                    {/* Historial detallado */}
                    <div className="space-y-6">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Historial de Predicciones</h2>
                      <div className="space-y-2">
                        {groupedPredictions.length > 0 ? (
                          <div className="space-y-2">
                            {groupedPredictions.map((group, index) => {
                              const groupId = `prediction-date-${group.date}-${index}`;
                              const isExpanded = !!expandedPredictionGroups[groupId];
                              const totalPredictions = group.predictions.reduce((acc, curr) => acc + (curr.predictions?.length || 0), 0);
                              
                              return (
                                <div key={groupId} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                  {/* Clickable header */}
                                  <div 
                                    className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50"
                                    onClick={() => togglePredictionGroupExpansion(groupId)}
                                  >
                                    <h3 className="text-md font-semibold text-gray-900 dark:text-white flex items-center">
                                      <svg 
                                        className={`h-5 w-5 mr-1.5 transition-transform ${isExpanded ? 'transform rotate-90' : ''}`}
                                        xmlns="http://www.w3.org/2000/svg" 
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                      >
                                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                      </svg>
                                      Fecha: {group.formattedDate} ({group.predictions.length} {group.predictions.length === 1 ? 'predicción' : 'predicciones'})
                                    </h3>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 py-0.5 px-2 rounded-full">
                                      {totalPredictions} {totalPredictions === 1 ? 'producto' : 'productos'} predichos
                                    </span>
                                  </div>
                                  
                                  {/* Expandable content */}
                                  {isExpanded && (
                                    <div className="border-t border-gray-200 dark:border-gray-700">
                                      {group.predictions.map((prediction, predIndex) => {
                                        // Calculate average confidence
                                        const predictions = prediction.predictions || [];
                                        let totalConfidence = 0;
                                        predictions.forEach(p => {
                                          totalConfidence += p.confianza;
                                        });
                                        const avgConfidence = predictions.length > 0 ? totalConfidence / predictions.length : 0;
                                        
                                        return (
                                          <div key={`${prediction.branch}-${prediction.timestamp}-${predIndex}`} 
                                               className="p-4 hover:bg-gray-100 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                                            <div className="flex flex-wrap justify-between items-center mb-3">
                                              <div className="mr-4">
                                                <h4 className="font-medium text-gray-900 dark:text-white">{prediction.branch}</h4>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                  {format(new Date(prediction.timestamp), "dd/MM/yyyy HH:mm:ss")}
                                                </p>
                                              </div>
                                              <div className="flex items-center">
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
                                                  Confianza promedio: 
                                                </span>
                                                <span className={`text-sm font-medium ${getConfidenceClass(avgConfidence)}`}>
                                                  {avgConfidence.toFixed(1)}%
                                                </span>
                                              </div>
                                            </div>
                                            
                                            <div className="flex flex-wrap justify-between">
                                              <div>
                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                  Productos: {predictions.length}
                                                </span>
                                                {prediction.recommendations && (
                                                  <span className="ml-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                                                    Recomendaciones: {prediction.recommendations.length}
                                                  </span>
                                                )}
                                              </div>
                                              <button
                                                onClick={() => viewPredictionDetails(prediction.branch, prediction.date)}
                                                className="text-sm text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                                              >
                                                Ver detalles completos
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No hay predicciones</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              No se encontraron predicciones que coincidan con los filtros aplicados.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {activeTab === 'feedback' && (
                  <div className="space-y-6">
                    {/* Filtros y controles */}
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Filtros de Feedback</h2>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Filtro por sucursal */}
                        <div>
                          <label htmlFor="filterSucursal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Sucursal
                          </label>
                          <select
                            id="filterSucursal"
                            value={filterSucursal}
                            onChange={(e) => setFilterSucursal(e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                          >
                            <option value="">Todas las sucursales</option>
                            {uniqueSucursales.map((sucursal) => (
                              <option key={sucursal} value={sucursal}>{sucursal}</option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Filtro por fecha */}
                        <div>
                          <label htmlFor="filterFecha" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Fecha
                          </label>
                          <select
                            id="filterFecha"
                            value={filterFecha}
                            onChange={(e) => setFilterFecha(e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                          >
                            <option value="">Todas las fechas</option>
                            {uniqueFechas.map((fecha) => (
                              <option key={fecha} value={fecha}>{fecha}</option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Filtro por producto */}
                        <div>
                          <label htmlFor="filterProducto" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Producto
                          </label>
                          <input
                            type="text"
                            id="filterProducto"
                            value={filterProducto}
                            onChange={(e) => setFilterProducto(e.target.value)}
                            placeholder="Filtrar por nombre de producto"
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                          />
                        </div>
                      </div>
                      
                      {/* Clear filters button */}
                      {(filterSucursal || filterFecha || filterProducto) && (
                        <div className="mt-3">
                          <button
                            onClick={() => {
                              setFilterSucursal('');
                              setFilterFecha('');
                              setFilterProducto('');
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                          >
                            Limpiar todos los filtros
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Tabla de Observaciones */}
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Feedback por Sucursal y Fecha</h2>
                      {/* Filter summary and stats */}
                      <div className="mt-2 mb-6 text-sm text-gray-500 dark:text-gray-400">
                        {(() => {
                          const filteredData = getFilteredFeedbackData();
                          const totalObservations = filteredData.reduce((acc, curr) => acc + curr.feedback.length, 0);
                          
                          return (
                            <div>
                              <p>
                                {filteredData.length} {filteredData.length === 1 ? 'grupo' : 'grupos'} de feedback con {totalObservations} {totalObservations === 1 ? 'observación' : 'observaciones'}
                                {(filterSucursal || filterFecha || filterProducto) ? " coinciden con los filtros aplicados" : ""}
                              </p>
                              {(filterSucursal || filterFecha || filterProducto) && (
                                <div className="mt-1">
                                  <span className="font-medium">Filtros activos:</span>
                                  {filterSucursal && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Sucursal: {filterSucursal}</span>}
                                  {filterFecha && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Fecha: {filterFecha}</span>}
                                  {filterProducto && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">Producto: {filterProducto}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      
                      {/* List of feedback groups */}
                      <div className="space-y-2">
                        {getFilteredFeedbackData().length > 0 ? (
                          getFilteredFeedbackData().map((data, index) => {
                            const groupId = `${data.sucursal}-${data.fecha}-${index}`;
                            const isExpanded = !!expandedGroups[groupId];
                            
                            return (
                              <div key={index} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                {/* Clickable header */}
                                <div 
                                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50"
                                  onClick={() => toggleGroupExpansion(groupId)}
                                >
                                  <h3 className="text-md font-semibold text-gray-900 dark:text-white flex items-center">
                                    <svg 
                                      className={`h-5 w-5 mr-1.5 transition-transform ${isExpanded ? 'transform rotate-90' : ''}`}
                                      xmlns="http://www.w3.org/2000/svg" 
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                    </svg>
                                    Sucursal: {data.sucursal} - Fecha: {data.fecha}
                                  </h3>
                                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 py-0.5 px-2 rounded-full">
                                    {data.feedback.length} {data.feedback.length === 1 ? 'observación' : 'observaciones'}
                                  </span>
                                </div>
                                
                                {/* Expandable content */}
                                {isExpanded && (
                                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                    <ObservationsTable observations={data.feedback} />
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-8">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M9 16h.01M15 16h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No hay feedback disponible</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              {feedbackData.length > 0 
                                ? "No se encontraron datos que coincidan con los filtros seleccionados." 
                                : "No hay feedback disponible en el sistema."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {activeTab === 'userActivity' && (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Análisis de Actividad de Usuarios</h2>
                    <UserActivityStats showAll={true} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-16 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Sistema de Predicción de Requerimienos Candy Mart © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}