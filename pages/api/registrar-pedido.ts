import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { isValidRecord, convertSingleRecordToRecordSet } from './recordset-helper';

const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';
const API_ENDPOINT = `${API_BASE_URL}/api/registrar_pedido`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    console.log('Registrando pedido individual...');
    const orderData = req.body;
    
    // Validate the order data
    if (!isValidRecord(orderData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Formato de pedido inválido. Debe incluir al menos los campos FECHA, ARTICULO_ID, NOMBRE_ARTICULO y CANTIDAD.' 
      });
    }
    
    // Convert to RecordSet format if necessary
    const recordSetData = orderData.RecordSet ? orderData : convertSingleRecordToRecordSet(orderData);
    
    // Forward the request to the API
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recordSetData),
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
    
    // Store the order in MongoDB too
    try {
      const { db } = await connectToDatabase();
      if (db) {
        await db.collection('pedidos').insertOne({
          ...orderData,
          timestamp: new Date().toISOString(),
          api_response: data
        });
        console.log('Pedido guardado en base de datos local');
      }
    } catch (dbError) {
      console.error('Error al guardar en base de datos:', dbError);
      // Continue with the API response even if local DB storage fails
    }
    
    return res.status(200).json({
      success: true,
      message: 'Pedido registrado correctamente',
      id: data.id || data.order_id || null,
      api_response: data
    });
    
  } catch (error) {
    console.error('Error registering order:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al registrar el pedido',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
