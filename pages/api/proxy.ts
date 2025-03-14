import { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: '12mb',
  },
}

// API configuration
const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo permitir métodos POST y GET
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    console.log(`Proxying ${req.method} request to Hugging Face`);
    
    // Obtener el endpoint que se quiere llamar
    const endpoint = req.query.endpoint as string;
    
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'Missing endpoint parameter' });
    }
    
    const url = `${API_BASE_URL}/api/${endpoint}`;
    console.log(`Target URL: ${url}`);
    
    // Preparar opciones para fetch
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    // Si es POST, incluir el body
    if (req.method === 'POST' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }
    
    console.log(`Request options:`, {
      method: fetchOptions.method,
      bodyLength: fetchOptions.body ? (fetchOptions.body as string).length : 0
    });
    
    // Hacer la petición a la API externa
    const response = await fetch(url, fetchOptions);
    console.log(`Response status:`, response.status);
    
    if (endpoint === 'estado') {
      // Manejo especial para el endpoint 'estado'
      try {
        const data = await response.json();
        console.log("Estado API response:", data);
        
        // Consideramos que el sistema está online si la respuesta fue exitosa,
        // incluso si la GPU no está disponible
        const isOnline = response.ok || data.branches > 0 || data.model_loaded === "Yes";
        
        return res.status(200).json({
          success: true,
          estado: isOnline ? "online" : "offline",
          originalResponse: data,
          message: isOnline 
            ? "API is operational (even without GPU)" 
            : "API is not operational"
        });
      } catch (err) {
        return res.status(200).json({
          success: false,
          estado: "offline",
          message: "Failed to parse API response"
        });
      }
    } else {
      // Procesamiento normal para otros endpoints
      const data = await response.json();
      
      // Responder con los datos recibidos
      return res.status(response.status).json(data);
    }
    
  } catch (error) {
    console.error('Error in API proxy:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error in API proxy', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}
