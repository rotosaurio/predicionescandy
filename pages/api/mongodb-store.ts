import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient, ServerApiVersion } from 'mongodb';

// MongoDB configuration
const MONGODB_URI = 'mongodb+srv://candymarttest:0uGLqVvDsMCAVn5P@cluster0.mts9c.mongodb.net/';
const DB_NAME = 'inventory_predictions';
const COLLECTION_NAME = 'predictions';

interface MongoDBRequest {
  action: 'store' | 'retrieve' | 'listAll';
  branch?: string;
  date?: string;
  data?: any;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo permitir peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  try {
    const { action, branch, date, data }: MongoDBRequest = req.body;

    // Validar los campos requeridos según la acción
    if (action === 'store' && (!branch || !date || !data)) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos para almacenar: branch, date, data'
      });
    }

    if ((action === 'retrieve' || action === 'listAll') && (!branch)) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere el campo branch para recuperar datos'
      });
    }

    // Conectar a MongoDB
    const client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });

    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Procesar según la acción solicitada
    switch (action) {
      case 'store':
        // Añadir timestamp si no existe
        const timestamp = data.timestamp || new Date().toISOString();
        const documentToStore = {
          timestamp,
          branch,
          date,
          ...data
        };

        // Insertar en MongoDB
        const result = await collection.insertOne(documentToStore);
        await client.close();
        
        return res.status(200).json({
          success: true,
          message: 'Datos guardados correctamente',
          id: result.insertedId
        });

      case 'retrieve':
        // Recuperar predicciones específicas por sucursal y fecha
        const query = date ? { branch, date } : { branch };
        const documents = await collection.find(query).sort({ timestamp: -1 }).limit(1).toArray();
        await client.close();
        
        if (documents.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'No se encontraron predicciones para los criterios especificados'
          });
        }
        
        return res.status(200).json({
          success: true,
          data: documents[0]
        });

      case 'listAll':
        // Listar todas las predicciones para una sucursal
        const allDocuments = await collection.find({ branch }).sort({ timestamp: -1 }).toArray();
        await client.close();
        
        return res.status(200).json({
          success: true,
          data: allDocuments
        });

      default:
        await client.close();
        return res.status(400).json({
          success: false,
          message: 'Acción no válida. Opciones disponibles: store, retrieve, listAll'
        });
    }
  } catch (error) {
    console.error('Error en la API de MongoDB:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en el servidor al procesar la solicitud',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
