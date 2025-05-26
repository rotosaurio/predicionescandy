import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

// Sistema de logs para API
function logApi(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [PREDICTIONS-HISTORY-API] [${level}]`;
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// Función para convertir el nombre de colección a nombre de sucursal
function collectionNameToBranchName(collectionName: string): string {
  if (!collectionName.startsWith('predictions_')) {
    return collectionName;
  }
  
  // Extraer el nombre sin el prefijo 'predictions_'
  const branchId = collectionName.substring(12);
  
  // Reemplazar guiones bajos por espacios y capitalizar cada palabra
  return branchId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/ - /g, ' - '); // Mantener formato para guiones
}

// Función para normalizar los datos de predicción
function normalizePredictionData(item: any, collectionName?: string): any {
  // Determinar el nombre de la sucursal
  let branchName = item.branch || item.sucursal;
  
  // Si no tiene nombre de sucursal y viene de una colección específica
  if (!branchName && collectionName) {
    branchName = collectionNameToBranchName(collectionName);
  }
  
  // Normalizar los datos
  return {
    _id: item._id || null,
    timestamp: item.timestamp,
    branch: branchName || "Desconocida",
    date: item.date || item.fecha || new Date(item.timestamp).toISOString().split('T')[0],
    predictions: item.predictions || item.predicciones || [],
    recommendations: item.recommendations || item.recomendaciones || []
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { branch, date, limit = '10' } = req.query;
  const recordLimit = parseInt(limit as string, 10) || 10;

  try {
    logApi('INFO', `Petición recibida: ${method}`, { 
      params: { branch, date, limit },
      headers: {
        'user-agent': req.headers['user-agent']
      }
    });
    
    const { db } = await connectToDatabase();
    const historyCollection = 'predictions_history';

    // GET - Fetch prediction details for a specific branch and date
    if (method === 'GET' && branch && date) {
      logApi('INFO', `Consultando predicción específica`, { branch, date });
      
      const prediction = await db.collection(historyCollection).findOne({ branch, date });
      if (!prediction) {
        logApi('WARN', `No se encontraron detalles para la predicción seleccionada`, { branch, date });
        return res.status(404).json({
          success: false,
          message: 'No se encontraron detalles para la predicción seleccionada.',
        });
      }
      
      logApi('INFO', `Predicción encontrada`, { id: prediction._id });
      return res.status(200).json({
        success: true,
        prediction,
      });
    }

    // GET - Obtener historial de predicciones (limitado)
    if (method === 'GET') {
      let query = {};
      
      // Si se especifica una sucursal, filtrar por ella
      if (branch && typeof branch === 'string') {
        query = { branch };
        logApi('INFO', `Filtrando predicciones por sucursal`, { branch, limit: recordLimit });
      } else {
        logApi('INFO', `Consultando todas las predicciones`, { limit: recordLimit });
      }
      
      // Verificar que la colección existe
      const collections = await db.listCollections({ name: historyCollection }).toArray();
      if (collections.length === 0) {
        logApi('WARN', `La colección predictions_history no existe`);
        
        // Intentar buscar también en colecciones individuales de sucursales
        const allCollections = await db.listCollections().toArray();
        const predictionCollections = allCollections
          .filter((col: any) => col.name.startsWith('predictions_') && col.name !== 'predictions_history')
          .map((col: any) => col.name);
        
        if (predictionCollections.length > 0) {
          logApi('INFO', `Encontradas colecciones de predicciones individuales`, { 
            count: predictionCollections.length,
            collections: predictionCollections
          });
          
          // Combinar datos de todas las colecciones de predicciones, limitando resultados
          let allPredictions: any[] = [];
          
          for (const colName of predictionCollections) {
            // Solo obtenemos las más recientes de cada colección
            const branchPredictions = await db.collection(colName)
              .find({})
              .sort({ timestamp: -1 })
              .limit(recordLimit)
              .toArray();
            
            // Normalizar los datos
            const normalizedPredictions = branchPredictions.map((item: any) => 
              normalizePredictionData(item, colName)
            );
            
            allPredictions = [...allPredictions, ...normalizedPredictions];
          }
          
          // Ordenar todas las predicciones por fecha (descendente) y limitar el total
          allPredictions.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          
          // Limitar al número total especificado
          allPredictions = allPredictions.slice(0, recordLimit);
          
          logApi('INFO', `Recuperadas predicciones de colecciones individuales`, { count: allPredictions.length });
          
          // Si se especificó una sucursal, filtrar los resultados
          let filteredPredictions = allPredictions;
          if (branch && typeof branch === 'string') {
            filteredPredictions = allPredictions.filter((pred: any) => 
              pred.branch.toLowerCase() === branch.toLowerCase()
            );
            logApi('INFO', `Filtrado para sucursal específica`, { 
              branch, 
              resultCount: filteredPredictions.length 
            });
          }
          
          return res.status(200).json({
            success: true,
            history: filteredPredictions
          });
        } else {
          logApi('WARN', `No se encontraron colecciones de predicciones`);
          return res.status(200).json({
            success: true,
            history: []
          });
        }
      }
      
      // Consultar la colección principal de historial
      logApi('INFO', `Consultando colección predictions_history`, { 
        filter: JSON.stringify(query),
        limit: recordLimit
      });
      
      const history = await db
        .collection(historyCollection)
        .find(query)
        .sort({ timestamp: -1 })
        .limit(recordLimit)
        .toArray();
      
      // Normalizar los datos
      const normalizedHistory = history.map((item: any) => normalizePredictionData(item));
      
      logApi('INFO', `Predicciones recuperadas exitosamente`, { count: normalizedHistory.length });
      
      return res.status(200).json({
        success: true,
        history: normalizedHistory
      });
    }
    
    // POST - Guardar una nueva predicción
    if (method === 'POST') {
      const { branch, date, predictions, recommendations, timestamp, resultados } = req.body;
      
      if (!branch || !predictions || !timestamp) {
        logApi('ERROR', `Faltan campos requeridos en la solicitud POST`, { 
          hasBranch: !!branch, 
          hasPredictions: !!predictions, 
          hasTimestamp: !!timestamp 
        });
        
        return res.status(400).json({
          success: false,
          message: 'Faltan campos requeridos (branch, predictions, timestamp)'
        });
      }
      
      const document = {
        branch,
        date: date || new Date().toISOString().split('T')[0],
        predictions,
        recommendations: recommendations || [],
        timestamp,
        resultados: resultados || []
      };
      
      logApi('INFO', `Guardando predicción`, { branch, date: document.date });
      
      // Asegurar que la colección existe
      try {
        await db.createCollection(historyCollection);
        logApi('INFO', `Colección creada exitosamente`, { collection: historyCollection });
      } catch (e) {
        // La colección ya existe, lo cual está bien
        logApi('INFO', `La colección ya existe`, { collection: historyCollection });
      }
      
      const result = await db.collection(historyCollection).insertOne(document);
      
      if (result.acknowledged) {
        logApi('INFO', `Predicción guardada exitosamente`, { id: result.insertedId });
        return res.status(201).json({
          success: true,
          message: 'Predicción guardada correctamente',
          id: result.insertedId
        });
      } else {
        throw new Error('Error al insertar en la base de datos');
      }
    }
    
    // Método no permitido
    logApi('WARN', `Método no permitido`, { method });
    return res.status(405).json({
      success: false,
      message: 'Método no permitido'
    });
    
  } catch (error) {
    logApi('ERROR', `Error en API de historial de predicciones`, error instanceof Error ? {
      message: error.message,
      stack: error.stack
    } : error);
    
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}
