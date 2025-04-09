interface SystemStatus {
  estado: string;
  gpu: string;
  cuda_version: string | null;
  gpu_name: string | null;
  memoria_total: string;
  memoria_disponible: string;
  uso_memoria: string;
  modelo_cargado: boolean;
  tipo_modelo: string;
}

// Get the base API URL depending on environment
const getApiBaseUrl = () => {
  // In production, use relative URL or environment variable
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Use the exact URL that's working in the logs
  return 'https://rotosaurio-candymodel.hf.space';
};

export const checkSystemStatus = async (): Promise<SystemStatus> => {
  try {
    const baseUrl = getApiBaseUrl();
    console.log(`Fetching system status from: ${baseUrl}/api/estado`);
    
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    
    const response = await fetch(`${baseUrl}/api/estado?nocache=${timestamp}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      // Add this to bypass any potential caching by the browser
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`Error fetching system status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('System status response:', JSON.stringify(data));
    
    // Add extra validation and normalize the estado value
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid system status response: not an object');
    }
    
    if (!('estado' in data)) {
      throw new Error('Invalid system status response: missing estado property');
    }
    
    // Normalize the estado field to handle potential case differences or whitespace
    const normalizedData = {
      ...data,
      estado: data.estado.trim().toLowerCase()
    };
    
    console.log('Normalized system status:', normalizedData);
    return normalizedData as SystemStatus;
  } catch (err) {
    console.error('Error checking system status:', err);
    // Return inactive status on error
    return { 
      estado: 'inactivo',
      gpu: 'no disponible',
      cuda_version: null,
      gpu_name: null,
      memoria_total: 'N/A',
      memoria_disponible: 'N/A',
      uso_memoria: 'N/A',
      modelo_cargado: false,
      tipo_modelo: 'N/A'
    };
  }
};

// Helper to determine if system is active with more detailed logging
export const isSystemActive = (status: SystemStatus | null): boolean => {
  console.log('Checking if system is active with status:', status);
  
  // If status is null or undefined, system is not active
  if (!status) {
    console.log('System status is null or undefined, returning inactive');
    return false;
  }
  
  // Debug logging to see the exact estado value
  console.log('System estado value:', status.estado);
  
  // Check if the status is explicitly "activo" (normalized to lowercase)
  const isActive = status.estado === 'activo';
  console.log('Is system active?', isActive);
  
  return isActive;
};

export const interpretSystemStatus = (statusData: any): "activo" | "offline" => {
  console.log("API Response:", statusData); // Verifica la respuesta de la API
  return statusData?.estado === "activo" ? "activo" : "offline";
};
