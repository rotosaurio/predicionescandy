// Prediction types

export interface Prediction {
  nombre: string;
  cantidad: number;
  confianza: number;
  nivel_confianza?: string;
}

export interface Recommendation {
  nombre: string;
  cantidad_sugerida: number;
  confianza: number;
  tipo: string;
  motivo?: string;
  // Campos adicionales según lo indicado por la API
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

export interface PredictionResult {
  fecha: string;
  sucursal: string;
  predicciones: Prediction[];
}

export interface RecommendationResult {
  recomendaciones: Recommendation[];
}

export interface ProductoDuplicado {
  nombre: string;
  prediction: Prediction;
  recommendation: Recommendation;
  analysis?: {
    confidenceDifference: number;
    quantityDifference: number;
    recommendationLevel: number;
    suggestedAction: string;
  };
}

// History types
export interface HistoricalPrediction {
  _id?: string;
  timestamp: string;
  branch: string;
  date: string;
  predictions: Prediction[];
  recommendations?: Recommendation[];
}

export interface ComparisonState {
  first: HistoricalPrediction | null;
  second: HistoricalPrediction | null;
}

// View modes
export type ViewMode = 'current' | 'history' | 'compare';

// API response types
export interface ApiError {
  success: false;
  message: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
