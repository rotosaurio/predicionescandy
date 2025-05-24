// Helper functions for the app

// Nuevo módulo centralizado de logs
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LoggerOptions {
  module: string;
  showTimestamp?: boolean;
}

class Logger {
  private module: string;
  private showTimestamp: boolean;
  
  constructor(options: LoggerOptions) {
    this.module = options.module;
    this.showTimestamp = options.showTimestamp !== false;
  }
  
  debug(message: string, data?: any): void {
    this.log('DEBUG', message, data);
  }
  
  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }
  
  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }
  
  error(message: string, data?: any): void {
    this.log('ERROR', message, data);
  }
  
  private log(level: LogLevel, message: string, data?: any): void {
    const timestamp = this.showTimestamp ? `[${new Date().toISOString()}]` : '';
    const prefix = `${timestamp} [${this.module}] [${level}]`;
    
    if (data !== undefined) {
      console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

export function createLogger(module: string): Logger {
  return new Logger({ module });
}

/**
 * Format date from YYYY-MM-DD to DD/MM/YYYY format for API requests
 */
export const formatDateForAPI = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

/**
 * Format date from DD/MM/YYYY to YYYY-MM-DD format
 */
export const formatDateFromAPI = (dateStr: string): string => {
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month}-${day}`;
};

/**
 * Calculate recommendation level from confidence percentage
 */
export const confidenceToLevel = (confianza: number): number => {
  if (confianza >= 90) return 5;       // 90-100% -> Level 5 (highest priority)
  if (confianza >= 80) return 4;       // 80-89% -> Level 4
  if (confianza >= 70) return 3;       // 70-79% -> Level 3
  if (confianza >= 60) return 2;       // 60-69% -> Level 2
  return 1;                           // <60% -> Level 1 (lowest priority)
};

/**
 * Convert confidence to CSS class
 */
export const confidenceToClass = (confianza: number): string => {
  if (confianza >= 80) return 'confidence-alta';
  if (confianza >= 60) return 'confidence-media';
  return 'confidence-baja';
};

/**
 * Export array data to CSV file
 */
export const exportToCSV = (filename: string, headers: string[], data: any[][]): void => {
  // Create CSV header
  let csvContent = headers.join(',') + '\n';
  
  // Add each row
  data.forEach(row => {
    csvContent += row.map(item => {
      // Wrap strings with quotes, especially if they contain commas
      if (typeof item === 'string' && (item.includes(',') || item.includes('"'))) {
        return `"${item.replace(/"/g, '""')}"`;
      }
      return item;
    }).join(',') + '\n';
  });
  
  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  // Set attributes and click to download
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Try to save data to localStorage with error handling
 */
export const saveToLocalStorage = (key: string, data: any): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`Failed to save to localStorage key "${key}":`, e);
    return false;
  }
};

/**
 * Try to load data from localStorage with error handling
 */
export const loadFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Failed to load from localStorage key "${key}":`, e);
    return defaultValue;
  }
};

/**
 * Get common products between predictions and recommendations with analysis
 */
export const getCommonProducts = (predictions: any[], recommendations: any[]): any[] => {
  const result: any[] = [];
  
  // Create maps for faster lookup
  const predMap = new Map(predictions.map(p => [p.nombre.toLowerCase(), p]));
  const recMap = new Map(recommendations.map(r => [r.nombre.toLowerCase(), r]));
  
  // Find common products
  for (const pred of predictions) {
    const predName = pred.nombre.toLowerCase();
    if (recMap.has(predName)) {
      const rec = recMap.get(predName)!;
      
      // Calculate differences
      const predQty = pred.cantidad;
      const recQty = rec.cantidad_sugerida;
      const difference = recQty - predQty;
      const percentDiff = predQty > 0 ? (difference / predQty) * 100 : 0;
      
      result.push({
        producto: pred.nombre,
        nombre: pred.nombre,
        cantidadPredicha: predQty,
        cantidadSugerida: recQty,
        cantidadPromedio: Math.round((predQty + recQty) / 2),
        confianzaPrediccion: pred.confianza,
        confianzaRecomendacion: rec.confianza,
        diferenciaCantidad: difference,
        porcentajeDiferencia: percentDiff,
        tipo: rec.tipo,
        motivo: rec.motivo,
        articulo_id: pred.articulo_id,
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
        // Feedback fields from prediction
        ordenado: pred.ordenado,
        razon_no_ordenado: pred.razon_no_ordenado,
        comentario_no_ordenado: pred.comentario_no_ordenado,
      });
    }
  }
  
  return result.sort((a, b) => a.nombre.localeCompare(b.nombre));
};
