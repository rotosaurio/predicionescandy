import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { ObjectId } from 'mongodb';
import { format } from 'date-fns';

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

// Función helper para normalizar fechas
function getNormalizedDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  
  // Si la fecha ya está en formato YYYY-MM-DD, devolverla
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  
  // Si está en formato DD/MM/YYYY, convertirla
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  
  // Si no se pudo normalizar, devolver la original
  return dateStr;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Método no permitido. Solo se admite GET.' });
  }

  try {
    const { id, date } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, message: 'Se requiere un ID de sucursal válido.' });
    }

    console.log(`[API Sucursal] Buscando predicciones para sucursal: ${id}${date ? `, fecha: ${date}` : ''}`);
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
    
    // Fecha normalizada para búsqueda
    let searchDate: string | null = null;
    if (date && typeof date === 'string') {
      // Normalizar formato de fecha recibido
      searchDate = getNormalizedDate(date);
      console.log(`[API Sucursal] Buscando predicciones para fecha específica: ${searchDate}`);
    }

    // Obtener predicciones diarias
    if (dailyCollectionName) {
      // Usar formato ISO para la fecha actual
      const today = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
      
      console.log(`[API Sucursal] Buscando predicción diaria más reciente, fecha actual: ${today}`);
      
      // Construir el query para búsqueda
      const query: any = {};
      if (searchDate) {
        // Si se especificó una fecha, buscar por esa fecha exacta
        query.date = searchDate;
        console.log(`[API Sucursal] Buscando predicciones con fecha específica: ${searchDate}`);
      }
      
      // Obtener todas las predicciones y ordenarlas
      const allPredictions = await db.collection(dailyCollectionName)
        .find(query)
        .sort({ timestamp: -1 }) // Ordenar primero por timestamp descendente (más reciente primero)
        .limit(30)
        .toArray();
        
      if (allPredictions.length > 0) {
        // Normalizar las fechas para comparación
        const normalizedPredictions = allPredictions.map((p: any) => {
          const normalizedDate = getNormalizedDate(p.date);
          return { ...p, normalizedDate };
        });
        
        // Ordenar SOLO por timestamp (más reciente primero), sin considerar la fecha
        normalizedPredictions.sort((a: any, b: any) => {
          return b.timestamp.localeCompare(a.timestamp);
        });
        
        // Si buscamos una fecha específica y no la encontramos, devolver error
        if (searchDate && !normalizedPredictions.some((p: any) => p.normalizedDate === searchDate)) {
          return res.status(404).json({
            success: false,
            message: `No se encontraron predicciones para la fecha ${date} en esta sucursal.`
          });
        }
        
        // Seleccionar la predicción según criterios
        let selectedPrediction: any;
        if (searchDate) {
          // Si buscamos fecha específica, tomar la primera que coincida (la más reciente para esa fecha)
          selectedPrediction = normalizedPredictions.find((p: any) => p.normalizedDate === searchDate);
        } else {
          // Siempre tomar la predicción con el timestamp más reciente, independientemente de la fecha
          selectedPrediction = normalizedPredictions[0];
        }
        
        // Si es parte de una predicción multiday, obtener información sobre el rango
        const multiDayInfo = selectedPrediction.isPartOfMultiDayPrediction ? {
          isMultiDayPrediction: true,
          currentIndex: selectedPrediction.multiDayPredictionIndex,
          totalDays: selectedPrediction.totalDays,
          availableDates: normalizedPredictions
            .filter((p: any) => p.timestamp === selectedPrediction.timestamp)
            .sort((a: any, b: any) => a.multiDayPredictionIndex - b.multiDayPredictionIndex)
            .map((p: any) => ({
              date: p.normalizedDate,
              index: p.multiDayPredictionIndex
            }))
        } : null;
        
        let combinedPrediction = selectedPrediction;
        
        // Verificar si la predicción ya está combinada en la base de datos
        if (selectedPrediction.isMultiDayCombinedPrediction) {
          console.log(`[API Sucursal] La predicción seleccionada ya es una predicción combinada, usando directamente.`);
          // No hacemos nada adicional, ya que la predicción ya viene combinada
        }
        // Si es una predicción multiday pero no combinada, combinar todas las predicciones del mismo grupo
        else if (multiDayInfo && multiDayInfo.isMultiDayPrediction) {
          console.log(`[API Sucursal] Combinando predicciones de ${multiDayInfo.totalDays} días`);
          
          // Obtener todas las predicciones con el mismo timestamp
          const relatedPredictions = normalizedPredictions
            .filter((p: any) => p.timestamp === selectedPrediction.timestamp)
            .sort((a: any, b: any) => a.multiDayPredictionIndex - b.multiDayPredictionIndex);
          
          if (relatedPredictions.length > 1) {
            // Combinar todas las predicciones en una sola
            console.log(`[API Sucursal] Encontradas ${relatedPredictions.length} predicciones para combinar`);
            
            // Crear un mapa para eliminar duplicados por nombre de producto
            const uniqueProducts = new Map();
            
            // Procesar todas las predicciones y combinarlas
            relatedPredictions.forEach((pred: any, index: number) => {
              if (pred.predictions && Array.isArray(pred.predictions)) {
                pred.predictions.forEach((product: any) => {
                  // Si el producto no existe en el mapa o tiene mayor confianza, lo añadimos/actualizamos
                  if (!uniqueProducts.has(product.nombre.toLowerCase()) || 
                      product.confianza > uniqueProducts.get(product.nombre.toLowerCase()).confianza) {
                    uniqueProducts.set(product.nombre.toLowerCase(), {
                      ...product,
                      sourceDayIndex: index,
                      sourceDay: pred.normalizedDate
                    });
                  }
                });
              }
            });
            
            // Convertir el mapa a array
            const combinedProducts = Array.from(uniqueProducts.values());
            console.log(`[API Sucursal] Combinación finalizada: ${combinedProducts.length} productos únicos`);
            
            // Crear un nuevo objeto de predicción combinada
            combinedPrediction = {
              ...selectedPrediction,
              predictions: combinedProducts,
              isMultiDayCombinedPrediction: true,
              combinedDaysCount: relatedPredictions.length,
              dateRange: {
                start: relatedPredictions[0].normalizedDate,
                end: relatedPredictions[relatedPredictions.length - 1].normalizedDate
              },
              sourcePredictions: relatedPredictions.map((p: any) => ({
                date: p.normalizedDate,
                index: p.multiDayPredictionIndex,
                productsCount: p.predictions?.length || 0
              }))
            };
          }
        }
        
        // Guardar la predicción diaria encontrada
        const dailyPrediction = {
          ...combinedPrediction,
          date: combinedPrediction.normalizedDate || combinedPrediction.date,
          multiDayInfo: combinedPrediction.isMultiDayCombinedPrediction ? null : multiDayInfo
        };
        
        console.log(`[API Sucursal] Encontrada predicción diaria con fecha: ${dailyPrediction.date}, timestamp: ${dailyPrediction.timestamp}`);
        
        // Buscar recomendaciones correspondientes
        const collectionIdentifier = dailyCollectionName.substring(12); // quitar 'predictions_'
        const recommendationCollectionName = `recommendations_${collectionIdentifier}`;
        let recommendations = [];
        
        const recommendationCollections = await db.listCollections({ name: recommendationCollectionName }).toArray();
        
        if (recommendationCollections.length > 0) {
          // Si es una predicción multi-día combinada, buscar todas las recomendaciones correspondientes
          if (combinedPrediction.isMultiDayCombinedPrediction) {
            // Buscar las recomendaciones combinadas directamente con el mismo timestamp
            recommendations = await db.collection(recommendationCollectionName)
              .find({ 
                timestamp: combinedPrediction.timestamp,
                isMultiDayCombinedPrediction: true 
              })
              .toArray();
              
            if (recommendations.length > 0) {
              console.log(`[API Sucursal] Encontradas recomendaciones combinadas para el timestamp: ${combinedPrediction.timestamp}`);
              // Usamos directamente las recomendaciones combinadas sin procesamiento adicional
            } else {
              console.log(`[API Sucursal] No se encontraron recomendaciones combinadas, buscando por timestamp...`);
              // Si no encontramos recomendaciones combinadas, buscamos por timestamp
              recommendations = await db.collection(recommendationCollectionName)
                .find({ timestamp: combinedPrediction.timestamp })
                .toArray();
                
              if (recommendations.length > 0) {
                console.log(`[API Sucursal] Encontradas ${recommendations.length} recomendaciones para el timestamp: ${combinedPrediction.timestamp}`);
              }
            }
          } else {
            // Buscar recomendación con el mismo timestamp y fecha (caso normal)
            recommendations = await db.collection(recommendationCollectionName)
              .find({ 
                timestamp: dailyPrediction.timestamp,
                ...(searchDate ? { date: searchDate } : {})
              })
              .toArray();
          }
            
          // Si no hay recomendaciones con el criterio específico, obtener las más recientes
          if (recommendations.length === 0) {
            console.log(`[API Sucursal] No se encontraron recomendaciones para el timestamp específico, buscando las más recientes...`);
            recommendations = await db.collection(recommendationCollectionName)
              .find({})
              .sort({ timestamp: -1 })
              .limit(1)
              .toArray();
            
            if (recommendations.length > 0) {
              console.log(`[API Sucursal] Encontrada recomendación con timestamp: ${recommendations[0].timestamp}`);
            }
          }
        }
        
        // Buscar productos_coincidentes en la colección predictions_history
        let productosCoincidentes = [];
        try {
          // Si es una predicción multi-día combinada
          if (combinedPrediction.isMultiDayCombinedPrediction) {
            // Buscar directamente la predicción combinada en el historial
            const historialPrediccion = await db.collection('predictions_history')
              .findOne({ 
                timestamp: combinedPrediction.timestamp,
                branch: id,
                isMultiDayCombinedPrediction: true
              });
              
            if (historialPrediccion && historialPrediccion.productos_coincidentes) {
              productosCoincidentes = historialPrediccion.productos_coincidentes;
              console.log(`[API Sucursal] Encontrados ${productosCoincidentes.length} productos coincidentes combinados en el historial`);
            } else {
              console.log(`[API Sucursal] No se encontraron productos coincidentes combinados para el timestamp: ${combinedPrediction.timestamp}`);
              
              // Si no encontramos los productos coincidentes combinados, buscar por timestamp y fecha
              const historialSinCombinar = await db.collection('predictions_history')
                .findOne({ 
                  timestamp: combinedPrediction.timestamp,
                  branch: id
                });
                
              if (historialSinCombinar && historialSinCombinar.productos_coincidentes) {
                productosCoincidentes = historialSinCombinar.productos_coincidentes;
                console.log(`[API Sucursal] Encontrados ${productosCoincidentes.length} productos coincidentes sin combinar`);
              }
            }
          } else {
            // Caso normal para una sola predicción
            const historialPrediccion = await db.collection('predictions_history')
              .findOne({ 
                timestamp: dailyPrediction.timestamp,
                date: dailyPrediction.normalizedDate || dailyPrediction.date,
                branch: id
              });
              
            if (historialPrediccion && historialPrediccion.productos_coincidentes) {
              productosCoincidentes = historialPrediccion.productos_coincidentes;
              console.log(`[API Sucursal] Encontrados ${productosCoincidentes.length} productos coincidentes en el historial`);
            } else {
              console.log('[API Sucursal] No se encontraron productos coincidentes en el historial');
            }
          }
        } catch (error) {
          console.error('[API Sucursal] Error al buscar productos coincidentes:', error);
        }
        
        return res.status(200).json({
          success: true,
          branch: id,
          prediction: dailyPrediction,
          recommendation: recommendations.length > 0 ? recommendations[0] : null,
          productos_coincidentes: productosCoincidentes,
          lastUpdate: dailyPrediction.timestamp,
          isWeeklyPrediction: false,
          isMultiDayPrediction: !!multiDayInfo,
          isMultiDayCombinedPrediction: !!combinedPrediction.isMultiDayCombinedPrediction,
          multiDayInfo,
          combinedDaysInfo: combinedPrediction.isMultiDayCombinedPrediction ? {
            totalDays: combinedPrediction.combinedDaysCount,
            dateRange: combinedPrediction.dateRange,
            sourcePredictions: combinedPrediction.sourcePredictions
          } : null,
          message: combinedPrediction.isMultiDayCombinedPrediction
            ? `Se están mostrando las predicciones combinadas para los próximos ${combinedPrediction.combinedDaysCount} días (${format(new Date(combinedPrediction.dateRange.start), 'dd/MM/yyyy')} - ${format(new Date(combinedPrediction.dateRange.end), 'dd/MM/yyyy')})`
            : multiDayInfo
              ? `Se están mostrando las predicciones diarias (día ${multiDayInfo.currentIndex + 1} de ${multiDayInfo.totalDays})`
              : "Se están mostrando las predicciones diarias"
        });
      }
    }
    
    // Si llegamos aquí es porque no encontramos predicciones diarias o semanales
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