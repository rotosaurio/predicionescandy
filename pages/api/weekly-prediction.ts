import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { startDate, branchId, top_n = 20, num_muestras = 10, modo = 'avanzado' } = req.body;

    if (!startDate || !branchId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Fecha de inicio y sucursal son requeridos' 
      });
    }

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
          const response = await axios.post(`${API_BASE_URL}/api/predecir`, {
            fecha: dateStr,
            sucursal: branchId,
            top_n,
            num_muestras,
            modo,
            incluir_recomendaciones: true
          });
          
          return {
            fecha: dateStr,
            success: true,
            predicciones: response.data.predicciones || [],
            recomendaciones: response.data.recomendaciones || []
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
    
    return res.status(200).json({
      success: true,
      weekStart: startDate,
      sucursal: branchId,
      predictions,
      summary: {
        totalDays: predictions.length,
        successfulPredictions: predictions.filter(p => p.success).length,
        totalProducts: predictions.reduce((sum, day) => 
          sum + (day.success ? day.predicciones.length : 0), 0)
      }
    });
    
  } catch (error) {
    console.error('Error generating weekly predictions:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al generar predicciones semanales',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
