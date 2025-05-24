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

// Sistema de logs mejorado con niveles de severidad
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const logger = {
  debug: (message: string, data?: any) => logWithLevel('DEBUG', message, data),
  info: (message: string, data?: any) => logWithLevel('INFO', message, data),
  warn: (message: string, data?: any) => logWithLevel('WARN', message, data),
  error: (message: string, data?: any) => logWithLevel('ERROR', message, data)
};

function logWithLevel(level: LogLevel, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [SYSTEM-STATUS] [${level}] ${message}`;
  
  if (data !== undefined) {
    console.log(formattedMessage, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(formattedMessage);
  }
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
    logger.info(`Consultando estado del sistema desde: ${baseUrl}/api/estado`);
    
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
      logger.error(`Error al consultar estado del sistema: código ${response.status}`);
      throw new Error(`Error fetching system status: ${response.status}`);
    }
    
    const data = await response.json();
    logger.debug('Respuesta del sistema:', data);
    
    // Add extra validation and normalize the estado value
    if (typeof data !== 'object' || data === null) {
      logger.error('Respuesta inválida del estado del sistema: no es un objeto');
      throw new Error('Invalid system status response: not an object');
    }
    
    if (!('estado' in data)) {
      logger.error('Respuesta inválida del estado del sistema: falta propiedad "estado"');
      throw new Error('Invalid system status response: missing estado property');
    }
    
    // Normalize the estado field to handle potential case differences or whitespace
    const normalizedData = {
      ...data,
      estado: data.estado.trim().toLowerCase()
    };
    
    logger.info('Estado del sistema normalizado:', normalizedData);
    return normalizedData as SystemStatus;
  } catch (err) {
    logger.error('Error al verificar estado del sistema:', err);
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
  logger.debug('Verificando si el sistema está activo con estado:', status);
  
  // If status is null or undefined, system is not active
  if (!status) {
    logger.warn('Estado del sistema es nulo o indefinido, retornando inactivo');
    return false;
  }
  
  // Debug logging to see the exact estado value
  logger.debug('Valor de estado del sistema:', status.estado);
  
  // Check if the status is explicitly "activo" (normalized to lowercase)
  const isActive = status.estado === 'activo';
  logger.info(`¿Está el sistema activo? ${isActive}`);
  
  return isActive;
};

export const interpretSystemStatus = (statusData: any): "activo" | "offline" => {
  logger.debug("Respuesta de API:", statusData);
  return statusData?.estado === "activo" ? "activo" : "offline";
};

// Exportar el logger para uso en otros módulos
export { logger as systemLogger };
