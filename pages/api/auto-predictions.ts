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

// Función para verificar si hoy es un día permitido para generar predicciones para una sucursal específica
function isDayAllowedForBranch(branchName: string, forceDay: boolean = false): boolean {
  // Si se fuerza la generación, permitir cualquier día
  if (forceDay) {
    console.log(`[AUTO] Forzando generación de predicciones para ${branchName} sin importar el día.`);
    return true;
  }
  
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Domingo, 1 = Lunes, 2 = Martes, etc.
  
  // Normalizar el nombre de la sucursal para comparación
  const normalizedBranch = branchName.trim().toLowerCase();
  
  // Grupo 1: Lunes (1), Miércoles (3) y Viernes (5)
  if (normalizedBranch.includes('nueva españa') || normalizedBranch.includes('nueva espana') || 
      (normalizedBranch.includes('enedina') && normalizedBranch.includes('nueva'))) {
    const allowedDays = [1, 3, 5]; // Lunes, Miércoles, Viernes
    const isAllowed = allowedDays.includes(dayOfWeek);
    
    if (!isAllowed) {
      console.log(`[AUTO] La sucursal ${branchName} solo puede generar predicciones los lunes, miércoles y viernes. Hoy es día ${dayOfWeek}.`);
    }
    
    return isAllowed;
  }
  
  // Grupo 2: Martes (2), Jueves (4) y Sábados (6)
  // Excluimos KRAMFORS - WASHINGTON de las restricciones
  if ((normalizedBranch.includes('san pedro') || 
       (normalizedBranch.includes('kramfors') && !normalizedBranch.includes('washington')) || 
       (normalizedBranch.includes('enedina') && normalizedBranch.includes('industria')))) {
    const allowedDays = [2, 4, 6]; // Martes, Jueves, Sábado
    const isAllowed = allowedDays.includes(dayOfWeek);
    
    if (!isAllowed) {
      console.log(`[AUTO] La sucursal ${branchName} solo puede generar predicciones los martes, jueves y sábados. Hoy es día ${dayOfWeek}.`);
    }
    
    return isAllowed;
  }
  
  // Para KRAMFORS - WASHINGTON y el resto de sucursales, permitir cualquier día
  return true;
}

