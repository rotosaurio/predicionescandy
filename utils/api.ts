/**
 * Utilidad para hacer peticiones fetch con retry automático
 */

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
): Promise<ApiResponse<T>> {
  try {
    // If we're using our proxy, add a leading slash
    const url = endpoint.startsWith('http') ? endpoint : `/api/${endpoint}`;
    
    const response = await fetchWithRetry(url, options);
    const data = await response.json();
    
    return {
      data: data as T,
      success: true
    };
  } catch (error) {
    console.error('API request failed:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    };
  }
}

export async function getPredictions(
  branch: string,
  date: string,
  topN: number = 100
): Promise<ApiResponse<any>> {
  // Format date from YYYY-MM-DD to DD/MM/YYYY
  const [year, month, day] = date.split("-");
  const formattedDate = `${day}/${month}/${year}`;
  
  return apiRequest('proxy?endpoint=predecir', {
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

export async function getBranches(): Promise<ApiResponse<{ sucursales: string[] }>> {
  return apiRequest('proxy?endpoint=sucursales');
}

export async function getSystemStatus(): Promise<ApiResponse<{ estado: string }>> {
  return apiRequest('proxy?endpoint=estado');
}
