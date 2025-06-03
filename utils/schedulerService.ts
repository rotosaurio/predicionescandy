import cron from 'node-cron';
import { connectToDatabase } from '../lib/mongodb';
import { sendActivityReport } from './emailService';

// Logger simplificado para no depender de módulos del cliente
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[SCHEDULER] [INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`[SCHEDULER] [ERROR] ${message}`, data ? JSON.stringify(data) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[SCHEDULER] [WARN] ${message}`, data ? JSON.stringify(data) : '');
  }
};

interface EmailConfig {
  destinationEmail: string;
  scheduledTime: string;  // Formato 'HH:MM' (24h)
  isActive: boolean;
}

interface ScheduledTask {
  id: string;
  task: cron.ScheduledTask;
}

// Lista de tareas programadas activas
const activeTasks: Map<string, ScheduledTask> = new Map();

/**
 * Convertir hora en formato HH:MM a expresión cron
 * @param time Hora en formato 'HH:MM'
 * @returns Expresión cron para ejecutar diariamente a esa hora
 */
export const timeToCronExpression = (time: string): string => {
  // Validar formato
  if (!/^\d{1,2}:\d{1,2}$/.test(time)) {
    throw new Error('Formato de hora inválido. Use HH:MM');
  }
  
  const [hours, minutes] = time.split(':').map(Number);
  
  // Validar valores
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Valores de hora o minutos inválidos');
  }
  
  // Formato: 'minutos hora * * *' (ejecutar diariamente a la hora especificada)
  return `${minutes} ${hours} * * *`;
};

/**
 * Genera el reporte de actividad de usuarios SOLO para las últimas 24 horas
 * Este reporte NO incluye datos históricos acumulados
 */
export const generateActivityReport = async (): Promise<any> => {
  try {
    logger.info('Generando reporte de actividad de usuarios para las últimas 24 horas');
    const { db } = await connectToDatabase();
    
    // Obtener fecha y hora actual para marcar el final del período
    const endDate = new Date();
    
    // Calcular fecha 24 horas atrás para el inicio del período
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - 24);
    
    // Formatear para logging
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    const yesterdayStr = startDate.toISOString().split('T')[0]; // Solo para compatibilidad

    logger.info(`Período del reporte: ${startDateStr} a ${endDateStr} (SOLO últimas 24 horas)`);
    
    // 1. PRIMERO: Obtener TODAS las sucursales que han existido alguna vez en el sistema
    // Esto incluirá sucursales que no han tenido actividad en las últimas 24 horas
    const allBranchesFromSessions = await db.collection('user_daily_sessions')
      .aggregate([
        { 
          $group: {
            _id: '$branch',
            lastActivity: { $max: '$lastActivity' },
            lastEndTime: { $max: '$endTime' }
          }
        },
        { 
          $project: {
            _id: 0,
            name: '$_id',
            lastActivity: { 
              $cond: {
                if: { $gte: ['$lastActivity', '$lastEndTime'] },
                then: '$lastActivity',
                else: '$lastEndTime'
              }
            }
          }
        }
      ])
      .toArray();

    // También obtener sucursales de user_sessions para asegurar cobertura completa
    const allBranchesFromUserSessions = await db.collection('user_sessions')
      .aggregate([
        { 
          $group: {
            _id: '$branch',
            lastActivity: { $max: '$lastActivity' }
          }
        },
        { 
          $project: {
            _id: 0,
            name: '$_id',
            lastActivity: 1
          }
        }
      ])
      .toArray();

    // Crear mapa de todas las sucursales con su última actividad
    const allBranchesMap = new Map();
    
    // Agregar sucursales de user_daily_sessions
    allBranchesFromSessions.forEach((branch: any) => {
      const branchName = branch.name || 'No especificada';
      allBranchesMap.set(branchName, {
        name: branchName,
        lastActivity: branch.lastActivity
      });
    });

    // Agregar sucursales de user_sessions (actualizando la fecha si es más reciente)
    allBranchesFromUserSessions.forEach((branch: any) => {
      const branchName = branch.name || 'No especificada';
      if (!allBranchesMap.has(branchName)) {
        allBranchesMap.set(branchName, {
          name: branchName,
          lastActivity: branch.lastActivity
        });
      } else {
        const existing = allBranchesMap.get(branchName);
        if (branch.lastActivity && (!existing.lastActivity || new Date(branch.lastActivity) > new Date(existing.lastActivity))) {
          existing.lastActivity = branch.lastActivity;
        }
      }
    });

    logger.info(`Encontradas ${allBranchesMap.size} sucursales totales en el sistema`);
    
    // 2. Buscar actividad RECIENTE (últimas 24 horas) en todas las colecciones relevantes
    
    // Consultar actividad en user_daily_sessions para las últimas 24 horas
    const recentBranchActivity = await db.collection('user_daily_sessions')
      .aggregate([
        { 
          $match: { 
            // Filtrar estrictamente para asegurar que solo obtenemos actividad en las últimas 24 horas
            lastActivity: { $gte: startDate, $lte: endDate }
          } 
        },
        { $group: {
            _id: '$branch',
            totalActiveTime: { $sum: '$totalActiveTime' },
            totalUsers: { $addToSet: '$userId' },
            lastConnection: { $max: '$endTime' }
          }
        },
        { $project: {
            _id: 0,
            name: '$_id',
            totalActiveTime: 1,
            activeUsers: { $size: '$totalUsers' },
            lastConnection: 1
          }
        },
        { $sort: { totalActiveTime: -1 } }
      ])
      .toArray();
    
    // Asegurarse de incluir también las interacciones diarias aunque el tiempo activo sea 0
    // Consultar registros de interacciones en la última ventana de 24 horas
    const dailyInteractions = await db.collection('system_log')
      .aggregate([
        { 
          $match: { 
            // Filtrar estrictamente por timestamp entre startDate y endDate
            timestamp: { $gte: startDate, $lte: endDate },
            type: 'user_action'
          } 
        },
        { 
          $group: {
            _id: '$user.branch',
            totalInteractions: { $sum: 1 },
            users: { $addToSet: '$user.userId' }
          }
        },
        { 
          $project: {
            _id: 0,
            name: '$_id',
            totalInteractions: 1,
            uniqueUsers: { $size: '$users' }
          }
        }
      ])
      .toArray();
    
    // Obtener sesiones activas de las últimas 24 horas
    const recentActiveSessions = await db.collection('user_sessions')
      .find({
        lastActivity: { $gte: startDate, $lte: endDate } // Filtro explícito para el rango de 24 horas
      })
      .toArray();
    
    // Crear un mapa de actividad reciente
    const recentActivityMap = new Map();
    recentActiveSessions.forEach((session: any) => {
      // Verificar explícitamente que la actividad está dentro del rango de 24 horas
      if (new Date(session.lastActivity) >= startDate && new Date(session.lastActivity) <= endDate) {
        const branchName = session.branch || 'No especificada';
        if (!recentActivityMap.has(branchName)) {
          recentActivityMap.set(branchName, {
            name: branchName,
            totalActiveTime: 0,
            activeUsers: new Set(),
            lastConnection: session.lastActivity
          });
        } else {
          const branch = recentActivityMap.get(branchName);
          if (new Date(session.lastActivity) > new Date(branch.lastConnection)) {
            branch.lastConnection = session.lastActivity;
          }
          branch.activeUsers.add(session.userId);
        }
      }
    });
    
    // Incorporar los datos de interacciones al mapa de actividad reciente
    dailyInteractions.forEach((interaction: any) => {
      const branchName = interaction.name || 'No especificada';
      if (!recentActivityMap.has(branchName)) {
        recentActivityMap.set(branchName, {
          name: branchName,
          totalActiveTime: 0,
          activeUsers: new Set(),
          lastConnection: new Date(),
          totalInteractions: interaction.totalInteractions
        });
      } else {
        const branch = recentActivityMap.get(branchName);
        branch.totalInteractions = interaction.totalInteractions;
      }
    });
    
    // 3. Obtener exportaciones y otras acciones de las últimas 24 horas EXCLUSIVAMENTE
    const userActions = await db.collection('system_log')
      .find({
        type: 'user_action',
        'details.action': { $in: ['export_excel', 'download_report', 'generate_prediction', 'view_prediction'] },
        timestamp: { $gte: startDate, $lte: endDate } // Filtro explícito para el rango de 24 horas
      })
      .toArray();
    
    // 4. Obtener logs de exportaciones específicos SOLO de las últimas 24 horas
    const exportLogs = await db.collection('user_exports')
      .find({
        timestamp: { $gte: startDate, $lte: endDate } // Filtro explícito para el rango de 24 horas
      })
      .toArray();
    
    // Agrupar acciones por sucursal
    const branchActions: { [key: string]: { exports: number, downloads: number, predictions: number, views: number } } = {};
    
    // Procesar logs de sistema
    userActions.forEach((action: any) => {
      // Verificar explícitamente que la acción está dentro del período de 24 horas
      if (new Date(action.timestamp) >= startDate && new Date(action.timestamp) <= endDate) {
        const branch = action?.user?.branch || 'No especificada';
        if (!branchActions[branch]) {
          branchActions[branch] = {
            exports: 0,
            downloads: 0,
            predictions: 0,
            views: 0
          };
        }
        
        if (action.details?.action === 'export_excel') {
          branchActions[branch].exports += 1;
        } else if (action.details?.action === 'download_report') {
          branchActions[branch].downloads += 1;
        } else if (action.details?.action === 'generate_prediction') {
          branchActions[branch].predictions += 1;
        } else if (action.details?.action === 'view_prediction') {
          branchActions[branch].views += 1;
        }
      }
    });
    
    // Procesar logs de exportaciones (pueden contener datos adicionales)
    exportLogs.forEach((export_: any) => {
      // Verificar explícitamente que la exportación está dentro del período de 24 horas
      if (new Date(export_.timestamp) >= startDate && new Date(export_.timestamp) <= endDate) {
        const branch = export_?.branch || 'No especificada';
        if (!branchActions[branch]) {
          branchActions[branch] = {
            exports: 0,
            downloads: 0,
            predictions: 0,
            views: 0
          };
        }
        branchActions[branch].exports += 1;
      }
    });
    
    // Obtener acciones más recientes para cada sucursal (SOLO últimas 24 horas)
    const recentActions = await db.collection('system_log')
      .aggregate([
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate } // Filtro explícito para el rango de 24 horas
          }
        },
        {
          $sort: { timestamp: -1 }
        },
        {
          $group: {
            _id: '$user.branch',
            latestAction: { $first: '$$ROOT' }
          }
        },
        {
          $project: {
            _id: 0,
            branch: '$_id',
            action: '$latestAction.message',
            username: '$latestAction.user.username',
            timestamp: '$latestAction.timestamp'
          }
        }
      ])
      .toArray();
    
    // 5. COMBINAR: Crear lista de TODAS las sucursales con sus datos
    const combinedBranches = Array.from(allBranchesMap.values()).map((branch: any) => {
      const branchName = branch.name;
      
      // Buscar en branchActivity (datos de user_daily_sessions de las últimas 24 horas)
      const recentActivityData = recentBranchActivity.find((b: any) => b.name === branchName);
      
      // Buscar en recent activity map (datos de user_sessions de las últimas 24 horas)
      const recentSessionData = recentActivityMap.get(branchName);
      
      // Determinar la última conexión: usar la más reciente entre la histórica y la de las últimas 24 horas
      let lastConnection = branch.lastActivity; // Última actividad histórica de esta sucursal
      
      // Si hay actividad reciente, usarla si es más reciente que la histórica
      if (recentActivityData?.lastConnection && 
          new Date(recentActivityData.lastConnection) > new Date(lastConnection || 0)) {
        lastConnection = recentActivityData.lastConnection;
      }
      
      if (recentSessionData?.lastConnection && 
          new Date(recentSessionData.lastConnection) > new Date(lastConnection || 0)) {
        lastConnection = recentSessionData.lastConnection;
      }
      
      const result: {
        name: any;
        totalActiveTime: number;
        activeUsers: number;
        lastConnection: any;
        actions: {
          exports: number;
          downloads: number;
          predictions: number;
          views: number;
        };
        recentActivity?: {
          action: string;
          username: string;
          timestamp: string;
        };
      } = {
        name: branchName,
        // Solo incluir tiempo activo de las últimas 24 horas
        totalActiveTime: (recentActivityData?.totalActiveTime || 0) + (recentSessionData?.totalActiveTime || 0),
        activeUsers: recentActivityData?.activeUsers || recentSessionData?.activeUsers?.size || 0,
        lastConnection: lastConnection, // Esta será la última conexión histórica
        // Acciones de las últimas 24 horas
        actions: branchActions[branchName] || {
          exports: 0,
          downloads: 0,
          predictions: 0,
          views: 0
        }
      };
      
      // Añadir última acción si existe (solo de las últimas 24 horas)
      const recentAction = recentActions.find((a: any) => a.branch === branchName);
      if (recentAction) {
        // Verificar que la última acción está dentro del período de 24 horas
        if (new Date(recentAction.timestamp) >= startDate && new Date(recentAction.timestamp) <= endDate) {
          result.recentActivity = {
            action: recentAction.action,
            username: recentAction.username,
            timestamp: formatDate(recentAction.timestamp)
          };
        }
      }
      
      return result;
    });
    
    // Formatear tiempos activos para todas las sucursales (solo últimas 24 horas)
    const formattedBranches = combinedBranches.map(branch => ({
      ...branch,
      totalActiveTime: formatDuration(branch.totalActiveTime),
      lastConnection: formatDate(branch.lastConnection)
    }));

    // Ordenar por última conexión (más reciente primero)
    formattedBranches.sort((a, b) => {
      const dateA = a.lastConnection ? new Date(a.lastConnection).getTime() : 0;
      const dateB = b.lastConnection ? new Date(b.lastConnection).getTime() : 0;
      return dateB - dateA;
    });
    
    // Consultar usuarios más activos
    const userActivity = await db.collection('user_daily_sessions')
      .aggregate([
        {
          $match: {
            // Filtrar estrictamente por actividad en las últimas 24 horas
            lastActivity: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$userId',
            username: { $first: '$username' },
            branch: { $first: '$branch' },
            totalActiveTime: { $sum: '$totalActiveTime' },
            totalIdleTime: { $sum: '$totalIdleTime' },
            totalInteractions: { $sum: '$interactionCount' },
            lastActive: { $max: '$lastActivity' },
            sections: { $addToSet: '$currentPage' }
          }
        },
        { $sort: { lastActive: -1 } },
        { $limit: 10 }
      ])
      .toArray();
    
    // Formatear datos de usuarios (solo para las últimas 24 horas)
    const users = userActivity.map((user: any) => ({
      username: user.username,
      branch: user.branch,
      activeTime: formatDuration(user.totalActiveTime || 0),
      lastActivity: formatDate(user.lastActive || new Date()),
      sections: user.sections || [],
      totalSessions: 1, // Solo contamos 1 día de actividad
      totalPageViews: user.totalInteractions || 0
    }));
    
    // Obtener total de predicciones generadas
    const predictionsCount = await db.collection('predictions_history')
      .countDocuments({
        timestamp: { $gte: startDate, $lte: endDate } // Añadir límite superior explícito
      });
    
    // Obtener errores del sistema para incluir en el reporte (SOLO últimas 24 horas)
    const systemErrors = await db.collection('system_log')
      .find({
        type: 'error',
        timestamp: { $gte: startDate, $lte: endDate } // Filtro explícito para el rango de 24 horas
      })
      .limit(10)
      .toArray();
    
    // Formatear errores para el reporte
    const errors = systemErrors.map((error: any) => ({
      message: error.message,
      component: error.details?.componentName || 'No especificado',
      timestamp: formatDate(error.timestamp)
    }));
    
    logger.info(`Reporte generado: ${formattedBranches.length} sucursales, ${users.length} usuarios, ${predictionsCount} predicciones`);
    
    return {
      generatedAt: new Date().toISOString(),
      date: yesterdayStr,
      reportPeriod: {
        start: startDateStr,
        end: endDateStr,
        hours: 24
      },
      reportType: "last_24_hours_only", // Indicador explícito del tipo de reporte
      branches: formattedBranches,
      users,
      predictions: {
        total: predictionsCount
      },
      systemHealth: {
        errors: errors,
        errorCount: systemErrors.length
      }
    };
  } catch (error) {
    logger.error('Error al generar reporte de actividad', error);
    throw error;
  }
};

/**
 * Tarea para enviar reporte de actividad por correo
 */
export const sendActivityReportTask = async (): Promise<void> => {
  try {
    logger.info('Iniciando tarea de envío de reporte de actividad');
    
    // Obtener configuración de correo
    const { db } = await connectToDatabase();
    const config = await db.collection('email_config').findOne({ isActive: true });
    
    if (!config || !config.destinationEmail) {
      logger.warn('No hay configuración de correo activa para enviar el reporte');
      return;
    }
    
    // Generar reporte
    const reportData = await generateActivityReport();
    
    // Verificar si hay múltiples destinatarios
    const emails = config.destinationEmail.includes(',') 
      ? config.destinationEmail.split(',').map((email: string) => email.trim())
      : [config.destinationEmail];
    
    // Enviar correo a cada destinatario
    let successCount = 0;
    
    for (const email of emails) {
      try {
        const success = await sendActivityReport(email, reportData);
        if (success) {
          successCount++;
          logger.info(`Reporte de actividad enviado exitosamente a ${email}`);
        } else {
          logger.error(`Error al enviar reporte de actividad a ${email}`);
        }
      } catch (error) {
        logger.error(`Error al enviar reporte a ${email}`, error);
      }
    }
    
    logger.info(`Envío de reportes completado. Éxitos: ${successCount}/${emails.length}`);
  } catch (error) {
    logger.error('Error en tarea de envío de reporte', error);
  }
};

/**
 * Programar tarea de envío de reporte de actividad
 * @param config Configuración de correo
 * @returns ID de la tarea programada
 */
export const scheduleActivityReport = async (config: EmailConfig): Promise<string> => {
  try {
    // Detener tarea existente si hay alguna
    await stopAllTasks();
    
    // Convertir la hora a expresión cron
    const cronExpression = timeToCronExpression(config.scheduledTime);
    
    // Validar expresión cron
    if (!cron.validate(cronExpression)) {
      throw new Error(`Expresión cron inválida: ${cronExpression}`);
    }
    
    // Crear ID único para esta tarea
    const taskId = `activity_report_${Date.now()}`;
    
    // Programar tarea
    const task = cron.schedule(cronExpression, sendActivityReportTask, {
      scheduled: config.isActive,
      timezone: 'America/Mexico_City' // Ajustar a la zona horaria adecuada
    });
    
    // Guardar tarea activa
    activeTasks.set(taskId, { id: taskId, task });
    
    logger.info(`Tarea de envío de reporte programada para ejecutarse todos los días a las ${config.scheduledTime}`, {
      cronExpression,
      destinationEmail: config.destinationEmail,
      isActive: config.isActive
    });
    
    return taskId;
  } catch (error) {
    logger.error('Error al programar tarea de envío de reporte', error);
    throw error;
  }
};

/**
 * Detener todas las tareas programadas activas
 */
export const stopAllTasks = async (): Promise<void> => {
  try {
    // Detener cada tarea
    const taskIds = Array.from(activeTasks.keys());
    
    for (const taskId of taskIds) {
      const scheduledTask = activeTasks.get(taskId);
      if (scheduledTask) {
        scheduledTask.task.stop();
        activeTasks.delete(taskId);
        logger.info(`Tarea detenida: ${taskId}`);
      }
    }
  } catch (error) {
    logger.error('Error al detener tareas programadas', error);
  }
};

/**
 * Inicializar el servicio de tareas programadas
 */
export const initScheduler = async (): Promise<void> => {
  // Verificar que estamos en el servidor
  if (typeof window !== 'undefined') {
    logger.warn('initScheduler: No se puede inicializar en el navegador');
    return;
  }
  
  try {
    logger.info('Inicializando servicio de tareas programadas');
    
    // Obtener configuración de correo de la base de datos
    const { db } = await connectToDatabase();
    const config = await db.collection('email_config').findOne({ isActive: true });
    
    if (config && config.isActive) {
      await scheduleActivityReport(config);
      logger.info('Tarea de envío de reporte iniciada desde configuración existente');
    } else {
      logger.info('No hay tareas de envío de reportes configuradas');
    }
  } catch (error) {
    logger.error('Error al inicializar servicio de tareas programadas', error);
  }
};

// Funciones auxiliares de formato
function formatDuration(ms: number): string {
  if (!ms) return '0h 0m 0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

function formatDate(date: Date | string | null): string {
  if (!date) return 'No disponible';
  
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
} 