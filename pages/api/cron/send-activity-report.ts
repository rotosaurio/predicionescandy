import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../../lib/mongodb';
import { sendActivityReportTask } from '../../../utils/schedulerService';
import { generateActivityReport } from '../../../utils/schedulerService';
import { sendActivityReport } from '../../../utils/emailService';
import { isValidEmail } from '../../../utils/emailService';

// Sistema de logs simplificado para este API
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[CRON-API] [INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[CRON-API] [WARN] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`[CRON-API] [ERROR] ${message}`, data ? JSON.stringify(data) : '');
  }
};

/**
 * Este endpoint permite enviar el reporte de actividad de forma manual o
 * mediante un servicio externo de tareas programadas (cron) que lo invoque.
 * Útil para entornos serverless donde no se pueden ejecutar tareas cron nativas.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verificar el método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }
  
  try {
    // Se puede implementar autenticación mediante API key
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    // Verificar API key si está configurada en variables de entorno
    const expectedApiKey = process.env.CRON_API_KEY;
    if (expectedApiKey && apiKey !== expectedApiKey) {
      logger.warn('Intento de acceso a endpoint cron con API key inválida', {
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        providedKey: apiKey ? 'Proporcionada pero incorrecta' : 'No proporcionada'
      });
      
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado'
      });
    }
    
    // Obtener el correo del cuerpo si está presente (para envíos manuales)
    const manualEmail = req.body?.email;
    
    // Verificar si hay una configuración activa
    const { db } = await connectToDatabase();
    const config = await db.collection('email_config').findOne({ isActive: true });
    
    // Si no hay configuración activa y no se proporcionó un correo manual
    if (!config && !manualEmail) {
      logger.info('Tarea cron ejecutada pero no hay configuración de correo activa ni correo manual');
      return res.status(200).json({
        success: false,
        message: 'No hay configuración de correo activa ni se proporcionó un correo'
      });
    }
    
    // Determinar a qué correo enviar el reporte
    const destinationEmail = manualEmail || config?.destinationEmail;
    
    // Validar formato de correo
    if (!isValidEmail(destinationEmail)) {
      logger.error('Formato de correo electrónico inválido', { email: destinationEmail });
      return res.status(400).json({
        success: false,
        message: 'El formato del correo electrónico es inválido'
      });
    }
    
    logger.info('Ejecutando tarea de envío de reporte a través del endpoint cron', {
      destinationEmail,
      triggered: manualEmail ? 'manual-request' : 'config',
      manualRequest: !!manualEmail
    });
    
    // Generar reporte
    const reportData = await generateActivityReport();
    
    // Enviar correo directamente
    const success = await sendActivityReport(destinationEmail, reportData);
    
    if (success) {
      logger.info(`Reporte de actividad enviado exitosamente a ${destinationEmail}`);
      return res.status(200).json({
        success: true,
        message: `Reporte enviado correctamente a ${destinationEmail}`
      });
    } else {
      throw new Error(`Error al enviar reporte a ${destinationEmail}`);
    }
    
  } catch (error) {
    logger.error('Error al ejecutar tarea cron de envío de reporte', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error al ejecutar la tarea',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
} 