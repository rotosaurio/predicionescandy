import { useState, useCallback } from 'react';
import { useAppStore } from '../utils/store';
import { 
  getPredictions as apiGetPredictions, 
  getBranches as apiGetBranches,
  getSystemStatus as apiGetSystemStatus 
} from '../utils/api';
import { formatDateForAPI } from '../utils/helpers';
import { HistoricalPrediction } from '../types/models';

const usePredictionApi = () => {
  const [localLoading, setLocalLoading] = useState<boolean>(false);
  
  const {
    setLoading,
    setError,
    selectedBranch,
    selectedDate,
    topN,
    setPredictionResult,
    setRecommendations,
    setSystemStatus,
    setBranches,
    addToHistoricalData,
    updateStats
  } = useAppStore();
  
  // Check system status
  const checkSystemStatus = useCallback(async () => {
    try {
      const result = await apiGetSystemStatus();
      
      if (result.success && result.data) {
        setSystemStatus(result.data.estado === "online" ? "online" : "offline");
        return result.data.estado === "online";
      } else {
        setSystemStatus("offline");
        console.error("Error checking system status:", result.error);
        return false;
      }
    } catch (err) {
      setSystemStatus("offline");
      console.error("Failed to check system status:", err);
      return false;
    }
  }, [setSystemStatus]);
  
  // Fetch branches
  const fetchBranches = useCallback(async () => {
    setLocalLoading(true);
    
    try {
      const result = await apiGetBranches();
      
      if (result.success && result.data && Array.isArray(result.data.sucursales)) {
        setBranches(result.data.sucursales);
        setLocalLoading(false);
        return result.data.sucursales;
      } else {
        setError("Could not load branches. Please try again.");
        setLocalLoading(false);
        return [];
      }
    } catch (err) {
      setError("Failed to fetch branches. Please check your connection.");
      console.error("Error fetching branches:", err);
      setLocalLoading(false);
      return [];
    }
  }, [setBranches, setError]);
  
  // Request predictions
  const requestPredictions = useCallback(async () => {
    if (!selectedBranch || !selectedDate) {
      setError("Please select branch and date");
      return false;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Ensure system is online before proceeding
      const isOnline = await checkSystemStatus();
      if (!isOnline) {
        setError("System is offline. Please try again later.");
        setLoading(false);
        return false;
      }
      
      // Make the API request
      const result = await apiGetPredictions(selectedBranch, selectedDate, topN);
      
      if (result.success && result.data) {
        const data = result.data;
        
        // Update prediction results
        if (data.predicciones) {
          setPredictionResult({
            fecha: selectedDate,
            sucursal: selectedBranch,
            predicciones: data.predicciones
          });
        } else {
          setPredictionResult(null);
        }
        
        // Update recommendations
        if (data.recomendaciones) {
          setRecommendations({
            recomendaciones: data.recomendaciones
          });
        } else {
          setRecommendations(null);
        }
        
        // Save to history
        const historyItem: HistoricalPrediction = {
          timestamp: new Date().toISOString(),
          branch: selectedBranch,
          date: selectedDate,
          predictions: data.predicciones || [],
          recommendations: data.recomendaciones || []
        };
        
        addToHistoricalData(historyItem);
        
        // Update dashboard stats
        updateStats();
        
        setLoading(false);
        return true;
      } else {
        setError(`Failed to fetch predictions: ${result.error}`);
        setLoading(false);
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`An error occurred: ${errorMessage}`);
      console.error("Error requesting predictions:", err);
      setLoading(false);
      return false;
    }
  }, [
    selectedBranch, 
    selectedDate, 
    topN, 
    checkSystemStatus, 
    setLoading, 
    setError,
    setPredictionResult,
    setRecommendations,
    addToHistoricalData,
    updateStats
  ]);
  
  return {
    checkSystemStatus,
    fetchBranches,
    requestPredictions,
    loading: localLoading
  };
};

export default usePredictionApi;
