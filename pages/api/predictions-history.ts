import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

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
  const { branch, date } = req.query;

  try {
    console.log('[API] Llamada a predictions-history con método:', method);
    const { db } = await connectToDatabase();
    const historyCollection = 'predictions_history';

    // GET - Fetch prediction details for a specific branch and date
    if (method === 'GET' && branch && date) {
      const prediction = await db.collection(historyCollection).findOne({ branch, date });
      if (!prediction) {
        return res.status(404).json({
          success: false,
          message: 'No se encontraron detalles para la predicción seleccionada.',
        });
      }
      return res.status(200).json({
        success: true,
        prediction,
      });
    }

    // GET - Obtener historial de predicciones
    if (method === 'GET') {
      const { branch } = req.query;
      let query = {};
      
      // Si se especifica una sucursal, filtrar por ella
      if (branch && typeof branch === 'string') {
        query = { branch };
        console.log('[API] Filtrando predicciones por sucursal:', branch);
      }
      
      // Verificar que la colección existe
      const collections = await db.listCollections({ name: historyCollection }).toArray();
      if (collections.length === 0) {
        console.log('[API] La colección predictions_history no existe');
        // Intentar buscar también en colecciones individuales de sucursales
        const allCollections = await db.listCollections().toArray();
        const predictionCollections = allCollections
          .filter((col: any) => col.name.startsWith('predictions_') && col.name !== 'predictions_history')
          .map((col: any) => col.name);
        
        if (predictionCollections.length > 0) {
          console.log('[API] Encontradas colecciones de predicciones individuales:', predictionCollections);
          
          // Combinar datos de todas las colecciones de predicciones
          let allPredictions: any[] = [];
          for (const colName of predictionCollections) {
            const branchPredictions = await db.collection(colName).find({}).toArray();
            
            // Normalizar los datos y asignar el nombre de sucursal correcto basado en el nombre de la colección
            const normalizedPredictions = branchPredictions.map((item: any) => 
              normalizePredictionData(item, colName)
            );
            
            allPredictions = [...allPredictions, ...normalizedPredictions];
          }
          
          console.log(`[API] Recuperadas ${allPredictions.length} predicciones de colecciones individuales`);
          
          // Si se especificó una sucursal, filtrar los resultados
          let filteredPredictions = allPredictions;
          if (branch && typeof branch === 'string') {
            filteredPredictions = allPredictions.filter((pred: any) => 
              pred.branch.toLowerCase() === branch.toLowerCase()
            );
            console.log(`[API] Filtrado a ${filteredPredictions.length} predicciones para sucursal: ${branch}`);
          }
          
          return res.status(200).json({
            success: true,
            history: filteredPredictions
          });
        } else {
          console.log('[API] No se encontraron colecciones de predicciones');
          return res.status(200).json({
            success: true,
            history: []
          });
        }
      }
      
      // Consultar la colección principal de historial
      console.log('[API] Consultando colección predictions_history con filtro:', query);
      const history = await db
        .collection(historyCollection)
        .find(query)
        .sort({ timestamp: -1 })
        .toArray();
      
      // Normalizar los datos
      const normalizedHistory = history.map((item: any) => normalizePredictionData(item));
      
      console.log(`[API] Encontradas ${normalizedHistory.length} predicciones en historial`);
      
      return res.status(200).json({
        success: true,
        history: normalizedHistory
      });
    }
    
    // POST - Guardar una nueva predicción
    if (method === 'POST') {
      const { branch, date, predictions, recommendations, timestamp, resultados } = req.body;
      
      if (!branch || !predictions || !timestamp) {
        console.log('[API] Error: Faltan campos requeridos en la solicitud POST');
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
      
      console.log(`[API] Guardando predicción para sucursal: ${branch}, fecha: ${document.date}`);
      
      // Asegurar que la colección existe
      try {
        await db.createCollection(historyCollection);
        console.log(`[API] Colección ${historyCollection} creada exitosamente`);
      } catch (e) {
        // La colección ya existe, lo cual está bien
        console.log(`[API] La colección ${historyCollection} ya existe`);
      }
      
      const result = await db.collection(historyCollection).insertOne(document);
      
      if (result.acknowledged) {
        console.log(`[API] Predicción guardada con ID: ${result.insertedId}`);
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
    console.log(`[API] Método no permitido: ${method}`);
    return res.status(405).json({
      success: false,
      message: 'Método no permitido'
    });
    
  } catch (error) {
    console.error('[API] Error en API de historial de predicciones:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}
