import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { isValidRecordSetFormat, createRecordSet } from './recordset-helper';

const API_BASE_URL = 'http://0.0.0.0:8000';
const API_ENDPOINT = `${API_BASE_URL}/api/registrar_pedidos_batch`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    console.log('Registrando pedidos por lote...');
    const batchData = req.body;
    
    // Validate the batch data is in RecordSet format
    if (!isValidRecordSetFormat(batchData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Formato de datos inválido. Debe ser un objeto con una propiedad "RecordSet" que contenga un array de pedidos.' 
      });
    }
    
    // Check we have at least one order
    if (batchData.RecordSet.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se encontraron pedidos para registrar.' 
      });
    }
    
    console.log(`Registrando ${batchData.RecordSet.length} pedidos en lote...`);
    
    // Forward the request to the API
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batchData),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error from API:', errorText);
      return res.status(response.status).json({ 
        success: false, 
        message: `API error: ${response.statusText}`,
        details: errorText
      });
    }
    
    const data = await response.json();
    
    // Store the batch in MongoDB too
    try {
      const { db } = await connectToDatabase();
      if (db) {
        await db.collection('pedidos_batch').insertOne({
          timestamp: new Date().toISOString(),
          count: batchData.RecordSet.length,
          orders: batchData.RecordSet,
          api_response: data
        });
        console.log('Lote de pedidos guardado en base de datos local');
      }
    } catch (dbError) {
      console.error('Error al guardar en base de datos:', dbError);
      // Continue with the API response even if local DB storage fails
    }
    
    return res.status(200).json({
      success: true,
      message: `${batchData.RecordSet.length} pedidos registrados correctamente`,
      count: batchData.RecordSet.length,
      api_response: data
    });
    
  } catch (error) {
    console.error('Error registering batch orders:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al registrar los pedidos',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
