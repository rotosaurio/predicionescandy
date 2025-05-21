import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { format, subDays, parseISO, startOfDay, endOfDay, nextMonday, setHours, addDays } from 'date-fns';

// API endpoint del modelo de predicción
const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';
const API_ENDPOINTS = {
  PREDECIR: `${API_BASE_URL}/api/predecir`,
  SUCURSALES: `${API_BASE_URL}/api/sucursales`,
  ESTADO: `${API_BASE_URL}/api/estado`,
  RECOMENDACIONES: `${API_BASE_URL}/api/recomendaciones`,
};

// Interfaces
interface Prediction {
  nombre: string;
  cantidad: number;
  confianza: number;
  articulo_id?: string;
}

interface Recommendation {
  nombre: string;
  cantidad_sugerida: number;
  confianza: number;
  tipo: string;
  motivo?: string;
  min_cantidad?: number;
  max_cantidad?: number;
  tipo_recomendacion?: string;
  frecuencia_otras?: number;
  num_sucursales?: number;
  nivel_recomendacion?: number;
  pedidos_recientes_otras?: Array<{
    sucursal: string;
    dias_desde_pedido: number;
    cantidad: number;
  }>;
  ultima_fecha_pedido?: string;
  dias_desde_ultimo_pedido?: number;
  cantidad_ultimo_pedido?: number;
}

interface ResultadoPrediccion {
  ARTICULO_ID: string;
  NOMBRE_ARTICULO: string;
  CANTIDAD_PREDICHA: number;
  ES_RECOMENDACION: boolean;
  CONFIANZA: number;
  MOTIVO?: string;
  MIN_CANTIDAD?: number;
  MAX_CANTIDAD?: number;
  TIPO_RECOMENDACION?: string;
  FRECUENCIA_OTRAS?: number;
  NUM_SUCURSALES?: number;
  NIVEL_RECOMENDACION?: number;
  PEDIDOS_RECIENTES_OTRAS?: Array<{
    sucursal: string;
    dias_desde_pedido: number;
    cantidad: number;
  }>;
  ULTIMA_FECHA_PEDIDO?: string;
  DIAS_DESDE_ULTIMO_PEDIDO?: number;
  CANTIDAD_ULTIMO_PEDIDO?: number;
}

interface PredictionResult {
  predicciones: Prediction[];
  recomendaciones: Recommendation[];
  resultados: ResultadoPrediccion[];
  productos_coincidentes: Prediction[];
}

