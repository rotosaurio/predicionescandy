import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../../lib/mongodb';

/**
 * API para gestionar las sesiones de actividad de usuario (V2)
 * Proporciona endpoints para iniciar, actualizar y finalizar sesiones
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
      action, 
      userId, 
      username, 
      branch, 
      sessionId,
      page,
      activeTime = 0, 
      timestamp = new Date()
    } = req.body;

    // Validar datos requeridos
    if (!action || !userId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: action, userId y sessionId son obligatorios'
      });
    }

    // Obtener fecha actual para agrupar registros
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = new Date();

    // Acciones disponibles: start_session, update_session, end_session
    switch (action) {
      case 'start_session': {
        // Registrar inicio de sesión
        await db.collection('user_sessions').insertOne({
          userId,
          username,
          branch: branch || 'No especificada',
          sessionId,
          startTime: currentTime,
          lastActivity: currentTime,
          activeTime: 0,
          isActive: true,
          currentPage: page || 'No especificada',
          sessionDate: currentDate
        });

        // Registrar también en user_daily_sessions para agrupar por día y sucursal
        await db.collection('user_daily_sessions').updateOne(
          { 
            userId, 
            branch: branch || 'No especificada',
            sessionDate: currentDate 
          },
          {
            $set: {
              username,
              lastActivity: currentTime
            },
            $inc: {
              sessionsCount: 1
            },
            $setOnInsert: {
              startTime: currentTime,
              totalActiveTime: 0
            }
          },
          { upsert: true }
        );

        return res.status(200).json({
          success: true,
          message: 'Sesión iniciada correctamente'
        });
      }
      
      case 'update_session': {
        // Actualizar sesión activa con tiempo acumulado
        await db.collection('user_sessions').updateOne(
          { sessionId, userId },
          { 
            $set: {
              lastActivity: currentTime,
              currentPage: page || 'No especificada'
            },
            $inc: {
              activeTime: activeTime
            }
          }
        );

        // Actualizar también en user_daily_sessions
        await db.collection('user_daily_sessions').updateOne(
          { 
            userId, 
            branch: branch || 'No especificada',
            sessionDate: currentDate 
          },
          {
            $set: {
              lastActivity: currentTime
            },
            $inc: {
              totalActiveTime: activeTime
            }
          },
          { upsert: true }
        );

        return res.status(200).json({
          success: true,
          message: 'Sesión actualizada correctamente'
        });
      }
      
      case 'end_session': {
        // Finalizar sesión activa
        await db.collection('user_sessions').updateOne(
          { sessionId, userId },
          { 
            $set: {
              lastActivity: currentTime,
              endTime: currentTime,
              isActive: false
            },
            $inc: {
              activeTime: activeTime
            }
          }
        );

        // Actualizar también en user_daily_sessions
        await db.collection('user_daily_sessions').updateOne(
          { 
            userId, 
            branch: branch || 'No especificada',
            sessionDate: currentDate 
          },
          {
            $set: {
              lastActivity: currentTime,
              endTime: currentTime
            },
            $inc: {
              totalActiveTime: activeTime
            }
          },
          { upsert: true }
        );

        // Actualizar estadísticas globales del usuario
        await db.collection('user_activity_stats').updateOne(
          { userId },
          {
            $set: {
              username,
              branch: branch || 'No especificada',
              lastActive: currentTime
            },
            $inc: {
              totalActiveTime: activeTime,
              totalSessions: 1
            },
            $addToSet: {
              sections: page || 'unknown'
            }
          },
          { upsert: true }
        );

        return res.status(200).json({
          success: true,
          message: 'Sesión finalizada correctamente'
        });
      }
      
      default:
        return res.status(400).json({
          success: false,
          message: `Acción desconocida: ${action}`
        });
    }
  } catch (error) {
    console.error('Error al procesar datos de sesión de usuario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: (error as Error).message
    });
  }
} 