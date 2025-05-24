import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { isValidEmail } from '../../utils/emailService';
import { scheduleActivityReport, stopAllTasks } from '../../utils/schedulerService';

// Sistema de logs para esta API
function logApi(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [EMAIL-CONFIG-API] [${level}]`;
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('email_config');
    
    // GET - Obtener configuración actual
    if (req.method === 'GET') {
      logApi('INFO', 'Consultando configuración de correo');
      
      // Intentar obtener configuración activa
      const config = await collection.findOne({ isActive: true });
      
      if (config) {
        // Ocultar campos sensibles al cliente (no hay contraseñas en este caso)
        logApi('INFO', 'Configuración de correo encontrada');
        return res.status(200).json({
          success: true,
          config: {
            destinationEmail: config.destinationEmail,
            scheduledTime: config.scheduledTime,
            isActive: config.isActive,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt
          }
        });
      } else {
        // No hay configuración, devolver valores predeterminados
        logApi('INFO', 'No se encontró configuración de correo');
        return res.status(200).json({
          success: true,
          config: {
            destinationEmail: '',
            scheduledTime: '08:00',
            isActive: false,
            createdAt: null,
            updatedAt: null
          }
        });
      }
    }
    
    // POST - Guardar nueva configuración
    if (req.method === 'POST') {
      const { destinationEmail, scheduledTime, isActive } = req.body;
      
      // Validar datos
      if (!destinationEmail || !scheduledTime) {
        logApi('ERROR', 'Faltan datos requeridos en la configuración');
        return res.status(400).json({
          success: false,
          message: 'El correo de destino y la hora programada son obligatorios'
        });
      }
      
      // Validar formato de correo
      if (!isValidEmail(destinationEmail)) {
        logApi('ERROR', 'Formato de correo electrónico inválido', { email: destinationEmail });
        return res.status(400).json({
          success: false,
          message: 'El formato del correo electrónico es inválido'
        });
      }
      
      // Validar formato de hora
      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timeRegex.test(scheduledTime)) {
        logApi('ERROR', 'Formato de hora inválido', { time: scheduledTime });
        return res.status(400).json({
          success: false,
          message: 'La hora debe estar en formato HH:MM (24h)'
        });
      }
      
      // Desactivar configuración previa si existe
      await collection.updateMany(
        {},
        { $set: { isActive: false, updatedAt: new Date() }}
      );
      
      // Guardar nueva configuración
      const configDoc = {
        destinationEmail,
        scheduledTime,
        isActive: isActive !== false, // Por defecto activo a menos que se especifique lo contrario
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await collection.insertOne(configDoc);
      
      if (result.acknowledged) {
        logApi('INFO', 'Nueva configuración de correo guardada', { 
          email: destinationEmail, 
          time: scheduledTime,
          isActive: configDoc.isActive
        });
        
        // Programar tarea si está activa
        if (configDoc.isActive) {
          try {
            // Detener tareas existentes
            await stopAllTasks();
            
            // Programar nueva tarea
            const taskId = await scheduleActivityReport({
              destinationEmail,
              scheduledTime,
              isActive: true
            });
            
            logApi('INFO', 'Tarea de envío de correo programada', { taskId });
          } catch (error) {
            logApi('ERROR', 'Error al programar tarea de correo', error);
            // No fallamos la petición, solo registramos el error
          }
        } else {
          // Detener tareas existentes si la configuración se guardó inactiva
          await stopAllTasks();
          logApi('INFO', 'Tareas de envío de correo detenidas (configuración inactiva)');
        }
        
        return res.status(201).json({
          success: true,
          message: 'Configuración guardada correctamente',
          config: {
            id: result.insertedId,
            ...configDoc
          }
        });
      } else {
        throw new Error('Error al guardar la configuración');
      }
    }
    
    // Método no permitido
    logApi('ERROR', `Método no permitido: ${req.method}`);
    return res.status(405).json({
      success: false,
      message: 'Método no permitido'
    });
    
  } catch (error) {
    logApi('ERROR', 'Error en API de configuración de correo', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
} 