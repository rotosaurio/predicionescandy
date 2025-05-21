// Prediction types

export interface Prediction {
  producto: string;
  nombre: string;
  cantidad: number;
  confianza: number;
  nivel_confianza?: string;
  ordenado?: boolean;
  razon_no_ordenado?: NoOrdenadoRazon;
  comentario_no_ordenado?: string;
  articulo_id?: string;
}

export type NoOrdenadoRazon = "hay_en_tienda" | "no_hay_en_cedis" | "otro";

export interface OrderFeedback {
  predictionId?: string;  // Add this field to link to specific prediction
  producto: string;
  cantidad: number;
  sucursal: string;
  fecha: string;
  ordenado: boolean;
  razon_no_ordenado?: NoOrdenadoRazon;
  comentario?: string;
  fecha_feedback: string;
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

// Flexible product type for feedback that supports both Prediction and CommonProduct
export interface FeedbackProduct {
  producto: string; // Ensure this field is included
  cantidad?: number;
  cantidadPredicha?: number;
  confianza?: number;
  confianzaPrediccion?: number;
  ordenado?: boolean;
  razon_no_ordenado?: NoOrdenadoRazon;
  comentario_no_ordenado?: string;
  sucursal?: string;
  fecha?: string;
  comentario?: string; // Ensure this field is included
  predictionId?: string;  // Add this field to link to specific prediction
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

// Activity tracking interfaces
export interface UserActivityEvent {
  _id?: string;
  timestamp: Date;
  eventType: 'login' | 'logout' | 'interaction' | 'page_view';
  details?: string;
  page?: string;
  idleTime?: number;
}

export interface UserActivitySession {
  _id?: string;
  userId: string;
  username: string;
  branch?: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  events: UserActivityEvent[];
  totalActiveTime: number;
  totalIdleTime: number;
  interactionCount: number;
  lastPage?: string;
}

// Add this new interface for daily sessions
export interface UserDailySession {
  _id?: string;
  userId: string;
  username: string;
  branch?: string;
  sessionDate: string;
  startTime: Date;
  endTime?: Date;
  sessionIds: string[];
  events: UserActivityEvent[];
  totalActiveTime: number;
  totalIdleTime: number;
  interactionCount: number;
  lastUpdated: Date;
}

export interface UserActivityStats {
  userId: string;
  username: string;
  branch?: string;
  totalSessions: number; // Now represents days of activity
  totalActiveTime: number;
  totalIdleTime: number;
  totalInteractions: number;
  averageSessionDuration: number; // Average duration per day
  averageActiveTimePerSession: number; // Average active time per day
  lastActive: Date;
  mostVisitedPages: Array<{page: string, count: number}>;
}
