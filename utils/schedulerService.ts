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
 * Genera el reporte de actividad de usuarios
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

    logger.info(`Período del reporte: ${startDateStr} a ${endDateStr}`);
    
    // Buscar actividad en todas las colecciones relevantes para las últimas 24 horas
    
    // 1. Consultar actividad en user_daily_sessions para todas las sucursales
    const branchActivity = await db.collection('user_daily_sessions')
      .aggregate([
        { 
          $match: { 
            // Obtener registros con fecha de sesión reciente o última actividad en las últimas 24 horas
            $or: [
              { sessionDate: { $gte: yesterdayStr } },
              { lastActivity: { $gte: startDate } }
            ]
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
    
    // 2. Obtener todas las sucursales activas de user_sessions para asegurar capturar todas
    const activeSessions = await db.collection('user_sessions')
      .find({
        lastActivity: { $gte: startDate }
      })
      .toArray();
    
    // Crear un mapa de sucursales desde las sesiones activas
    const branchMap = new Map();
    activeSessions.forEach(session => {
      const branchName = session.branch || 'No especificada';
      if (!branchMap.has(branchName)) {
        branchMap.set(branchName, {
          name: branchName,
          totalActiveTime: 0,
          activeUsers: new Set(),
          lastConnection: session.lastActivity
        });
      } else {
        const branch = branchMap.get(branchName);
        if (new Date(session.lastActivity) > new Date(branch.lastConnection)) {
          branch.lastConnection = session.lastActivity;
        }
        branch.activeUsers.add(session.userId);
      }
    });
    
    // Convertir mapa a array
    const additionalBranches = Array.from(branchMap.values()).map(branch => ({
      name: branch.name,
      totalActiveTime: branch.totalActiveTime || 0,
      activeUsers: branch.activeUsers.size,
      lastConnection: branch.lastConnection
    }));
    
    // 3. Obtener exportaciones y otras acciones de las últimas 24 horas
    const userActions = await db.collection('system_log')
      .find({
        type: 'user_action',
        'details.action': { $in: ['export_excel', 'download_report', 'generate_prediction', 'view_prediction'] },
        timestamp: { $gte: startDate }
      })
      .toArray();
    
    // 4. Obtener logs de exportaciones específicos
    const exportLogs = await db.collection('user_exports')
      .find({
        timestamp: { $gte: startDate }
      })
      .toArray();
    
    // Agrupar acciones por sucursal
    const branchActions: { [key: string]: { exports: number, downloads: number, predictions: number, views: number } } = {};
    
    // Procesar logs de sistema
    userActions.forEach((action: any) => {
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
    });
    
    // Procesar logs de exportaciones (pueden contener datos adicionales)
    exportLogs.forEach((export_: any) => {
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
    });
    
    // Obtener acciones más recientes para cada sucursal
    const recentActions = await db.collection('system_log')
      .aggregate([
        {
          $match: {
            timestamp: { $gte: startDate }
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
    
    // Combinar todas las sucursales únicas de ambas fuentes
    const allBranchNames = new Set([
      ...branchActivity.map(branch => branch.name),
      ...additionalBranches.map(branch => branch.name),
      ...Object.keys(branchActions)
    ]);
    
    // Crear lista de sucursales combinadas con datos completos
    const combinedBranches = Array.from(allBranchNames).map(branchName => {
      // Buscar en branchActivity
      const activityData = branchActivity.find(b => b.name === branchName);
      
      // Buscar en additional branches
      const additionalData = additionalBranches.find(b => b.name === branchName);
      
      // Combinar datos
      const branch = {
        name: branchName,
        totalActiveTime: (activityData?.totalActiveTime || 0) + (additionalData?.totalActiveTime || 0),
        activeUsers: activityData?.activeUsers || additionalData?.activeUsers || 0,
        lastConnection: activityData?.lastConnection || additionalData?.lastConnection || null,
        actions: branchActions[branchName] || {
          exports: 0,
          downloads: 0,
          predictions: 0,
          views: 0
        }
      };
      
      // Añadir última acción si existe
      const recentAction = recentActions.find((a: any) => a.branch === branchName);
      if (recentAction) {
        branch.recentActivity = {
          action: recentAction.action,
          username: recentAction.username,
          timestamp: formatDate(recentAction.timestamp)
        };
      }
      
      return branch;
    });
    
    // Formatear tiempos activos para todas las sucursales
    const formattedBranches = combinedBranches.map(branch => ({
      ...branch,
      totalActiveTime: formatDuration(branch.totalActiveTime),
      lastConnection: formatDate(branch.lastConnection)
    }));
    
    // Consultar usuarios más activos
    const userActivity = await db.collection('user_activity_stats')
      .find({
        lastActive: { $gte: startDate }
      })
      .sort({ 'lastActive': -1 })
      .limit(10)
      .toArray();
    
    // Formatear datos de usuarios
    const users = userActivity.map((user: any) => ({
      username: user.username,
      branch: user.branch,
      activeTime: formatDuration(user.totalActiveTime),
      lastActivity: formatDate(user.lastActive),
      sections: user.sections || [],
      totalSessions: user.totalSessions || 0,
      totalPageViews: user.totalPageViews || 0
    }));
    
    // Obtener total de predicciones generadas
    const predictionsCount = await db.collection('predictions_history')
      .countDocuments({
        timestamp: { $gte: startDate }
      });
    
    // Obtener errores del sistema para incluir en el reporte
    const systemErrors = await db.collection('system_log')
      .find({
        type: 'error',
        timestamp: { $gte: startDate }
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