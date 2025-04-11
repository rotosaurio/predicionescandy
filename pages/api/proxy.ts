import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

// Use consistent API base URL across all files
const API_BASE_URL = 'http://0.0.0.0:8000';

// Map of frontend endpoint names to actual API endpoints
const ENDPOINT_MAP: Record<string, string> = {
  // Dataset endpoints
  'datasets': '/api/datasets',
  'delete_dataset': '/api/delete_dataset',
  'upload_dataset': '/api/upload-dataset',
  'dataset_details': '/api/dataset', // Will be appended with /{id} in the handler
  'datasets_info': '/api/datasets/info', // New endpoint for dataset directory info
  
  // Training endpoints
  'training-status': '/api/training-status',
  'retrain-model': '/api/retrain-model',
  'retrain-incremental': '/api/retrain-incremental',
  'retrain-automatic': '/api/retrain-automatic', // New automatic retraining endpoint
  'reentrenar': '/api/reentrenar',
  
  // Prediction endpoints
  'predecir': '/api/predecir',
  'recomendaciones': '/api/recomendaciones',
  'predict_week': '/api/predecir', // We'll implement week prediction in our code
  
  // System endpoints
  'estado': '/api/estado',
  'sucursales': '/api/sucursales',
  'config': '/config',
  'info': '/info',
  
  // Order endpoints
  'registrar_pedido': '/api/registrar_pedido',
  'registrar_pedidos_batch': '/api/registrar_pedidos_batch',
  
  // Predictions History endpoint
  'predictions-history': '/api/predictions-history',
  
  // Auto Predictions endpoint
  'auto-predictions': '/api/auto-predictions'
};

// List of endpoints that should accept POST requests
const POST_ALLOWED_ENDPOINTS = [
  'predecir', 
  'upload_dataset',
  'delete_dataset',
  'registrar_pedido',
  'registrar_pedidos_batch',
  'retrain-model',
  'retrain-incremental',
  'retrain-automatic',
  'auto-predictions',
  'predictions-history'
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get the endpoint from query params
    const { endpoint } = req.query;
    
    if (!endpoint || typeof endpoint !== 'string' || !ENDPOINT_MAP[endpoint]) {
      return res.status(400).json({ success: false, message: 'Invalid or missing endpoint parameter' });
    }

    // Check if the method is allowed for this endpoint
    if (req.method === 'POST' && !POST_ALLOWED_ENDPOINTS.includes(endpoint)) {
      return res.status(405).json({ success: false, message: 'Method not allowed for this endpoint' });
    }
    
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Only GET and POST methods are allowed' });
    }
    
    // Construct the final URL
    const apiUrl = `${API_BASE_URL}${ENDPOINT_MAP[endpoint]}`;
    
    console.log(`Proxying request to: ${apiUrl}`);
    
    // Special logging for retrain-model endpoint
    if (endpoint === 'retrain-model') {
      console.log('Retrain model request body:', req.body);
    }
    
    // Make the request to the API
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    // Include body for POST requests
    if (req.method === 'POST' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
      
      // Special logging for retrain-model endpoint
      if (endpoint === 'retrain-model') {
        console.log('Serialized request body:', fetchOptions.body);
      }
    }
    
    const apiResponse = await fetch(apiUrl, fetchOptions);
    
    // Get the data and status code
    let data;
    try {
      data = await apiResponse.json();
    } catch (e) {
      console.error('Error parsing JSON response:', e);
      data = { error: 'Invalid JSON response' };
    }
    
    const statusCode = apiResponse.status;
    
    // Special logging for retrain-model endpoint errors
    if (endpoint === 'retrain-model' && statusCode >= 400) {
      console.error('Retrain model error response:', {
        statusCode,
        data
      });
    }
    
    // Save the original response for reference
    const responseWithOriginal = {
      ...data,
      originalResponse: data,
      statusCode,
    };
    
    // Return the response with the same status code
    return res.status(statusCode).json(responseWithOriginal);
    
  } catch (error) {
    console.error('API proxy error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error connecting to backend API',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
