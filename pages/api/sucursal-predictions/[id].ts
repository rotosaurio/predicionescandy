import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient, ServerApiVersion } from 'mongodb';

const MONGODB_URI = 'mongodb+srv://candymarttest:0uGLqVvDsMCAVn5P@cluster0.mts9c.mongodb.net/';
const DB_NAME = 'inventory_predictions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, message: 'ID de sucursal no válido' });
  }

  const client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    
    const collectionName = `predictions_${id.toLowerCase().replace(/\s+/g, '_')}`;
    const collection = client.db(DB_NAME).collection(collectionName);

    // Obtener la última predicción
    const prediction = await collection
      .find()
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    await client.close();

    if (!prediction.length) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron predicciones para esta sucursal'
      });
    }

    return res.status(200).json({
      success: true,
      data: prediction[0]
    });

  } catch (error) {
    console.error('Error al obtener predicciones:', error);
    await client.close();
    return res.status(500).json({
      success: false,
      message: 'Error al obtener predicciones',
      error: error instanceof Error ? error.message : String(error)
    });
  }
} 