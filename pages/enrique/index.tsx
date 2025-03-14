import Image from "next/image";
import localFont from "next/font/local";
import { useState, useEffect } from "react";
import { format, parseISO, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import Link from "next/link";
import ObservationsTable from '../../components/ObservationsTable';
import { FeedbackProduct } from '../../types/models';

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
}

export default function AdvancedPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalPrediction[]>([]);
  const [systemStatus, setSystemStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "this-month" | "custom">("all");
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

  useEffect(() => {
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
        
        // Agrupar feedback por sucursal y fecha
        const groupedData: FeedbackData[] = [];
        const feedbackMap = new Map<string, Map<string, FeedbackProduct[]>>();
        data.feedback.forEach((item: FeedbackProduct) => {
          const sucursal = item.sucursal || "Desconocida";
          const fecha = item.fecha || "Desconocida";
          if (!feedbackMap.has(sucursal)) {
            feedbackMap.set(sucursal, new Map<string, FeedbackProduct[]>());
          }
          const sucursalMap = feedbackMap.get(sucursal)!;
          if (!sucursalMap.has(fecha)) {
            sucursalMap.set(fecha, []);
          }
          sucursalMap.get(fecha)!.push(item);
        });
        feedbackMap.forEach((fechaMap, sucursal) => {
          fechaMap.forEach((feedback, fecha) => {
            groupedData.push({ sucursal, fecha, feedback });
          });
        });
        setFeedbackData(groupedData);
        console.log("Datos de feedback cargados correctamente:", groupedData);
      } else {
        console.log("No se encontró feedback en la base de datos");
        setFeedbackData([]);
      }
    } catch (err) {
      console.error("Error al cargar el feedback:", err);
      setError("Error al cargar el feedback");
    }
  };

  const filteredData = filterHistoricalData();

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
            
            {/* Filtros y controles */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Filtros</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="branch" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Sucursal
                    </label>
                    <select
                      id="branch"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500"
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                    >
                      <option value="all">Todas las Sucursales</option>
                      {branches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="dateFilter" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Periodo
                    </label>
                    <select
                      id="dateFilter"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as any)}
                    >
                      <option value="all">Todo el historial</option>
                      <option value="this-month">Mes actual</option>
                      <option value="custom">Periodo personalizado</option>
                    </select>
                  </div>
                  
                  {dateFilter === "custom" && (
                    <>
                      <div>
                        <label htmlFor="startDate" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          Fecha inicio
                        </label>
                        <input
                          id="startDate"
                          type="date"
                          className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="endDate" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          Fecha fin
                        </label>
                        <input
                          id="endDate"
                          type="date"
                          className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  
                  <div>
                    <label htmlFor="sortBy" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Ordenar por
                    </label>
                    <select
                      id="sortBy"
                      className="w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                    >
                      <option value="date-desc">Fecha (más reciente)</option>
                      <option value="date-asc">Fecha (más antigua)</option>
                      <option value="branch">Sucursal (A-Z)</option>
                      <option value="products">Número de productos</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Estadísticas por Sucursal */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Estadísticas por Sucursal</h2>
              </div>
              <div className="p-6">
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
            </div>
            
            {/* Historial detallado */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Historial de Predicciones</h2>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Mostrando {filteredData.length} de {historicalData.length} predicciones
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sucursal</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Productos</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recomendaciones</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Confianza Promedio</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredData.map((item, index) => {
                      // Calcular confianza promedio
                      const predictions = item.predictions || [];
                      let totalConfidence = 0;
                      predictions.forEach(prediction => {
                        totalConfidence += prediction.confianza;
                      });
                      const avgConfidence = predictions.length > 0 ? totalConfidence / predictions.length : 0;
                      
                      return (
                        <tr key={`${item.branch}-${item.timestamp}-${index}`} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                          isTodayPrediction(item.timestamp) ? 'bg-purple-50 dark:bg-purple-900/10' : ''
                        }`}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            <div>{format(new Date(item.timestamp), "dd/MM/yyyy")}</div>
                            <div className="text-xs opacity-70">{format(new Date(item.timestamp), "HH:mm:ss")}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                            {item.branch}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {predictions.length}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {item.recommendations?.length || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <span className={getConfidenceClass(avgConfidence)}>
                              {avgConfidence.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <Link
                              href={`/sucursal/${encodeURIComponent(item.branch)}`}
                              className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                            >
                              Ver predicción
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {filteredData.length === 0 && (
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

            {/* Tabla de Observaciones */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Feedback por Sucursal y Fecha</h2>
              </div>
              <div className="p-6">
                {feedbackData.length > 0 ? (
                  feedbackData.map((data, index) => (
                    <div key={index} className="mb-8">
                      <h3 className="text-md font-semibold text-gray-900 dark:text-white">
                        Sucursal: {data.sucursal} - Fecha: {data.fecha}
                      </h3>
                      <ObservationsTable observations={data.feedback} />
                    </div>
                  ))
                ) : (
                  <p className="text-center py-4 text-gray-500 dark:text-gray-400">
                    No hay feedback disponible.
                  </p>
                )}
              </div>
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