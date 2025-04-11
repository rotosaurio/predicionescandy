import { NextApiRequest, NextApiResponse } from 'next';

const API_BASE_URL = 'http://0.0.0.0:8000';
const API_ENDPOINTS = {
  ESTADO: `${API_BASE_URL}/api/estado`,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    console.log('Verificando estado de API externa...');
    
    const response = await fetch(API_ENDPOINTS.ESTADO, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(200).json({ 
        success: false, 
        status: 'offline',
        message: `API responded with status: ${response.status}`
      });
    }

    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      status: data.estado || 'unknown',
      message: 'API check completed successfully',
      rawResponse: data
    });
    
  } catch (error) {
    console.error('Error checking API status:', error);
    
    return res.status(200).json({
      success: false,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
