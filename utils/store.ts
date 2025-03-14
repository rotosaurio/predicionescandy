import { create } from 'zustand';
import { format } from 'date-fns';
import { Prediction, Recommendation, HistoricalPrediction } from '../types/models';

interface AppState {
  // System state
  systemStatus: 'online' | 'offline' | 'unknown';
  setSystemStatus: (status: 'online' | 'offline' | 'unknown') => void;
  
  // User selections
  selectedBranch: string;
  setSelectedBranch: (branch: string) => void;
  
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  
  topN: number;
  setTopN: (topN: number) => void;
  
  // Branches
  branches: string[];
  setBranches: (branches: string[]) => void;
  
  // Results
  predictionResult: {
    fecha: string;
    sucursal: string;
    predicciones: Prediction[];
  } | null;
  setPredictionResult: (result: { fecha: string; sucursal: string; predicciones: Prediction[] } | null) => void;
  
  recommendations: {
    recomendaciones: Recommendation[];
  } | null;
  setRecommendations: (recommendations: { recomendaciones: Recommendation[] } | null) => void;
  
  // Historical data
  historicalData: HistoricalPrediction[];
  setHistoricalData: (data: HistoricalPrediction[]) => void;
  addToHistoricalData: (item: HistoricalPrediction) => void;
  
  // Dashboard stats
  stats: {
    totalPredictions: number;
    totalRecommendations: number;
    avgConfidence: number;
    lastUpdated: string;
  };
  updateStats: () => void;
  
  // UI state
  loading: boolean;
  setLoading: (loading: boolean) => void;
  
  error: string | null;
  setError: (error: string | null) => void;
  
  viewMode: 'current' | 'history' | 'compare';
  setViewMode: (mode: 'current' | 'history' | 'compare') => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // System state
  systemStatus: 'unknown',
  setSystemStatus: (status) => set({ systemStatus: status }),
  
  // User selections
  selectedBranch: '',
  setSelectedBranch: (branch) => set({ selectedBranch: branch }),
  
  selectedDate: format(new Date(), "yyyy-MM-dd"),
  setSelectedDate: (date) => set({ selectedDate: date }),
  
  topN: 100,
  setTopN: (topN) => set({ topN }),
  
  // Branches
  branches: [],
  setBranches: (branches) => set({ branches }),
  
  // Results
  predictionResult: null,
  setPredictionResult: (result) => set({ predictionResult: result }),
  
  recommendations: null,
  setRecommendations: (recommendations) => set({ recommendations }),
  
  // Historical data
  historicalData: [],
  setHistoricalData: (data) => set({ historicalData: data }),
  addToHistoricalData: (item) => {
    const current = get().historicalData;
    set({ 
      historicalData: [item, ...current].slice(0, 50) // Keep only the most recent 50
    });
    
    // Save to localStorage as well
    try {
      localStorage.setItem('prediction_history', JSON.stringify([item, ...current].slice(0, 50)));
    } catch (e) {
      console.warn('Failed to save to localStorage', e);
    }
  },
  
  // Stats
  stats: {
    totalPredictions: 0,
    totalRecommendations: 0,
    avgConfidence: 0,
    lastUpdated: "-"
  },
  updateStats: () => {
    const { predictionResult, recommendations } = get();
    
    if (predictionResult) {
      const predictions = predictionResult.predicciones;
      const recs = recommendations?.recomendaciones || [];
      
      set({
        stats: {
          totalPredictions: predictions.length,
          totalRecommendations: recs.length,
          avgConfidence: predictions.length > 0 
            ? predictions.reduce((sum, p) => sum + p.confianza, 0) / predictions.length
            : 0,
          lastUpdated: format(new Date(), "yyyy-MM-dd HH:mm:ss")
        }
      });
    }
  },
  
  // UI state
  loading: false,
  setLoading: (loading) => set({ loading }),
  
  error: null,
  setError: (error) => set({ error }),
  
  viewMode: 'current',
  setViewMode: (mode) => set({ viewMode: mode }),
}));
