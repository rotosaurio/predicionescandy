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
  // Manejar peticiones GET para obtener estadísticas de actividad
  if (req.method === 'GET') {
    try {
      const { db } = await connectToDatabase();
      const userId = req.query.userId as string;
      
      logger.info(`Obteniendo estadísticas de actividad${userId ? ` para usuario: ${userId}` : ' para todos los usuarios'}`);
      
      if (userId) {
        // Obtener estadísticas para un usuario específico
        const userStats = await db.collection('user_activity_stats').findOne({ userId });
        
        if (!userStats) {
          logger.info(`No se encontraron estadísticas para el usuario: ${userId}`);
          return res.status(404).json({
            success: false,
            message: 'No se encontraron estadísticas para este usuario'
          });
        }
        
        // Obtener sesiones recientes del usuario
        const recentSessions = await db.collection('user_daily_sessions')
          .find({ userId })
          .sort({ sessionDate: -1 })
          .limit(10)
          .toArray();
          
        logger.info(`Estadísticas encontradas para usuario: ${userId}`, { 
          totalSessions: userStats.totalSessions,
          lastActive: userStats.lastActive
        });
        
        return res.status(200).json({
          success: true,
          userStats,
          recentSessions
        });
      } else {
        // Obtener estadísticas para todos los usuarios
        const stats = await db.collection('user_activity_stats')
          .find({})
          .sort({ lastActive: -1 })
          .limit(100)
          .toArray();
          
        logger.info(`Obtenidas estadísticas para ${stats.length} usuarios`);
        
        return res.status(200).json({
          success: true,
          stats
        });
      }
    } catch (error) {
      logger.error('Error al obtener estadísticas de actividad', error);
      
      return res.status(500).json({
        success: false,
        message: 'Error interno al obtener estadísticas de actividad',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }
  
  // Manejar peticiones POST para registrar actividad
  if (req.method === 'POST') {
    try {
      const { userId, username, branch, sessionId, activityType, pageViews, metadata } = req.body;

      // Validar datos requeridos
      if (!userId || !username || !activityType) {
        return res.status(400).json({
          success: false,
          message: 'Faltan datos requeridos: userId, username y activityType son obligatorios'
        });
      }

      let db;
      try {
        const dbConnection = await connectToDatabase();
        db = dbConnection.db;
      } catch (dbError) {
        logger.error('Error al conectar con la base de datos:', dbError);
        return res.status(503).json({
          success: false,
          message: 'Error de conexión a la base de datos',
          error: dbError instanceof Error ? dbError.message : 'Error desconocido'
        });
      }
      
      // Fecha actual formateada como YYYY-MM-DD
      const currentDate = new Date().toISOString().split('T')[0];
      const currentTime = new Date();
      
      // Registrar actividad dependiendo del tipo
      try {
        switch (activityType) {
          case 'session_start':
            // Verificar si hay una sesión activa y cerrarla primero
            const activeSession = await db.collection('user_sessions').findOne({
              userId,
              isActive: true
            });
            
            if (activeSession) {
              logger.info(`Cerrando sesión activa previa para usuario: ${username}`, { 
                userId, 
                oldSessionId: activeSession.sessionId 
              });
              
              const endTime = currentTime;
              const sessionDuration = endTime.getTime() - new Date(activeSession.startTime).getTime();
              
              await db.collection('user_sessions').updateOne(
                { _id: activeSession._id },
                { 
                  $set: {
                    endTime,
                    isActive: false,
                    duration: sessionDuration,
                    activityDetails: {
                      pageViews: activeSession.activityDetails?.pageViews || [],
                      lastPage: activeSession.activityDetails?.currentPage || 'No especificada'
                    }
                  }
                }
              );
            }
            
            // Iniciar nueva sesión
            await db.collection('user_sessions').insertOne({
              userId,
              username,
              branch: branch || 'No especificada',
              sessionId,
              startTime: currentTime,
              isActive: true,
              lastActivity: currentTime,
              userAgent: req.headers['user-agent'],
              ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
              sessionDate: currentDate
            });
            
            // Actualizar estadísticas de usuario
            await updateUserActivityStats(db, userId, username, branch);
            
            logger.info(`Sesión iniciada: ${username}`, { userId, sessionId, branch });
            break;
            
          case 'session_end':
            // Finalizar sesión
            const session = await db.collection('user_sessions').findOne({
              sessionId,
              isActive: true
            });
            
            if (session) {
              const endTime = currentTime;
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
                    endTime,
                    lastActivity: currentTime
                  },
                  $setOnInsert: {
                    username,
                    branch: branch || 'No especificada',
                    startTime: session.startTime
                  }
                },
                { upsert: true }
              );

              // Actualizar estadísticas generales del usuario con la sesión completada
              const completedSession = {
                sessionDate: currentDate,
                totalActiveTime: sessionDuration,
                totalIdleTime: 0,
                interactionCount: (pageViews && Array.isArray(pageViews)) ? pageViews.length : 0
              };
              
              await updateUserActivityStats(db, userId, username, branch, completedSession);

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
            // Actualizar tiempo de actividad en la sesión
            try {
              const updatedSession = await db.collection('user_sessions').findOneAndUpdate(
                { sessionId, isActive: true },
                { 
                  $set: {
                    lastActivity: currentTime,
                    'activityDetails.currentPage': metadata?.currentPage,
                    'activityDetails.isIdle': metadata?.isIdle || false
                  } 
                },
                { returnDocument: 'after' }
              );
              
              if (!updatedSession.value) {
                // Si no hay sesión activa, puede que sea porque se cerró automáticamente
                // o porque nunca se inició. Creamos una nueva silenciosamente.
                logger.info(`No se encontró sesión activa para heartbeat, creando nueva: ${username}`, { userId, sessionId });
                
                await db.collection('user_sessions').insertOne({
                  userId,
                  username,
                  branch: branch || 'No especificada',
                  sessionId,
                  startTime: currentTime,
                  isActive: true,
                  lastActivity: currentTime,
                  userAgent: req.headers['user-agent'],
                  ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                  sessionDate: currentDate,
                  activityDetails: {
                    currentPage: metadata?.currentPage,
                    isIdle: metadata?.isIdle || false
                  }
                });
                
                await updateUserActivityStats(db, userId, username, branch);
              }
              
              // Actualizar entrada de actividad diaria
              await db.collection('user_daily_sessions').updateOne(
                { 
                  userId, 
                  sessionDate: currentDate,
                  branch: branch || 'No especificada'
                },
                {
                  $set: {
                    lastActivity: currentTime
                  },
                  $setOnInsert: {
                    username,
                    branch: branch || 'No especificada',
                    startTime: currentTime,
                    sessionCount: 0,
                    totalActiveTime: 0,
                    pageViews: 0
                  }
                },
                { upsert: true }
              );
              
              // Solo actualizar estadísticas generales, no incrementar contadores
              await db.collection('user_activity_stats').updateOne(
                { userId },
                {
                  $set: {
                    lastActive: currentTime,
                    username,
                    branch: branch || 'No especificada'
                  }
                },
                { upsert: true }
              );
            } catch (heartbeatError) {
              logger.error(`Error al procesar heartbeat para el usuario ${username}:`, heartbeatError);
              // Continuamos para que al menos se devuelva una respuesta exitosa
            }
            break;
            
          case 'page_view':
            // Registrar vista de página
            try {
              // Actualizar sesión actual con la nueva página
              await db.collection('user_sessions').updateOne(
                { sessionId, isActive: true },
                { 
                  $set: {
                    lastActivity: currentTime,
                    'activityDetails.currentPage': metadata.page || 'No especificada'
                  },
                  $push: {
                    'activityDetails.pageViews': {
                      page: metadata.page || 'No especificada',
                      timestamp: currentTime
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
                    pageViews: 1
                  },
                  $set: {
                    lastActivity: currentTime
                  },
                  $setOnInsert: {
                    username,
                    branch: branch || 'No especificada',
                    startTime: currentTime,
                    sessionCount: 0,
                    totalActiveTime: 0
                  }
                },
                { upsert: true }
              );
              
              // Actualizar estadísticas generales
              await db.collection('user_activity_stats').updateOne(
                { userId },
                {
                  $set: {
                    lastActive: currentTime,
                    username,
                    branch: branch || 'No especificada'
                  },
                  $inc: {
                    totalPageViews: 1
                  }
                },
                { upsert: true }
              );
            } catch (pageViewError) {
              logger.error(`Error al registrar vista de página para el usuario ${username}:`, pageViewError);
              // Continuamos para que al menos se devuelva una respuesta exitosa
            }
            
            logger.info(`Vista de página registrada: ${username} - ${metadata.page}`, { 
              userId,
              sessionId,
              module: metadata.module || 'No especificado'
            });
            break;
            
          case 'user_action':
            // Registrar acción específica (como exportar Excel)
            if (!metadata || !metadata.action) {
              return res.status(400).json({
                success: false,
                message: 'Falta información de la acción realizada'
              });
            }
            
            try {
              // Registrar en logs del sistema
              await db.collection('system_log').insertOne({
                timestamp: currentTime,
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
                  timestamp: currentTime,
                  exportType: metadata.action,
                  fileName: metadata.actionData?.fileName || 'No especificado',
                  filters: metadata.actionData?.filters || {},
                  exportDate: currentDate
                });
              }
              
              // Actualizar estadísticas del usuario
              await db.collection('user_activity_stats').updateOne(
                { userId },
                {
                  $set: {
                    lastActive: currentTime,
                    username,
                    branch: branch || 'No especificada'
                  },
                  $inc: {
                    totalInteractions: 1
                  }
                },
                { upsert: true }
              );
            } catch (actionError) {
              logger.error(`Error al registrar acción '${metadata.action}' para el usuario ${username}:`, actionError);
              // Continuamos para que al menos se devuelva una respuesta exitosa
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
      } catch (switchError) {
        logger.error(`Error al procesar actividad de tipo '${activityType}' para usuario ${username}:`, switchError);
        // No retornamos error para que el cliente no falle, pero lo registramos
      }
      
      return res.status(200).json({
        success: true,
        message: 'Actividad registrada correctamente'
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      logger.error('Error al registrar actividad de usuario', { error: errorMessage });
      
      // Siempre devolver 200 para evitar que el cliente se detenga por errores
      // Los errores se registran pero permitimos que la aplicación continúe
      return res.status(200).json({
        success: false,
        message: 'Se registró el error pero se permite continuar',
        error: errorMessage
      });
    }
  }
  
  // Si el método no es GET ni POST, devolver error
  return res.status(405).json({ 
    success: false, 
    message: 'Método no permitido. Solo se aceptan peticiones GET y POST' 
  });
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
      totalPageViews: 0,
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
  if (!ms) return '0h 0m 0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}
