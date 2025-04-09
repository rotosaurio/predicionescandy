/**
 * Utilidad para hacer peticiones fetch con retry automático
 */

// Define specific response types for API endpoints
export interface PredictionResult {
  predicciones: Array<{
    articulo_id: number;
    nombre_articulo: string;
    cantidad: number;
    probabilidad?: number;
  }>;
  recomendaciones?: Array<{
    articulo_id: number;
    nombre_articulo: string;
    probabilidad: number;
  }>;
}

export interface BranchesResult {
  sucursales: Array<{
    id: string;
    nombre: string;
  }>;
}

export interface SystemStatusResult {
  estado: string;
  version?: string;
  model_info?: {
    last_trained?: string;
    accuracy?: number;
  };
}

export interface FetchWithRetryOptions extends RequestInit {
  maxRetries?: number;
  retryDelay?: number;
  timeoutMs?: number;
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    retryDelay = 1500,
    timeoutMs = 30000,
    ...fetchOptions
  } = options;

  let attempt = 0;
  
  const executeRequest = async (): Promise<Response> => {
    try {
      console.log(`Fetch attempt ${attempt + 1}/${maxRetries + 1} to ${url}`);
      
      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      
      return response;
    } catch (error) {
      attempt++;
      
      console.error(`Fetch attempt ${attempt} failed:`, error);
      
      if (attempt <= maxRetries) {
        const delayMs = retryDelay * attempt;
        console.log(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return executeRequest();
      }
      
      throw error;
    }
  };
  
  return executeRequest();
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

export async function apiRequest<T>(
  endpoint: string, 
  options: FetchWithRetryOptions = {}
): Promise<T> {
  try {
    // If we're using our proxy, add a leading slash
    const url = endpoint.startsWith('http') ? endpoint : `/api/${endpoint}`;
    
    const response = await fetchWithRetry(url, options);
    const data = await response.json();
    
    return data as T;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

export async function getPredictions(
  branch: string,
  date: string,
  topN: number = 100
): Promise<PredictionResult> {
  // Format date from YYYY-MM-DD to DD/MM/YYYY
  const [year, month, day] = date.split("-");
  const formattedDate = `${day}/${month}/${year}`;
  
  return apiRequest<PredictionResult>('proxy?endpoint=predecir', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fecha: formattedDate,
      sucursal: branch,
      top_n: topN,
      modo: "avanzado",
      num_muestras: 15,
      incluir_recomendaciones: true
    }),
  });
}

export async function getBranches(): Promise<BranchesResult> {
  return apiRequest<BranchesResult>('proxy?endpoint=sucursales');
}

export async function getSystemStatus(): Promise<SystemStatusResult> {
  return apiRequest<SystemStatusResult>('proxy?endpoint=estado');
}

/**
 * Generates predictions for an entire week starting from the given date
 * @param startDate Starting date for the week in DD/MM/YYYY format
 * @param branchId ID of the branch/store
 * @param options Additional prediction options
 */
export async function predictWeek(
  startDate: string,
  branchId: string,
  options: {
    top_n?: number;
    num_muestras?: number;
    modo?: string;
  } = {}
): Promise<{
  weekStart: string;
  sucursal: string;
  predictions: Array<{
    fecha: string;
    success: boolean;
    predicciones?: any[];
    recomendaciones?: any[];
    error?: string;
  }>;
  summary: {
    totalDays: number;
    successfulPredictions: number;
  };
}> {
  // Convert DD/MM/YYYY to Date object
  const [day, month, year] = startDate.split('/').map(Number);
  const baseDate = new Date(year, month - 1, day);
  
  // Generate array of 7 days starting from the base date
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
  });
  
  // Make prediction requests for each date
  const predictions = await Promise.all(
    weekDates.map(async (dateStr) => {
      try {
        // Fix: Use correct parameters for the API request
        const response = await apiRequest<PredictionResult>('proxy?endpoint=predecir', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fecha: dateStr,
            sucursal: branchId,
            top_n: options.top_n || 20,
            num_muestras: options.num_muestras || 10,
            modo: options.modo || 'avanzado',
            incluir_recomendaciones: true
          })
        });
        
        return {
          fecha: dateStr,
          success: true,
          predicciones: response.predicciones || [],
          recomendaciones: response.recomendaciones || []
        };
      } catch (error) {
        console.error(`Error predicting for ${dateStr}:`, error);
        return {
          fecha: dateStr,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    })
  );
  
  return {
    weekStart: startDate,
    sucursal: branchId,
    predictions,
    summary: {
      totalDays: predictions.length,
      successfulPredictions: predictions.filter(p => p.success).length
    }
  };
}

/**
 * Fetch available branches/stores from the API
 */
export async function fetchBranches(): Promise<Array<{ id: string; nombre: string }>> {
  try {
    const response = await apiRequest<BranchesResult>('proxy?endpoint=sucursales');
    return response.sucursales || [];
  } catch (error) {
    console.error('Error fetching branches:', error);
    return [];
  }
}
