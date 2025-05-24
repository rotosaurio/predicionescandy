import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

const COLLECTION_NAME = 'system_logs';

// Sistema de logs para esta API
function logApi(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [SYSTEM-LOG-API] [${level}]`;
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    logApi('ERROR', `Método no permitido: ${req.method}`);
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  try {
    const { db } = await connectToDatabase();
    
    // Extraer datos del cuerpo de la solicitud
    const {
      type,
      message,
      timestamp,
      userId,
      username,
      userRole,
      userBranch,
      details,
      userAgent,
      path
    } = req.body;

    // Validar datos mínimos requeridos
    if (!type || !message) {
      logApi('ERROR', 'Faltan datos requeridos en el log del sistema');
      return res.status(400).json({ success: false, message: 'Tipo y mensaje son campos requeridos' });
    }

    // Crear documento de log
    const logDocument = {
      type,
      message,
      timestamp: timestamp || new Date().toISOString(),
      user: {
        id: userId,
        username,
        role: userRole,
        branch: userBranch
      },
      details,
      clientInfo: {
        userAgent,
        path,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
      },
      recorded_at: new Date()
    };

    logApi('INFO', `Guardando log de sistema: [${type}] ${message}`, { 
      user: username || 'anonymous',
      path: path || 'unknown'
    });

    // Asegurar que la colección exista
    try {
      await db.createCollection(COLLECTION_NAME);
      logApi('INFO', `Colección ${COLLECTION_NAME} creada exitosamente`);
    } catch (e) {
      // La colección ya existe, lo cual está bien
      logApi('INFO', `La colección ${COLLECTION_NAME} ya existe`);
    }

    // Guardar el log en la base de datos
    const result = await db.collection(COLLECTION_NAME).insertOne(logDocument);

    if (result.acknowledged) {
      return res.status(201).json({
        success: true,
        message: 'Log guardado correctamente',
        id: result.insertedId
      });
    } else {
      throw new Error('Error al insertar en la base de datos');
    }

  } catch (error) {
    logApi('ERROR', 'Error en API de logs del sistema:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
} 