// Función para obtener el número de días de predicción según la sucursal
function getNumDaysForBranch(branchName: string, defaultDays: number): number {
  // Normalizar el nombre de la sucursal para comparación
  const normalizedBranch = branchName.trim().toLowerCase();
  
  // Para KRAMFORS - WASHINGTON, generar predicción de 3 días
  if (normalizedBranch.includes('kramfors') && normalizedBranch.includes('washington')) {
    console.log(`[AUTO] La sucursal ${branchName} generará predicciones para 3 días.`);
    return 3;
  }
  
  // Sucursales con predicciones de 6 días
  // Grupo 1: ENEDINA - NUEVA ESPAÑA
  // Grupo 2: KRAMFORS - SAN PEDRO y ENEDINA - INDUSTRIAS
  if (normalizedBranch.includes('nueva españa') || normalizedBranch.includes('nueva espana') || 
      (normalizedBranch.includes('san pedro') || 
       (normalizedBranch.includes('kramfors') && !normalizedBranch.includes('washington'))) ||
      (normalizedBranch.includes('enedina') && 
       (normalizedBranch.includes('nueva') || normalizedBranch.includes('industria')))) {
    console.log(`[AUTO] La sucursal ${branchName} generará predicciones para 6 días.`);
    return 6;
  }
  
  // Para el resto de sucursales, usar el valor por defecto (3 días)
  return defaultDays;
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

// Función para generar predicciones para los próximos N días
async function generatePredictionsForDays(sucursal: string, startDate: Date, numDays: number = 3): Promise<{
  fecha: string;
  dateStr: string;
  resultado: PredictionResult;
}[]> {
  const results = [];

  for (let i = 0; i < numDays; i++) {
    const targetDate = addDays(startDate, i);
    const formattedDate = format(targetDate, 'dd/MM/yyyy');
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    
    console.log(`[AUTO] Generando predicción para sucursal: ${sucursal}, fecha: ${formattedDate} (día ${i+1} de ${numDays})`);
    
    try {
      const resultado = await generatePredictionForBranchAndDate(sucursal, formattedDate);
      results.push({
        fecha: formattedDate,
        dateStr,
        resultado
      });
    } catch (error) {
      console.error(`[AUTO] Error generando predicción para ${sucursal} en fecha ${formattedDate}:`, error);
      throw error;
    }
  }
  
  return results;
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
      force: req.body?.force === true || req.query?.force === "true",
      force_day: req.body?.force_day === true || req.query?.force_day === "true" // Forzar generación sin importar el día
    };
    
    console.log(`[AUTO] Configuración recibida:`, config);
    
    // Procesar cada sucursal
    for (const sucursal of sucursales) {
      try {
        console.log(`[AUTO] Procesando sucursal: ${sucursal}`);
        
        // Verificar si hoy es un día permitido para esta sucursal
        if (!isDayAllowedForBranch(sucursal, config.force_day)) {
          console.log(`[AUTO] Hoy no es un día permitido para generar predicciones para ${sucursal}. Omitiendo.`);
          results.push({
            sucursal,
            status: 'skipped',
            message: 'Día no permitido para generar predicciones'
          });
          continue; // Pasar a la siguiente sucursal
        }
        
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
          console.log(`[AUTO] Generando predicciones para los próximos 3 días para ${sucursal}`);
          
          // Parámetros para la predicción
          const parametros = {
            top_n: 200,
            modo: config.modo,
            num_muestras: config.num_muestras,
            incluir_recomendaciones: config.incluir_recomendaciones,
            incluir_motivos: config.incluir_motivos
          };
          
          console.log(`[AUTO] Parámetros de predicción para ${sucursal}:`, parametros);
          
          // Número de días para los que se generarán predicciones
          const numDays = getNumDaysForBranch(sucursal, 3);
          
          // Generar predicciones para múltiples días
          const predicciones = await generatePredictionsForDays(sucursal, today, numDays);
          
          const timestamp = new Date().toISOString();
          
          // Combinar todas las predicciones en una sola
          console.log(`[AUTO] Combinando predicciones de ${predicciones.length} días en una sola`);
          
          // Crear un mapa para eliminar duplicados por nombre de producto en predicciones
          const uniquePredictions = new Map();
          
          // Procesar todas las predicciones y combinarlas
          predicciones.forEach((prediccion, index) => {
            if (prediccion.resultado.predicciones && Array.isArray(prediccion.resultado.predicciones)) {
              prediccion.resultado.predicciones.forEach(product => {
                // Si el producto no existe en el mapa o tiene mayor confianza, lo añadimos/actualizamos
                if (!uniquePredictions.has(product.nombre.toLowerCase()) || 
                    product.confianza > uniquePredictions.get(product.nombre.toLowerCase()).confianza) {
                  uniquePredictions.set(product.nombre.toLowerCase(), {
                    ...product,
                    sourceDayIndex: index,
                    sourceDay: prediccion.fecha
                  });
                }
              });
            }
          });
          
          // Convertir el mapa a array
          const combinedPredictions = Array.from(uniquePredictions.values());
          console.log(`[AUTO] Combinación de predicciones finalizada: ${combinedPredictions.length} productos únicos`);
          
          // Hacer lo mismo para las recomendaciones
          const uniqueRecommendations = new Map();
          
          predicciones.forEach((prediccion, index) => {
            if (prediccion.resultado.recomendaciones && Array.isArray(prediccion.resultado.recomendaciones)) {
              prediccion.resultado.recomendaciones.forEach(product => {
                // Si el producto no existe en el mapa o tiene mayor confianza, lo añadimos/actualizamos
                if (!uniqueRecommendations.has(product.nombre.toLowerCase()) || 
                    product.confianza > uniqueRecommendations.get(product.nombre.toLowerCase()).confianza) {
                  uniqueRecommendations.set(product.nombre.toLowerCase(), {
                    ...product,
                    sourceDayIndex: index,
                    sourceDay: prediccion.fecha
                  });
                }
              });
            }
          });
          
          // Convertir el mapa a array
          const combinedRecommendations = Array.from(uniqueRecommendations.values());
          console.log(`[AUTO] Combinación de recomendaciones finalizada: ${combinedRecommendations.length} productos únicos`);
          
          // Hacer lo mismo para productos coincidentes
          const uniqueCoincidentes = new Map();
          
          predicciones.forEach((prediccion, index) => {
            if (prediccion.resultado.productos_coincidentes && Array.isArray(prediccion.resultado.productos_coincidentes)) {
              prediccion.resultado.productos_coincidentes.forEach(product => {
                // Para productos coincidentes simplemente guardamos uno por nombre
                if (!uniqueCoincidentes.has(product.nombre.toLowerCase())) {
                  uniqueCoincidentes.set(product.nombre.toLowerCase(), {
                    ...product,
                    sourceDayIndex: index,
                    sourceDay: prediccion.fecha
                  });
                }
              });
            }
          });
          
          // Convertir el mapa a array
          const combinedCoincidentes = Array.from(uniqueCoincidentes.values());
          console.log(`[AUTO] Combinación de productos coincidentes finalizada: ${combinedCoincidentes.length} productos únicos`);
          
          // Calcular rango de fechas para la predicción combinada
          const dateRange = {
            start: predicciones[0].dateStr,
            end: predicciones[predicciones.length - 1].dateStr
          };
          
          // En lugar de guardar cada predicción diaria por separado, guardamos una única predicción combinada
          const combinedPredictionDocument = {
            timestamp,
            branch: sucursal,
            date: predicciones[0].dateStr, // Fecha del primer día como fecha principal
            predictions: combinedPredictions,
            isMultiDayPrediction: true,
            isMultiDayCombinedPrediction: true,
            combinedDaysCount: predicciones.length,
            dateRange,
            sourceDates: predicciones.map(p => ({ 
              date: p.dateStr,
              formattedDate: p.fecha,
              index: predicciones.indexOf(p)
            }))
          };
          
          console.log(`[AUTO] Guardando predicción combinada en ${predictionCollectionName}`);
          await db.collection(predictionCollectionName).insertOne(combinedPredictionDocument);
          
          // Guardar las recomendaciones combinadas
          const combinedRecommendationDocument = {
            timestamp,
            branch: sucursal,
            date: predicciones[0].dateStr,
            recommendations: combinedRecommendations,
            isMultiDayPrediction: true,
            isMultiDayCombinedPrediction: true,
            combinedDaysCount: predicciones.length,
            dateRange,
            sourceDates: predicciones.map(p => ({ 
              date: p.dateStr,
              formattedDate: p.fecha,
              index: predicciones.indexOf(p)
            }))
          };
          
          console.log(`[AUTO] Guardando recomendaciones combinadas en ${recommendationCollectionName}`);
          await db.collection(recommendationCollectionName).insertOne(combinedRecommendationDocument);
          
          // Guardar en el historial general
          const combinedHistoryDocument = {
            timestamp,
            branch: sucursal,
            date: predicciones[0].dateStr,
            formattedDate: predicciones[0].fecha,
            isWeeklyPrediction: false,
            isMultiDayPrediction: true,
            isMultiDayCombinedPrediction: true,
            combinedDaysCount: predicciones.length,
            multiDayPredictionIndex: 0,
            totalDays: 1, // Solo hay 1 registro que contiene todos los días
            predictions: combinedPredictions,
            recommendations: combinedRecommendations,
            productos_coincidentes: combinedCoincidentes,
            dateRange,
            sourceDates: predicciones.map(p => ({ 
              date: p.dateStr,
              formattedDate: p.fecha,
              index: predicciones.indexOf(p)
            }))
          };
          
          console.log(`[AUTO] Guardando predicción combinada en historial general (predictions_history)`);
          await db.collection('predictions_history').insertOne(combinedHistoryDocument);
          
          // Resultados para enviar en la respuesta
          results.push({
            sucursal,
            status: 'success',
            message: `Predicciones para ${predicciones.length} días combinadas y guardadas como una sola`,
            lastUpdate: timestamp,
            dateRange,
            days: predicciones.map(p => p.fecha),
            combinedCount: {
              predictions: combinedPredictions.length,
              recommendations: combinedRecommendations.length,
              coincidentes: combinedCoincidentes.length
            }
          });
          
          console.log(`[AUTO] Predicciones múltiples combinadas y guardadas para ${sucursal}`);
        } else {
          // Número de días para los que se generarán predicciones
          const numDays = getNumDaysForBranch(sucursal, 3);
          
          console.log(`[AUTO] Ya existe una predicción reciente para ${sucursal}, pero se generarán nuevas predicciones para ${numDays} días`);
          
          // Generar predicciones para múltiples días
          const predicciones = await generatePredictionsForDays(sucursal, today, numDays);
          
          const timestamp = new Date().toISOString();
          
          // Combinar todas las predicciones en una sola
          console.log(`[AUTO] Combinando predicciones de ${predicciones.length} días en una sola`);
          
          // Crear un mapa para eliminar duplicados por nombre de producto en predicciones
          const uniquePredictions = new Map();
          
          // Procesar todas las predicciones y combinarlas
          predicciones.forEach((prediccion, index) => {
            if (prediccion.resultado.predicciones && Array.isArray(prediccion.resultado.predicciones)) {
              prediccion.resultado.predicciones.forEach(product => {
                // Si el producto no existe en el mapa o tiene mayor confianza, lo añadimos/actualizamos
                if (!uniquePredictions.has(product.nombre.toLowerCase()) || 
                    product.confianza > uniquePredictions.get(product.nombre.toLowerCase()).confianza) {
                  uniquePredictions.set(product.nombre.toLowerCase(), {
                    ...product,
                    sourceDayIndex: index,
                    sourceDay: prediccion.fecha
                  });
                }
              });
            }
          });
          
          // Convertir el mapa a array
          const combinedPredictions = Array.from(uniquePredictions.values());
          console.log(`[AUTO] Combinación de predicciones finalizada: ${combinedPredictions.length} productos únicos`);
          
          // Hacer lo mismo para las recomendaciones
          const uniqueRecommendations = new Map();
          
          predicciones.forEach((prediccion, index) => {
            if (prediccion.resultado.recomendaciones && Array.isArray(prediccion.resultado.recomendaciones)) {
              prediccion.resultado.recomendaciones.forEach(product => {
                // Si el producto no existe en el mapa o tiene mayor confianza, lo añadimos/actualizamos
                if (!uniqueRecommendations.has(product.nombre.toLowerCase()) || 
                    product.confianza > uniqueRecommendations.get(product.nombre.toLowerCase()).confianza) {
                  uniqueRecommendations.set(product.nombre.toLowerCase(), {
                    ...product,
                    sourceDayIndex: index,
                    sourceDay: prediccion.fecha
                  });
                }
              });
            }
          });
          
          // Convertir el mapa a array
          const combinedRecommendations = Array.from(uniqueRecommendations.values());
          console.log(`[AUTO] Combinación de recomendaciones finalizada: ${combinedRecommendations.length} productos únicos`);
          
          // Hacer lo mismo para productos coincidentes
          const uniqueCoincidentes = new Map();
          
          predicciones.forEach((prediccion, index) => {
            if (prediccion.resultado.productos_coincidentes && Array.isArray(prediccion.resultado.productos_coincidentes)) {
              prediccion.resultado.productos_coincidentes.forEach(product => {
                // Para productos coincidentes simplemente guardamos uno por nombre
                if (!uniqueCoincidentes.has(product.nombre.toLowerCase())) {
                  uniqueCoincidentes.set(product.nombre.toLowerCase(), {
                    ...product,
                    sourceDayIndex: index,
                    sourceDay: prediccion.fecha
                  });
                }
              });
            }
          });
          
          // Convertir el mapa a array
          const combinedCoincidentes = Array.from(uniqueCoincidentes.values());
          console.log(`[AUTO] Combinación de productos coincidentes finalizada: ${combinedCoincidentes.length} productos únicos`);
          
          // Calcular rango de fechas para la predicción combinada
          const dateRange = {
            start: predicciones[0].dateStr,
            end: predicciones[predicciones.length - 1].dateStr
          };
          
          // En lugar de guardar cada predicción diaria por separado, guardamos una única predicción combinada
          const combinedPredictionDocument = {
            timestamp,
            branch: sucursal,
            date: predicciones[0].dateStr, // Fecha del primer día como fecha principal
            predictions: combinedPredictions,
            isMultiDayPrediction: true,
            isMultiDayCombinedPrediction: true,
            combinedDaysCount: predicciones.length,
            dateRange,
            sourceDates: predicciones.map(p => ({ 
              date: p.dateStr,
              formattedDate: p.fecha,
              index: predicciones.indexOf(p)
            }))
          };
          
          console.log(`[AUTO] Guardando predicción combinada en ${predictionCollectionName}`);
          await db.collection(predictionCollectionName).insertOne(combinedPredictionDocument);
          
          // Guardar las recomendaciones combinadas
          const combinedRecommendationDocument = {
            timestamp,
            branch: sucursal,
            date: predicciones[0].dateStr,
            recommendations: combinedRecommendations,
            isMultiDayPrediction: true,
            isMultiDayCombinedPrediction: true,
            combinedDaysCount: predicciones.length,
            dateRange,
            sourceDates: predicciones.map(p => ({ 
              date: p.dateStr,
              formattedDate: p.fecha,
              index: predicciones.indexOf(p)
            }))
          };
          
          console.log(`[AUTO] Guardando recomendaciones combinadas en ${recommendationCollectionName}`);
          await db.collection(recommendationCollectionName).insertOne(combinedRecommendationDocument);
          
          // Guardar en el historial general
          const combinedHistoryDocument = {
            timestamp,
            branch: sucursal,
            date: predicciones[0].dateStr,
            formattedDate: predicciones[0].fecha,
            isWeeklyPrediction: false,
            isMultiDayPrediction: true,
            isMultiDayCombinedPrediction: true,
            combinedDaysCount: predicciones.length,
            multiDayPredictionIndex: 0,
            totalDays: 1, // Solo hay 1 registro que contiene todos los días
            predictions: combinedPredictions,
            recommendations: combinedRecommendations,
            productos_coincidentes: combinedCoincidentes,
            dateRange,
            sourceDates: predicciones.map(p => ({ 
              date: p.dateStr,
              formattedDate: p.fecha,
              index: predicciones.indexOf(p)
            }))
          };
          
          console.log(`[AUTO] Guardando predicción combinada en historial general (predictions_history)`);
          await db.collection('predictions_history').insertOne(combinedHistoryDocument);
          
          // Resultados para enviar en la respuesta
          results.push({
            sucursal,
            status: 'success',
            message: `Predicciones para ${predicciones.length} días combinadas y guardadas como una sola`,
            lastUpdate: timestamp,
            dateRange,
            days: predicciones.map(p => p.fecha),
            combinedCount: {
              predictions: combinedPredictions.length,
              recommendations: combinedRecommendations.length,
              coincidentes: combinedCoincidentes.length
            }
          });
          
          console.log(`[AUTO] Predicciones múltiples combinadas y guardadas para ${sucursal}`);
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