// Función para normalizar el nombre de la sucursal para la colección
function normalizeBranchName(branch: string): string {
  // Reemplazar espacios y caracteres especiales por guiones bajos
  return branch.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// Función para generar predicciones para una sucursal específica en una fecha específica
async function generatePredictionForBranchAndDate(sucursal: string, fecha: string) {
  try {
    console.log(`[AUTO] Generando predicciones para sucursal: ${sucursal}, fecha: ${fecha}`);
    const requestBody = {
      fecha,
      sucursal,
      top_n: 200,  // Solo necesitamos 200 predicciones y 200 recomendaciones
      modo: "avanzado",
      num_muestras: 15,
      incluir_recomendaciones: true,
      incluir_motivos: true,
    };
    
    const response = await fetch(API_ENDPOINTS.PREDECIR, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Error del API: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[AUTO] Datos recibidos del API para ${sucursal} (${fecha}): ${data.resultados?.length || 0} resultados`);
    
    // Separar predicciones y recomendaciones
    const predicciones = data.resultados
      .filter((item: ResultadoPrediccion) => !item.ES_RECOMENDACION)
      .map((item: ResultadoPrediccion) => ({
        nombre: item.NOMBRE_ARTICULO,
        cantidad: item.CANTIDAD_PREDICHA,
        confianza: item.CONFIANZA,
        articulo_id: item.ARTICULO_ID
      }));

    const recomendaciones = data.resultados
      .filter((item: ResultadoPrediccion) => item.ES_RECOMENDACION)
      .map((item: ResultadoPrediccion) => ({
        nombre: item.NOMBRE_ARTICULO,
        cantidad_sugerida: item.CANTIDAD_PREDICHA,
        confianza: item.CONFIANZA,
        tipo: item.TIPO_RECOMENDACION || 'recomendacion',
        motivo: item.MOTIVO || 'No disponible',
        min_cantidad: item.MIN_CANTIDAD,
        max_cantidad: item.MAX_CANTIDAD,
        tipo_recomendacion: item.TIPO_RECOMENDACION,
        frecuencia_otras: item.FRECUENCIA_OTRAS,
        num_sucursales: item.NUM_SUCURSALES,
        nivel_recomendacion: item.NIVEL_RECOMENDACION,
        pedidos_recientes_otras: item.PEDIDOS_RECIENTES_OTRAS,
        ultima_fecha_pedido: item.ULTIMA_FECHA_PEDIDO,
        dias_desde_ultimo_pedido: item.DIAS_DESDE_ULTIMO_PEDIDO,
        cantidad_ultimo_pedido: item.CANTIDAD_ULTIMO_PEDIDO
      }));
    
    console.log(`[AUTO] Separación completada para ${fecha}: ${predicciones.length} predicciones, ${recomendaciones.length} recomendaciones`);
    // Encontrar productos que coinciden entre predicciones y recomendaciones
    const productosPrediccionSet = new Set(predicciones.map((p: Prediction) => p.nombre.toLowerCase()));
    const productosRecomendacionSet = new Set(recomendaciones.map((r: Recommendation) => r.nombre.toLowerCase()));
    
    // Productos que están tanto en predicciones como en recomendaciones
    const productosCoincidentes = predicciones.filter((p: Prediction) => 
      productosRecomendacionSet.has(p.nombre.toLowerCase())
    );
    
    console.log(`[AUTO] Se encontraron ${productosCoincidentes.length} productos que coinciden entre predicciones y recomendaciones`);
    
    return {
      predicciones,
      recomendaciones,
      resultados: data.resultados,
      productos_coincidentes: productosCoincidentes
    };
  } catch (error) {
    console.error(`[AUTO] Error generando predicción para ${sucursal} (${fecha}):`, error);
    throw error;
  }
}

// Función para obtener recomendaciones adicionales del endpoint específico
async function obtenerRecomendacionesAdicionales(sucursal: string): Promise<Recommendation[]> {
  try {
    console.log(`[AUTO] Consultando endpoint específico de recomendaciones para sucursal: ${sucursal}`);
    
    const requestBody = {
      sucursal
    };
    
    const response = await fetch(API_ENDPOINTS.RECOMENDACIONES, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Error del API de recomendaciones: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.recomendaciones || !Array.isArray(data.recomendaciones)) {
      console.log(`[AUTO] El endpoint de recomendaciones no devolvió un formato válido.`);
      return [];
    }
    
    console.log(`[AUTO] Se obtuvieron ${data.recomendaciones.length} recomendaciones adicionales para ${sucursal}.`);
    
    // Transformar el formato de las recomendaciones si es necesario
    return data.recomendaciones.map((item: any) => ({
      nombre: item.NOMBRE_ARTICULO || item.nombre,
      cantidad_sugerida: item.CANTIDAD_PREDICHA || item.cantidad_sugerida,
      confianza: item.CONFIANZA || item.confianza,
      tipo: item.TIPO_RECOMENDACION || item.tipo || 'recomendacion_adicional',
      motivo: item.MOTIVO || item.motivo || 'Recomendación obtenida del endpoint específico',
      min_cantidad: item.MIN_CANTIDAD || item.min_cantidad,
      max_cantidad: item.MAX_CANTIDAD || item.max_cantidad,
      tipo_recomendacion: item.TIPO_RECOMENDACION || item.tipo_recomendacion,
      frecuencia_otras: item.FRECUENCIA_OTRAS || item.frecuencia_otras,
      num_sucursales: item.NUM_SUCURSALES || item.num_sucursales,
      nivel_recomendacion: item.NIVEL_RECOMENDACION || item.nivel_recomendacion,
      pedidos_recientes_otras: item.PEDIDOS_RECIENTES_OTRAS || item.pedidos_recientes_otras,
      ultima_fecha_pedido: item.ULTIMA_FECHA_PEDIDO || item.ultima_fecha_pedido,
      dias_desde_ultimo_pedido: item.DIAS_DESDE_ULTIMO_PEDIDO || item.dias_desde_ultimo_pedido,
      cantidad_ultimo_pedido: item.CANTIDAD_ULTIMO_PEDIDO || item.cantidad_ultimo_pedido
    }));
  } catch (error) {
    console.error(`[AUTO] Error obteniendo recomendaciones adicionales para ${sucursal}:`, error);
    return [];
  }
}

// Función para verificar si se necesita una nueva predicción
function needsPrediction(lastPredictionDate: Date | null): boolean {
  if (!lastPredictionDate) {
    console.log('[AUTO] No hay predicción previa, se requiere una nueva');
    return true;
  }
  
  // Siempre permitir nuevas predicciones independientemente de la fecha
  console.log('[AUTO] Permitiendo generar nueva predicción aunque ya existan para esta semana');
  return true;
}

// Función para asegurar que la colección existe
async function ensureCollectionExists(db: any, collectionName: string): Promise<void> {
  try {
    console.log(`[AUTO] Verificando si existe la colección ${collectionName}`);
    const collections = await db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      console.log(`[AUTO] Creando colección ${collectionName}`);
      await db.createCollection(collectionName);
    } else {
      console.log(`[AUTO] La colección ${collectionName} ya existe`);
    }
  } catch (error) {
    console.error(`[AUTO] Error al verificar/crear colección ${collectionName}:`, error);
    // No lanzamos el error para continuar con el flujo
  }
}

// Function to check if inventory exists for a specific date
async function hasInventoryForDate(db: any, date: string): Promise<boolean> {
  // Check exact match first
  const inventoryMetadata = await db.collection('inventariocedis_metadata').findOne({ inventoryDate: date });
  if (inventoryMetadata) {
    console.log(`[AUTO] Encontrado inventario exacto para la fecha ${date}`);
    return true;
  }

  // Try alternative date formats
  // Parse the input date and create alternative formats
  const parts = date.split('/');
  if (parts.length === 3) {
    const day = parts[0];
    const month = parts[1]; 
    const year = parts[2];
    
    const alternativeDates = [
      `${year}-${month}-${day}`,   // yyyy-MM-dd
      `${day}-${month}-${year}`,   // dd-MM-yyyy
      `${month}/${day}/${year}`,   // MM/dd/yyyy
      `${year}/${month}/${day}`    // yyyy/MM/dd
    ];
    
    for (const altDate of alternativeDates) {
      const result = await db.collection('inventariocedis_metadata').findOne({ inventoryDate: altDate });
      if (result) {
        console.log(`[AUTO] Encontrado inventario con formato alternativo: ${altDate}`);
        return true;
      }
    }
  }

  // If no exact match, check latest inventory
  const latestInventory = await db.collection('inventariocedis_metadata')
    .find({})
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
  
  if (latestInventory && latestInventory.length > 0) {
    console.log(`[AUTO] No se encontró inventario para ${date}, pero el inventario más reciente es de ${latestInventory[0].inventoryDate}`);
  } else {
    console.log(`[AUTO] No se encontró ningún registro de inventario en la base de datos`);
  }
  
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Soportar tanto POST (manual) como GET (cron)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  console.log(`[AUTO] Iniciando proceso de predicciones automáticas semanales - Método: ${req.method}`);

  try {
    // Conectar a MongoDB
    const { db } = await connectToDatabase();
    console.log('[AUTO] Conexión a MongoDB establecida');
    
    // Asegurar que existe la colección de historial
    await ensureCollectionExists(db, 'predictions_history');
    await ensureCollectionExists(db, 'weekly_predictions');
    
    // Obtener todas las sucursales del API
    console.log('[AUTO] Obteniendo lista de sucursales desde API');
    const sucursalesResponse = await fetch(API_ENDPOINTS.SUCURSALES);
    if (!sucursalesResponse.ok) {
      throw new Error('Error al obtener sucursales');
    }
    
    const sucursalesData = await sucursalesResponse.json();
    const sucursales = sucursalesData.sucursales || [];
    
    console.log(`[AUTO] ${sucursales.length} sucursales encontradas`);
    
    if (sucursales.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron sucursales para generar predicciones'
      });
    }
    
    // Fecha actual para las predicciones
    const today = new Date();
    const fechaActual = format(today, 'dd/MM/yyyy');

    // Check if inventory check should be bypassed (for testing or emergency runs)
    const skipInventoryCheck = req.query.skipInventoryCheck === 'true' || req.body?.skipInventoryCheck === true;
    
    // Option to use latest inventory if available
    const useLatestInventory = req.query.useLatestInventory === 'true' || req.body?.useLatestInventory === true;
    
    // Check if inventory exists for the current date
    let inventoryExists = skipInventoryCheck ? true : await hasInventoryForDate(db, fechaActual);
    
    // If no inventory for today but useLatestInventory is true, check for any recent inventory
    if (!inventoryExists && useLatestInventory) {
      const latestInventory = await db.collection('inventariocedis_metadata')
        .find({})
        .sort({ _id: -1 })
        .limit(1)
        .toArray();
      
      if (latestInventory && latestInventory.length > 0) {
        console.log(`[AUTO] Usando el inventario más reciente del ${latestInventory[0].inventoryDate}`);
        inventoryExists = true;
      }
    }
    
    if (!inventoryExists) {
      console.log(`[AUTO] No hay inventario disponible para la fecha ${fechaActual}.`);
      
      // List all available inventory dates for debugging
      const allInventories = await db.collection('inventariocedis_metadata')
        .find({})
        .sort({ _id: -1 })
        .limit(10)
        .toArray();
      
      const availableDates = allInventories.map((inv: any) => inv.inventoryDate);
      console.log(`[AUTO] Fechas de inventario disponibles: ${JSON.stringify(availableDates)}`);
      
      // Check if we have inventory for any recent date (last 7 days)
      let recentInventoryFound = false;
      let latestInventoryDate = null;
      
      for (let i = 1; i <= 7; i++) {
        const pastDate = format(subDays(today, i), 'dd/MM/yyyy');
        if (await hasInventoryForDate(db, pastDate)) {
          recentInventoryFound = true;
          latestInventoryDate = pastDate;
          break;
        }
      }
      
      return res.status(400).json({
        success: false,
        message: `No hay inventario disponible para la fecha ${fechaActual}. Por favor, suba un inventario antes de generar predicciones.`,
        inventoryStatus: {
          currentDateHasInventory: false, 
          recentInventoryFound,
          latestInventoryDate,
          availableInventories: availableDates
        },
        tip: "Para omitir esta verificación, añada ?skipInventoryCheck=true o ?useLatestInventory=true a la URL."
      });
    }
    
    // Calcular próxima actualización (siguiente lunes 8 AM)
    let nextUpdateDate = nextMonday(today);
    nextUpdateDate = setHours(nextUpdateDate, 8);
    
    // Resultados y errores por sucursal
    const results = [];
    const errors = [];
    
    // Obtener configuración del request (o valores por defecto)
    const config = {
      modo: req.body?.modo || req.query?.modo || "avanzado",
      num_muestras: parseInt(req.body?.num_muestras || req.query?.num_muestras || "15"),
      incluir_recomendaciones: req.body?.incluir_recomendaciones !== false && req.query?.incluir_recomendaciones !== "false",
      incluir_motivos: req.body?.incluir_motivos !== false && req.query?.incluir_motivos !== "false",
      force: req.body?.force === true || req.query?.force === "true"
    };
    
    console.log(`[AUTO] Configuración recibida:`, config);
    
    // Procesar cada sucursal
    for (const sucursal of sucursales) {
      try {
        console.log(`[AUTO] Procesando sucursal: ${sucursal}`);
        
        // Nombre seguro para colecciones (sin espacios ni caracteres especiales)
        const safeCollectionName = normalizeBranchName(sucursal);
        const predictionCollectionName = `predictions_${safeCollectionName}`;
        const recommendationCollectionName = `recommendations_${safeCollectionName}`;
        const weeklyCollectionName = `weekly_predictions_${safeCollectionName}`;
        
        // Asegurar que existen las colecciones específicas
        await ensureCollectionExists(db, predictionCollectionName);
        await ensureCollectionExists(db, recommendationCollectionName);
        await ensureCollectionExists(db, weeklyCollectionName);
        
        // Verificar si ya tenemos una predicción reciente
        console.log(`[AUTO] Verificando última predicción semanal para ${sucursal}`);
        const lastPrediction = await db.collection(weeklyCollectionName)
          .find({})
          .sort({ timestamp: -1 })
          .limit(1)
          .toArray();
        
        const lastPredictionDate = lastPrediction.length > 0 
          ? new Date(lastPrediction[0].timestamp) 
          : null;
        
        // Verificar si necesitamos una nueva predicción
        if (needsPrediction(lastPredictionDate) || config.force) {
          console.log(`[AUTO] Generando nueva predicción semanal para ${sucursal}`);
          
          // Parámetros para la predicción
          const parametros = {
            top_n: 200,
            modo: config.modo,
            num_muestras: config.num_muestras,
            incluir_recomendaciones: config.incluir_recomendaciones,
            incluir_motivos: config.incluir_motivos
          };
          
          console.log(`[AUTO] Parámetros de predicción para ${sucursal}:`, parametros);
          
          // Generar predicciones solo para el día actual
          const resultado = await generatePredictionForBranchAndDate(sucursal, fechaActual);
          
          const timestamp = new Date().toISOString();
          const dateStr = format(today, 'yyyy-MM-dd');
          
          // Guardar las predicciones diarias en la colección correspondiente
          const predictionDocument = {
            timestamp,
            branch: sucursal,
            date: dateStr,
            predictions: resultado.predicciones,
            isPartOfWeekly: false
          };
          
          console.log(`[AUTO] Guardando predicciones en ${predictionCollectionName}`);
          await db.collection(predictionCollectionName).insertOne(predictionDocument);
          
          // Guardar las recomendaciones en su colección específica
          const recommendationDocument = {
            timestamp,
            branch: sucursal,
            date: dateStr,
            recommendations: resultado.recomendaciones,
            isPartOfWeekly: false
          };
          
          console.log(`[AUTO] Guardando recomendaciones en ${recommendationCollectionName}`);
          await db.collection(recommendationCollectionName).insertOne(recommendationDocument);
          
          // Guardar en el historial general
          const historyDocument = {
            timestamp,
            branch: sucursal,
            date: dateStr,
            isWeeklyPrediction: false,
            predictions: resultado.predicciones,
            recommendations: resultado.recomendaciones,
            productos_coincidentes: resultado.productos_coincidentes,
            resultados: resultado.resultados
          };
          
          console.log('[AUTO] Guardando en historial general (predictions_history)');
          await db.collection('predictions_history').insertOne(historyDocument);
          
          // Guardar también en la colección semanal para mantener compatibilidad
          console.log('[AUTO] Guardando en colección semanal para compatibilidad');
          await db.collection('weekly_predictions').insertOne({
            ...historyDocument,
            branch: sucursal
          });
          
          results.push({
            sucursal,
            status: 'success',
            message: 'Predicción diaria generada correctamente',
            lastUpdate: timestamp,
            date: dateStr,
            productos_coincidentes: resultado.productos_coincidentes.length
          });
          
          console.log(`[AUTO] Predicción diaria completa para ${sucursal}`);
        } else {
          console.log(`[AUTO] Ya existe una predicción reciente para ${sucursal}, pero se generará una nueva`);
          
          // Generar predicciones solo para el día actual
          const resultado = await generatePredictionForBranchAndDate(sucursal, fechaActual);
          
          const timestamp = new Date().toISOString();
          const dateStr = format(today, 'yyyy-MM-dd');
          
          // Guardar las predicciones diarias en la colección correspondiente
          const predictionDocument = {
            timestamp,
            branch: sucursal,
            date: dateStr,
            predictions: resultado.predicciones,
            isPartOfWeekly: false
          };
          
          console.log(`[AUTO] Guardando predicciones en ${predictionCollectionName}`);
          await db.collection(predictionCollectionName).insertOne(predictionDocument);
          
          // Guardar las recomendaciones en su colección específica
          const recommendationDocument = {
            timestamp,
            branch: sucursal,
            date: dateStr,
            recommendations: resultado.recomendaciones,
            isPartOfWeekly: false
          };
          
          console.log(`[AUTO] Guardando recomendaciones en ${recommendationCollectionName}`);
          await db.collection(recommendationCollectionName).insertOne(recommendationDocument);
          
          // Guardar en el historial general
          const historyDocument = {
            timestamp,
            branch: sucursal,
            date: dateStr,
            isWeeklyPrediction: false,
            predictions: resultado.predicciones,
            recommendations: resultado.recomendaciones,
            productos_coincidentes: resultado.productos_coincidentes,
            resultados: resultado.resultados
          };
          
          console.log('[AUTO] Guardando en historial general (predictions_history)');
          await db.collection('predictions_history').insertOne(historyDocument);
          
          // Guardar también en la colección semanal para mantener compatibilidad
          console.log('[AUTO] Guardando en colección semanal para compatibilidad');
          await db.collection('weekly_predictions').insertOne({
            ...historyDocument,
            branch: sucursal
          });
          
          results.push({
            sucursal,
            status: 'success',
            message: 'Nueva predicción diaria generada correctamente',
            lastUpdate: timestamp,
            date: dateStr,
            productos_coincidentes: resultado.productos_coincidentes.length
          });
          
          console.log(`[AUTO] Predicción diaria completa para ${sucursal}`);
        }
      } catch (error) {
        console.error(`[AUTO] Error procesando sucursal ${sucursal}:`, error);
        errors.push({
          sucursal,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // Enviar respuesta con los resultados
    return res.status(200).json({
      success: true,
      results,
      errors,
      nextScheduledUpdate: format(nextUpdateDate, 'yyyy-MM-dd HH:mm:ss')
    });
    
  } catch (error) {
    console.error('[AUTO] Error general:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Error interno del servidor'
    });
  }
}