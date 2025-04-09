import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';
const API_ENDPOINT = `${API_BASE_URL}/api/predecir`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    console.log('Testing prediction API...');
    const predictionParams = req.body;
    
    // Forward the request to the prediction API
    const response = await axios.post(API_ENDPOINT, predictionParams);
    
    // Process and return the prediction results
    return res.status(200).json({
      predicciones: response.data.predicciones || [],
      totalPredicciones: response.data.predicciones?.length || 0,
      recomendaciones: response.data.recomendaciones || [],
      totalRecomendaciones: response.data.recomendaciones?.length || 0,
      success: true
    });
    
  } catch (error) {
    console.error('Error testing prediction:', error);
    
    // Get appropriate error details
    if (axios.isAxiosError(error) && error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: `API error: ${error.message}`,
        details: error.response.data
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error al generar predicciones',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
