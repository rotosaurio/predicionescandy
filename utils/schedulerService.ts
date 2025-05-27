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
    logger.info('Generando reporte de actividad de usuarios');
    const { db } = await connectToDatabase();
    
    // Obtener la fecha de ayer
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Consultar actividad por sucursal
    const branchActivity = await db.collection('user_daily_sessions')
      .aggregate([
        { $match: { sessionDate: yesterdayStr } },
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
    
    // Obtener exportaciones de Excel y otras acciones importantes
    const userActions = await db.collection('system_log')
      .find({
        type: 'user_action',
        'details.action': { $in: ['export_excel', 'download_report', 'generate_prediction', 'view_prediction'] },
        timestamp: { 
          $gte: new Date(yesterdayStr + 'T00:00:00.000Z'),
          $lt: new Date(yesterdayStr + 'T23:59:59.999Z')
        }
      })
      .toArray();
    
    // Agrupar acciones por sucursal
    const branchActions: { [key: string]: { exports: number, downloads: number, predictions: number, views: number } } = {};
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
    
    // Obtener acciones más recientes para cada sucursal
    const recentActions = await db.collection('system_log')
      .aggregate([
        {
          $match: {
            timestamp: { 
              $gte: new Date(yesterdayStr + 'T00:00:00.000Z'),
              $lt: new Date(yesterdayStr + 'T23:59:59.999Z')
            }
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
    
    // Obtener estadísticas de uso por módulo
    const moduleUsage = await db.collection('user_activity_stats')
      .aggregate([
        {
          $match: {
            lastActive: { 
              $gte: new Date(yesterdayStr + 'T00:00:00.000Z'),
              $lt: new Date(yesterdayStr + 'T23:59:59.999Z')
            }
          }
        },
        {
          $group: {
            _id: '$module',
            count: { $sum: 1 },
            totalTime: { $sum: '$timeSpent' }
          }
        },
        {
          $project: {
            _id: 0,
            module: '$_id',
            count: 1,
            avgTime: { $divide: ['$totalTime', '$count'] }
          }
        },
        {
          $sort: { count: -1 }
        }
      ])
      .toArray();
    
    // Formatear tiempos activos
    branchActivity.forEach((branch: any) => {
      // Añadir acciones a cada sucursal
      branch.actions = branchActions[branch.name] || {
        exports: 0,
        downloads: 0,
        predictions: 0,
        views: 0
      };
      
      // Añadir última acción si existe
      const recentAction = recentActions.find((a: any) => a.branch === branch.name);
      if (recentAction) {
        branch.recentActivity = {
          action: recentAction.action,
          username: recentAction.username,
          timestamp: formatDate(recentAction.timestamp)
        };
      }
      
      branch.totalActiveTime = formatDuration(branch.totalActiveTime);
      branch.lastConnection = formatDate(branch.lastConnection);
    });
    
    // Verificar si no hay datos de sucursales y agregar datos de la interfaz directamente
    if (branchActivity.length === 0) {
      // Consultar estadísticas de actividad de usuarios actuales
      const userStats = await db.collection('user_activity_stats')
        .find({})
        .sort({ lastActive: -1 })
        .toArray();
        
      // Agrupar por sucursal
      const branchesByName: { [key: string]: any } = {};
      userStats.forEach((user: any) => {
        const branchName = user.branch || 'No especificada';
        if (!branchesByName[branchName]) {
          branchesByName[branchName] = {
            name: branchName,
            activeUsers: 0,
            totalActiveTime: 0,
            lastConnection: null
          };
        }
        
        branchesByName[branchName].activeUsers += 1;
        branchesByName[branchName].totalActiveTime += user.totalActiveTime || 0;
        
        // Actualizar última conexión si este usuario tiene una más reciente
        if (user.lastActive && (!branchesByName[branchName].lastConnection || 
            new Date(user.lastActive) > new Date(branchesByName[branchName].lastConnection))) {
          branchesByName[branchName].lastConnection = user.lastActive;
        }
      });
      
      // Convertir a array y formatear los valores
      const additionalBranches = Object.values(branchesByName).map((branch: any) => {
        return {
          ...branch,
          totalActiveTime: formatDuration(branch.totalActiveTime),
          lastConnection: formatDate(branch.lastConnection),
          actions: branchActions[branch.name] || {
            exports: 0,
            downloads: 0,
            predictions: 0,
            views: 0
          }
        };
      });
      
      // Añadir sucursales adicionales
      branchActivity.push(...additionalBranches);
    }
    
    // Consultar usuarios más activos
    const userActivity = await db.collection('user_activity_stats')
      .find({})
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
        timestamp: { 
          $gte: new Date(yesterdayStr + 'T00:00:00.000Z'),
          $lt: new Date(yesterdayStr + 'T23:59:59.999Z')
        }
      });
    
    // Obtener errores del sistema para incluir en el reporte
    const systemErrors = await db.collection('system_log')
      .find({
        type: 'error',
        timestamp: { 
          $gte: new Date(yesterdayStr + 'T00:00:00.000Z'),
          $lt: new Date(yesterdayStr + 'T23:59:59.999Z')
        }
      })
      .limit(10)
      .toArray();
    
    // Formatear errores para el reporte
    const errors = systemErrors.map((error: any) => ({
      message: error.message,
      component: error.details?.componentName || 'No especificado',
      timestamp: formatDate(error.timestamp)
    }));
    
    return {
      generatedAt: new Date().toISOString(),
      date: yesterdayStr,
      branches: branchActivity,
      users,
      moduleUsage,
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
  if (!ms) return '0h 0m';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  return `${hours}h ${minutes % 60}m`;
}

function formatDate(date: Date | string | null): string {
  if (!date) return 'No disponible';
  
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
} 