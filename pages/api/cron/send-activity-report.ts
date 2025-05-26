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
 * 
 * Funciona tanto con:
 * 1. Vercel Cron Jobs (automáticamente autenticado)
 * 2. Peticiones manuales con API key (para pruebas o envíos manuales)
 * 3. Peticiones desde el frontend (con correo específico)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Registrar inicio de la petición
  logger.info(`Petición recibida: ${req.method}`, {
    headers: {
      'user-agent': req.headers['user-agent'],
      'x-vercel-cron': req.headers['x-vercel-cron'],
      'x-vercel-id': req.headers['x-vercel-id']
    },
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });
  
  // Verificar el método HTTP
  if (req.method !== 'POST') {
    logger.warn(`Método no permitido: ${req.method}`);
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }
  
  try {
    // Verificar si es una petición autenticada de Vercel Cron
    const isVercelCron = req.headers['x-vercel-cron'] === 'true';
    
    // Si no es de Vercel, verificar API key
    if (!isVercelCron) {
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      const expectedApiKey = process.env.CRON_API_KEY;
      
      if (expectedApiKey && apiKey !== expectedApiKey) {
        logger.warn('Intento de acceso no autorizado a endpoint cron', {
          ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          providedKey: apiKey ? 'Proporcionada pero incorrecta' : 'No proporcionada'
        });
        
        return res.status(401).json({
          success: false,
          message: 'Acceso no autorizado'
        });
      }
    } else {
      logger.info('Petición autenticada desde Vercel Cron');
    }
    
    // Obtener el correo del cuerpo si está presente (para envíos manuales)
    const manualEmail = req.body?.email;
    
    // Verificar si hay una configuración activa
    const { db } = await connectToDatabase();
    const config = await db.collection('email_config').findOne({ isActive: true });
    
    if (!config && !manualEmail) {
      logger.info('No hay configuración de correo activa ni correo manual');
      return res.status(200).json({
        success: false,
        message: 'No hay configuración de correo activa ni se proporcionó un correo'
      });
    }
    
    // Determinar a qué correo(s) enviar el reporte
    const destinationEmail = manualEmail || config?.destinationEmail;
    
    // Validar formato de correo
    if (!destinationEmail || destinationEmail.trim() === '') {
      logger.error('No se proporcionó ningún correo electrónico válido');
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ningún correo electrónico'
      });
    }
    
    // Validar el formato del correo dependiendo de si es manual o de configuración
    if (manualEmail) {
      if (!isValidEmail(manualEmail)) {
        logger.error('Formato de correo electrónico inválido', { email: manualEmail });
        return res.status(400).json({
          success: false,
          message: 'El formato del correo electrónico es inválido'
        });
      }
    } else if (config?.destinationEmail) {
      // Verificar si hay múltiples destinatarios
      const emails = config.destinationEmail.includes(',') 
        ? config.destinationEmail.split(',')
          .map((email: string) => email.trim())
          .filter((email: string) => email !== '')
        : [config.destinationEmail.trim()];
      
      // Verificar que al menos queda un correo después de filtrar
      if (emails.length === 0) {
        logger.error('No se encontró ningún correo electrónico válido en la configuración');
        return res.status(400).json({
          success: false,
          message: 'No se encontró ningún correo electrónico válido en la configuración'
        });
      }
      
      // Validar el formato de cada correo
      for (const email of emails) {
        if (!isValidEmail(email)) {
          logger.error('Formato de correo electrónico inválido en configuración', { email });
          return res.status(400).json({
            success: false,
            message: `El formato del correo electrónico "${email}" es inválido`
          });
        }
      }
    }
    
    logger.info(`Generando reporte de actividad para ${isVercelCron ? 'cron automatizado' : 'solicitud manual'}`, {
      destinationEmail,
      triggered: manualEmail ? 'manual-request' : (isVercelCron ? 'vercel-cron' : 'api-key'),
      timestamp: new Date().toISOString()
    });
    
    // Generar reporte
    const startTime = Date.now();
    const reportData = await generateActivityReport();
    logger.info(`Reporte generado en ${Date.now() - startTime}ms`);
    
    // Si es un email manual, enviamos a un solo destinatario
    if (manualEmail) {
      const success = await sendActivityReport(manualEmail, reportData);
      
      if (success) {
        logger.info(`Reporte de actividad enviado exitosamente a ${manualEmail}`);
        return res.status(200).json({
          success: true,
          message: `Reporte enviado correctamente a ${manualEmail}`
        });
      } else {
        throw new Error(`Error al enviar reporte a ${manualEmail}`);
      }
    } 
    // Si es la configuración de la DB, puede tener múltiples correos
    else if (config?.destinationEmail) {
      // Verificar si hay múltiples destinatarios
      const emails = config.destinationEmail.includes(',') 
        ? config.destinationEmail.split(',').map((email: string) => email.trim())
        : [config.destinationEmail];
      
      // Enviar correo a cada destinatario
      let successCount = 0;
      const failedEmails = [];
      
      for (const email of emails) {
        try {
          const success = await sendActivityReport(email, reportData);
          if (success) {
            successCount++;
            logger.info(`Reporte de actividad enviado exitosamente a ${email}`);
          } else {
            failedEmails.push(email);
            logger.error(`Error al enviar reporte de actividad a ${email}`);
          }
        } catch (error) {
          failedEmails.push(email);
          logger.error(`Error al enviar reporte a ${email}`, error);
        }
      }
      
      if (successCount > 0) {
        return res.status(200).json({
          success: true,
          message: `Reporte enviado correctamente a ${successCount}/${emails.length} destinatarios`,
          details: {
            total: emails.length,
            success: successCount,
            failed: failedEmails,
            reportDate: reportData.date
          }
        });
      } else {
        throw new Error(`Error al enviar reportes. Ningún envío fue exitoso.`);
      }
    }
    
  } catch (error) {
    logger.error('Error al ejecutar tarea cron de envío de reporte', error instanceof Error ? {
      message: error.message,
      stack: error.stack
    } : error);
    
    return res.status(500).json({
      success: false,
      message: 'Error al ejecutar la tarea',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
} 