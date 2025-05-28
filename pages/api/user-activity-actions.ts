import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

/**
 * Endpoint para registrar acciones específicas de usuario (alternativa al heartbeat)
 * Registra acciones como: exportaciones, visualizaciones, generación de reportes, etc.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Método no permitido'
    });
  }

  try {
    const { db } = await connectToDatabase();
    const { 
      userId, 
      username, 
      branch, 
      actionType, 
      metadata = {},
      sessionId = null,
      timestamp = new Date()
    } = req.body;

    // Validar datos requeridos
    if (!userId || !username || !actionType) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: userId, username y actionType son obligatorios'
      });
    }

    // Obtener fecha actual para agrupar registros
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = new Date();

    // Calcular duración de la acción (si se proporciona)
    let actionDuration = metadata.duration || null;

    // Registrar la acción en system_log
    await db.collection('system_log').insertOne({
      timestamp: currentTime,
      type: 'user_action',
      user: {
        userId,
        username,
        branch: branch || 'No especificada'
      },
      message: `${username} realizó: ${actionType}`,
      details: {
        action: actionType,
        page: metadata.page || 'No especificada',
        sessionId,
        actionData: metadata.actionData || {},
        duration: actionDuration
      },
      logDate: currentDate
    });

    // Si es una exportación, registrarla específicamente
    if (actionType === 'export_excel' || actionType === 'download_report') {
      await db.collection('user_exports').insertOne({
        userId,
        username,
        branch: branch || 'No especificada',
        timestamp: currentTime,
        exportType: actionType,
        fileName: metadata.actionData?.fileName || 'No especificado',
        filters: metadata.actionData?.filters || {},
        exportDate: currentDate
      });
    }

    // Actualizar también las estadísticas del usuario para reflejar esta actividad
    // Esto ayuda a calcular el tiempo activo sin depender del heartbeat
    await db.collection('user_activity_stats').updateOne(
      { userId },
      {
        $set: {
          username,
          branch: branch || 'No especificada',
          lastActive: currentTime
        },
        $inc: {
          totalActions: 1,
          totalActiveTime: actionDuration || 0
        },
        $addToSet: {
          sections: metadata.page || 'unknown'
        }
      },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Acción registrada correctamente'
    });
  } catch (error) {
    console.error('Error al registrar acción de usuario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: (error as Error).message
    });
  }
} 