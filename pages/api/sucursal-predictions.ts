import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { ObjectId } from 'mongodb';

// Función para normalizar el nombre de la sucursal para búsqueda
function normalizeBranchNameForSearch(branch: string): string[] {
  const sanitized = branch.trim().toLowerCase();
  
  // Generar variaciones del nombre para intentar coincidir con diferentes formatos
  return [
    sanitized,
    sanitized.replace(/\s+/g, '_'),
    sanitized.replace(/\s*-\s*/g, '_'),
    sanitized.replace(/[\s-]+/g, '_')
  ];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Método no permitido. Solo se admite GET.' });
  }

  try {
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, message: 'Se requiere un ID de sucursal válido.' });
    }

    console.log(`[API Sucursal] Buscando predicciones para sucursal: ${id}`);
    const { db } = await connectToDatabase();
    
    // Generar posibles nombres de colección basados en el ID proporcionado
    const possibleNames = normalizeBranchNameForSearch(id);
    const possibleCollections = {
      daily: possibleNames.map(name => `predictions_${name}`),
      weekly: possibleNames.map(name => `weekly_predictions_${name}`)
    };
    
    console.log(`[API Sucursal] Posibles colecciones diarias a buscar: ${possibleCollections.daily.join(', ')}`);
    console.log(`[API Sucursal] Posibles colecciones semanales a buscar: ${possibleCollections.weekly.join(', ')}`);
    
    // Buscar todas las colecciones que comiencen con 'predictions_' o 'weekly_predictions_'
    const allCollections = await db.listCollections().toArray();
    const predictionCollections = allCollections
      .filter((col: any) => col.name.startsWith('predictions_') && col.name !== 'predictions_history')
      .map((col: any) => col.name);
    
    const weeklyPredictionCollections = allCollections
      .filter((col: any) => col.name.startsWith('weekly_predictions_'))
      .map((col: any) => col.name);
    
    console.log(`[API Sucursal] Encontradas ${predictionCollections.length} colecciones diarias y ${weeklyPredictionCollections.length} colecciones semanales`);
    
    // Primero intentar encontrar predicciones semanales
    let weeklyCollectionName = '';
    for (const possible of possibleCollections.weekly) {
      if (weeklyPredictionCollections.includes(possible)) {
        weeklyCollectionName = possible;
        console.log(`[API Sucursal] Colección semanal encontrada: ${weeklyCollectionName}`);
        break;
      }
    }
    
    // Si no encontramos una coincidencia exacta en semanales, buscar colecciones que puedan contener el nombre
    if (!weeklyCollectionName && weeklyPredictionCollections.length > 0) {
      console.log(`[API Sucursal] No se encontró coincidencia exacta en semanales, buscando colecciones que contengan el nombre`);
      const sanitizedId = id.trim().toLowerCase();
      
      for (const collection of weeklyPredictionCollections) {
        // Extraer el nombre de la sucursal de la colección (quitar 'weekly_predictions_')
        const branchPart = collection.substring(19);
        
        // Si el nombre de la colección contiene el ID buscado o viceversa
        if (branchPart.includes(sanitizedId) || sanitizedId.includes(branchPart)) {
          weeklyCollectionName = collection;
          console.log(`[API Sucursal] Se encontró colección semanal parcial: ${weeklyCollectionName}`);
          break;
        }
      }
    }
    
    // Buscar también en predicciones diarias
    let dailyCollectionName = '';
    for (const possible of possibleCollections.daily) {
      if (predictionCollections.includes(possible)) {
        dailyCollectionName = possible;
        console.log(`[API Sucursal] Colección diaria encontrada: ${dailyCollectionName}`);
        break;
      }
    }
    
    // Si no encontramos una coincidencia exacta en diarias, buscar colecciones que puedan contener el nombre
    if (!dailyCollectionName && predictionCollections.length > 0) {
      console.log(`[API Sucursal] No se encontró coincidencia exacta en diarias, buscando colecciones que contengan el nombre`);
      const sanitizedId = id.trim().toLowerCase();
      
      for (const collection of predictionCollections) {
        // Extraer el nombre de la sucursal de la colección (quitar 'predictions_')
        const branchPart = collection.substring(12);
        
        // Si el nombre de la colección contiene el ID buscado o viceversa
        if (branchPart.includes(sanitizedId) || sanitizedId.includes(branchPart)) {
          dailyCollectionName = collection;
          console.log(`[API Sucursal] Se encontró colección diaria parcial: ${dailyCollectionName}`);
          break;
        }
      }
    }
    
    if (!weeklyCollectionName && !dailyCollectionName) {
      return res.status(404).json({ 
        success: false, 
        message: 'No hay predicciones disponibles para esta sucursal.' 
      });
    }
    
    // Intentar primero obtener la predicción semanal por ser más completa
    if (weeklyCollectionName) {
      const weeklyPrediction = await db.collection(weeklyCollectionName)
        .find({})
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();
      
      if (weeklyPrediction.length > 0) {
        // Extraer el nombre real de la sucursal del documento (en caso de que esté almacenado)
        const branchName = weeklyPrediction[0].branch || id;
        
        return res.status(200).json({
          success: true,
          branch: branchName,
          isWeeklyPrediction: true,
          dateRange: weeklyPrediction[0].dateRange,
          prediction: {
            timestamp: weeklyPrediction[0].timestamp,
            date: weeklyPrediction[0].dateRange?.start || weeklyPrediction[0].date,
            predictions: weeklyPrediction[0].predictions || []
          },
          recommendations: {
            timestamp: weeklyPrediction[0].timestamp,
            recommendations: weeklyPrediction[0].recommendations || []
          },
          lastUpdate: weeklyPrediction[0].timestamp,
          message: "Se están mostrando las predicciones consolidadas para toda la semana"
        });
      }
    }
    
    // Si no hay predicciones semanales, intentar con las diarias
    if (dailyCollectionName) {
      // Obtener la última predicción disponible
      const lastPrediction = await db.collection(dailyCollectionName)
        .find({})
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();
      
      if (lastPrediction.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No se encontraron predicciones para esta sucursal.'
        });
      }
      
      // Extraer el nombre real de la sucursal del documento (en caso de que esté almacenado)
      const branchName = lastPrediction[0].branch || id;
      
      // Buscar recomendaciones correspondientes
      // Extraer el identificador de la colección de predicciones para usarlo en recomendaciones
      const collectionIdentifier = dailyCollectionName.substring(12); // quitar 'predictions_'
      const recommendationCollectionName = `recommendations_${collectionIdentifier}`;
      let recommendations = [];
      
      const recommendationCollections = await db.listCollections({ name: recommendationCollectionName }).toArray();
      
      if (recommendationCollections.length > 0) {
        recommendations = await db.collection(recommendationCollectionName)
          .find({ timestamp: lastPrediction[0].timestamp })
          .toArray();
          
        // Si no hay recomendaciones con el mismo timestamp, obtener las más recientes
        if (recommendations.length === 0) {
          recommendations = await db.collection(recommendationCollectionName)
            .find({})
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray();
        }
      }
      
      return res.status(200).json({
        success: true,
        branch: branchName,
        prediction: lastPrediction[0],
        recommendation: recommendations.length > 0 ? recommendations[0] : null,
        lastUpdate: lastPrediction[0].timestamp,
        isWeeklyPrediction: false,
        message: "Se están mostrando las predicciones diarias"
      });
    }
    
    // Si llegamos aquí es que hubo algún problema en la búsqueda
    return res.status(404).json({
      success: false,
      message: 'No se encontraron predicciones para esta sucursal.'
    });
    
  } catch (error) {
    console.error('Error al obtener predicciones de sucursal:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al obtener predicciones.' 
    });
  }
} 