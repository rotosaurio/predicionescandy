import { schedule } from 'node-cron';
import fetch from 'node-fetch';

interface AutoPredictionResult {
  success: boolean;
  results: Array<{
    sucursal: string;
    status: string;
    message: string;
    lastUpdate?: string;
    dateRange?: {
      start: string;
      end: string;
    };
  }>;
  errors: Array<{
    sucursal: string;
    error: string;
  }>;
  nextScheduledUpdate: string;
}

const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://tu-dominio.com'  // Reemplazar con tu dominio de producción
  : 'http://localhost:3000';

async function generatePredictions(): Promise<AutoPredictionResult> {
  try {
    console.log('Iniciando generación automática de predicciones...');
    
    const response = await fetch(`${API_URL}/api/auto-predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as AutoPredictionResult;
    
    console.log('Resultado de la generación automática:', result);
    
    if (result.errors && result.errors.length > 0) {
      console.error('Errores durante la generación:', result.errors);
    }
    
    return result;
  } catch (error) {
    console.error('Error en la generación automática:', error);
    throw error;
  }
}

// Programar la tarea para ejecutarse todos los lunes a las 8am
schedule('0 8 * * 1', async () => {
  console.log('Ejecutando tarea programada de predicciones...');
  try {
    await generatePredictions();
    console.log('Tarea programada completada exitosamente');
  } catch (error) {
    console.error('Error en la tarea programada:', error);
  }
});

// También verificar al inicio si se necesitan predicciones
generatePredictions().catch(console.error); 