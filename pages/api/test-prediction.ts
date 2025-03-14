import { NextApiRequest, NextApiResponse } from 'next';

const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';
const API_ENDPOINTS = {
  PREDECIR: `${API_BASE_URL}/api/predecir`,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { fecha, sucursal, top_n, modo, num_muestras, incluir_recomendaciones } = req.body;
    
    // Validar parámetros requeridos
    if (!fecha || !sucursal) {
      return res.status(400).json({
        success: false,
        message: 'Los parámetros fecha y sucursal son requeridos'
      });
    }
    
    console.log('Realizando petición de prueba a API de predicciones...');
    console.log('Parámetros:', req.body);
    
    const requestBody = {
      fecha,
      sucursal,
      top_n: top_n || 10,
      modo: modo || "avanzado",
      num_muestras: num_muestras || 15,
      incluir_recomendaciones: incluir_recomendaciones !== undefined ? incluir_recomendaciones : true
    };
    
    const response = await fetch(API_ENDPOINTS.PREDECIR, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        success: false, 
        message: `API responded with status: ${response.status} - ${response.statusText}`
      });
    }

    const data = await response.json();
    
    const responseData = {
      success: true,
      message: 'Petición de prueba completada con éxito',
      predicciones: data.predicciones ? data.predicciones.slice(0, 3) : [], // Solo mostrar 3 para la prueba
      recomendaciones: data.recomendaciones ? data.recomendaciones.slice(0, 3) : [],
      totalPredicciones: data.predicciones ? data.predicciones.length : 0,
      totalRecomendaciones: data.recomendaciones ? data.recomendaciones.length : 0
    };
    
    return res.status(200).json(responseData);
    
  } catch (error) {
    console.error('Error testing prediction API:', error);
    
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
