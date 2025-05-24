import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { ObjectId } from 'mongodb';

// Sistema de logs para API
function logApi(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [USER-ACTIVITY-API] [${level}]`;
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// Logger simplificado para esta API
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[USER-ACTIVITY-API] [INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`[USER-ACTIVITY-API] [ERROR] ${message}`, data ? JSON.stringify(data) : '');
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  try {
    const { userId, username, branch, sessionId, activityType, pageViews, metadata } = req.body;

    // Validar datos requeridos
    if (!userId || !username || !activityType) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: userId, username y activityType son obligatorios'
      });
    }

    const { db } = await connectToDatabase();
    
    // Fecha actual formateada como YYYY-MM-DD
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Registrar actividad dependiendo del tipo
    switch (activityType) {
      case 'session_start':
        // Iniciar nueva sesión
        await db.collection('user_sessions').insertOne({
          userId,
          username,
          branch: branch || 'No especificada',
          sessionId,
          startTime: new Date(),
          isActive: true,
          lastActivity: new Date(),
          userAgent: req.headers['user-agent'],
          ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          sessionDate: currentDate
        });
        
        logger.info(`Sesión iniciada: ${username}`, { userId, sessionId, branch });
        break;
        
      case 'session_end':
        // Finalizar sesión
        const session = await db.collection('user_sessions').findOne({
          sessionId,
          isActive: true
        });
        
        if (session) {
          const endTime = new Date();
          const sessionDuration = endTime.getTime() - new Date(session.startTime).getTime();
          
          await db.collection('user_sessions').updateOne(
            { sessionId, isActive: true },
            { 
              $set: {
                endTime,
                isActive: false,
                duration: sessionDuration,
                activityDetails: {
                  pageViews: pageViews || [],
                  lastPage: metadata?.currentPage || 'No especificada'
                }
              }
            }
          );
          
          // Actualizar estadísticas diarias
          await db.collection('user_daily_sessions').updateOne(
            { 
              userId, 
              sessionDate: currentDate,
              branch: branch || 'No especificada'
            },
            {
              $inc: {
                sessionCount: 1,
                totalActiveTime: sessionDuration,
                pageViews: (pageViews && Array.isArray(pageViews)) ? pageViews.length : 0
              },
              $set: {
                endTime
              },
              $setOnInsert: {
                username,
                branch: branch || 'No especificada',
                startTime: session.startTime
              }
            },
            { upsert: true }
          );
          
          logger.info(`Sesión finalizada: ${username}`, { 
            userId, 
            sessionId, 
            duration: Math.floor(sessionDuration / 1000) 
          });
        } else {
          logger.error(`No se encontró sesión activa: ${sessionId}`);
        }
        break;
        
      case 'heartbeat':
        // Actualizar tiempo de actividad
        await db.collection('user_sessions').updateOne(
          { sessionId, isActive: true },
          { 
            $set: {
              lastActivity: new Date(),
              'activityDetails.currentPage': metadata?.currentPage,
              'activityDetails.isIdle': metadata?.isIdle || false
            } 
          }
        );
        
        // Actualizar estadísticas de usuario
        await db.collection('user_activity_stats').updateOne(
          { userId },
          {
            $set: {
              lastActive: new Date(),
              username,
              branch: branch || 'No especificada'
            },
            $inc: {
              heartbeatCount: 1
            }
          },
          { upsert: true }
        );
        break;
        
      case 'page_view':
        // Registrar vista de página
        if (!metadata || !metadata.page) {
          return res.status(400).json({
            success: false,
            message: 'Falta información de la página visitada'
          });
        }
        
        await db.collection('user_page_views').insertOne({
          userId,
          username,
          branch: branch || 'No especificada',
          sessionId,
          timestamp: new Date(),
          page: metadata.page,
          referrer: metadata.referrer || '',
          module: metadata.module || 'No especificado',
          viewDate: currentDate
        });
        
        // Actualizar estadísticas de módulo
        if (metadata.module) {
          await db.collection('module_usage_stats').updateOne(
            { 
              module: metadata.module,
              date: currentDate
            },
            {
              $inc: { 
                viewCount: 1,
                [`userCounts.${userId}`]: 1
              }
            },
            { upsert: true }
          );
        }
        
        break;
        
      case 'user_action':
        // Registrar acción específica (como exportar Excel)
        if (!metadata || !metadata.action) {
          return res.status(400).json({
            success: false,
            message: 'Falta información de la acción realizada'
          });
        }
        
        // Registrar en logs del sistema
        await db.collection('system_log').insertOne({
          timestamp: new Date(),
          type: 'user_action',
          user: {
            userId,
            username,
            branch: branch || 'No especificada'
          },
          message: `${username} realizó: ${metadata.action}`,
          details: {
            action: metadata.action,
            page: metadata.page || 'No especificada',
            sessionId,
            actionData: metadata.actionData || {}
          },
          logDate: currentDate
        });
        
        // Si es una exportación, registrarla específicamente
        if (metadata.action === 'export_excel' || metadata.action === 'download_report') {
          await db.collection('user_exports').insertOne({
            userId,
            username,
            branch: branch || 'No especificada',
            timestamp: new Date(),
            exportType: metadata.action,
            fileName: metadata.actionData?.fileName || 'No especificado',
            filters: metadata.actionData?.filters || {},
            exportDate: currentDate
          });
        }
        
        logger.info(`Acción registrada: ${username} - ${metadata.action}`, { 
          userId, 
          branch, 
          actionData: metadata.actionData
        });
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: `Tipo de actividad no reconocido: ${activityType}`
        });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Actividad registrada correctamente'
    });
    
  } catch (error) {
    logger.error('Error al registrar actividad de usuario', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error interno al registrar actividad',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}

// These collections store historical user activity:
// 1. user_daily_sessions - Daily consolidated sessions
// 2. user_activity_stats - Overall user statistics
// 3. user_session_dates - Tracking unique active dates per user

async function updateUserActivityStats(db: any, userId: string, username: string, branch?: string, completedSession?: any) {
  // Get current stats
  let userStats = await db.collection('user_activity_stats').findOne({ userId });
  
  if (!userStats) {
    // Create new stats object if it doesn't exist
    logApi('INFO', `Creando nuevas estadísticas para usuario: ${username} (${userId})`);
    userStats = {
      userId,
      username,
      branch,
      totalSessions: 0, // Now counts days of activity
      totalActiveTime: 0,
      totalIdleTime: 0,
      totalInteractions: 0,
      averageSessionDuration: 0,
      averageActiveTimePerSession: 0,
      lastActive: new Date(),
      mostVisitedPages: []
    };
  }
  
  // Update last active time
  userStats.lastActive = new Date();
  
  // If this is a completed session component, and we're marking a session as final,
  // increment the session counter only if this is the first time we've seen this date
  if (completedSession && completedSession.sessionDate) {
    // Check if we've already counted this date
    const sessionDatesCount = await db.collection('user_session_dates')
      .countDocuments({ userId, sessionDate: completedSession.sessionDate });
    
    // IMPORTANT FIX: Always update active time, idle time and interactions
    // even if we've already counted this session date
    const newActiveTime = completedSession.totalActiveTime || 0;
    const newIdleTime = completedSession.totalIdleTime || 0;
    const newInteractions = completedSession.interactionCount || 0;
    
    logApi('INFO', `Actualizando estadísticas para ${username} - Activo: ${formatDuration(newActiveTime)}, Inactivo: ${formatDuration(newIdleTime)}, Int: ${newInteractions}`);
    
    // Update the cumulative stats
    userStats.totalActiveTime += newActiveTime;
    userStats.totalIdleTime += newIdleTime;
    userStats.totalInteractions += newInteractions;
    
    if (sessionDatesCount === 0) {
      // This is a new date - increment the counter and record it
      userStats.totalSessions += 1;
      await db.collection('user_session_dates').insertOne({
        userId,
        sessionDate: completedSession.sessionDate
      });
      
      logApi('INFO', `Registrando nuevo día de actividad para ${username}: ${completedSession.sessionDate}`);
    }
  }
  
  // Update or insert the stats
  await db.collection('user_activity_stats').updateOne(
    { userId },
    { $set: userStats },
    { upsert: true }
  );
  
  return userStats;
}

// Helper function to format duration for logging
function formatDuration(ms: number): string {
  if (!ms) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
