import { NextApiRequest, NextApiResponse } from 'next';
import { sendEmail, isValidEmail } from '../../utils/emailService';
import { generateActivityReport } from '../../utils/schedulerService';

// Logger simplificado para no depender de módulos del cliente
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[TEST-EMAIL-API] [INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`[TEST-EMAIL-API] [ERROR] ${message}`, data ? JSON.stringify(data) : '');
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo permitimos solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  try {
    const { email } = req.body;

    // Verificar que se proporcionó un correo
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Es necesario proporcionar un correo electrónico'
      });
    }

    // Validar el formato del correo
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'El formato del correo electrónico es inválido'
      });
    }

    // Generar un correo simple para prueba
    const date = new Date();
    const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    
    // Intentar generar datos reales para el reporte
    let activityData;
    try {
      activityData = await generateActivityReport();
    } catch (error) {
      logger.error('Error al generar datos reales, usando datos de prueba', error);
      // Si falla, crear datos de prueba
      activityData = generateMockActivityData();
    }

    // Enviar el correo con los datos compilados
    logger.info(`Enviando correo de prueba a: ${email}`);
    const success = await sendEmail(
      email,
      `Correo de Prueba - Sistema de Predicciones (${formattedDate})`,
      generateTestEmailHtml(formattedDate, activityData)
    );

    if (success) {
      logger.info(`Correo de prueba enviado exitosamente a ${email}`);
      return res.status(200).json({
        success: true,
        message: 'Correo de prueba enviado correctamente'
      });
    } else {
      throw new Error('Error al enviar el correo de prueba');
    }
  } catch (error) {
    logger.error('Error en API de correo de prueba', error);
    return res.status(500).json({
      success: false,
      message: 'Error al enviar correo de prueba',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}

/**
 * Genera datos de actividad de ejemplo para el correo de prueba
 */
function generateMockActivityData(): any {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  return {
    generatedAt: new Date().toISOString(),
    date: yesterdayStr,
    branches: [
      {
        name: 'Sucursal Central',
        totalActiveTime: '5h 45m',
        activeUsers: 12,
        lastConnection: '23/05/2023 18:45',
        actions: {
          exports: 8,
          downloads: 5,
          predictions: 15,
          views: 42
        },
        recentActivity: {
          action: 'Exportación de reporte diario',
          username: 'gerente.central',
          timestamp: '23/05/2023 18:42'
        }
      },
      {
        name: 'Sucursal Norte',
        totalActiveTime: '4h 30m',
        activeUsers: 8,
        lastConnection: '23/05/2023 17:30',
        actions: {
          exports: 4,
          downloads: 2,
          predictions: 10,
          views: 28
        },
        recentActivity: {
          action: 'Generación de predicciones semanales',
          username: 'analista.norte',
          timestamp: '23/05/2023 16:15'
        }
      },
      {
        name: 'Sucursal Sur',
        totalActiveTime: '3h 15m',
        activeUsers: 5,
        lastConnection: '23/05/2023 16:20',
        actions: {
          exports: 2,
          downloads: 1,
          predictions: 8,
          views: 19
        }
      }
    ],
    users: [
      {
        username: 'gerente.central',
        branch: 'Sucursal Central',
        activeTime: '3h 25m',
        lastActivity: '23/05/2023 18:45',
        totalPageViews: 89,
        totalSessions: 5
      },
      {
        username: 'analista.norte',
        branch: 'Sucursal Norte',
        activeTime: '2h 50m',
        lastActivity: '23/05/2023 17:30',
        totalPageViews: 62,
        totalSessions: 3
      },
      {
        username: 'supervisor.sur',
        branch: 'Sucursal Sur',
        activeTime: '1h 45m',
        lastActivity: '23/05/2023 16:20',
        totalPageViews: 41,
        totalSessions: 2
      }
    ],
    moduleUsage: [
      { module: 'Predicciones', count: 25, avgTime: 720000 },
      { module: 'Reportes', count: 18, avgTime: 540000 },
      { module: 'Inventario', count: 12, avgTime: 480000 },
      { module: 'Administración', count: 8, avgTime: 360000 }
    ],
    predictions: {
      total: 33
    },
    systemHealth: {
      errors: [
        {
          message: 'Error de conexión a la base de datos',
          component: 'DB',
          timestamp: '23/05/2023 14:22'
        },
        {
          message: 'Tiempo de espera excedido en solicitud a API externa',
          component: 'API',
          timestamp: '23/05/2023 15:40'
        }
      ],
      errorCount: 2
    }
  };
}

/**
 * Genera el HTML para el correo de prueba
 */
function generateTestEmailHtml(formattedDate: string, activityData: any): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h1 style="color: #333; text-align: center;">Correo de Prueba</h1>
      <p style="color: #666; text-align: center; font-size: 16px;">
        ${formattedDate}
      </p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p>Este es un correo de prueba del Sistema de Predicciones.</p>
        <p>Si estás recibiendo este correo, significa que la configuración para el envío de reportes diarios está funcionando correctamente.</p>
      </div>
      
      <div style="background-color: #e9f7fe; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <h3 style="margin-top: 0; color: #2196f3;">Datos de muestra incluidos en el reporte diario:</h3>
        <ul>
          <li><strong>Sucursales activas:</strong> ${activityData.branches?.length || 0}</li>
          <li><strong>Usuarios activos:</strong> ${activityData.users?.length || 0}</li>
          <li><strong>Fecha del reporte:</strong> ${activityData.date ? activityData.date.split('-').reverse().join('/') : formattedDate}</li>
          <li><strong>Exportaciones totales:</strong> ${activityData.branches?.reduce((sum: number, branch: any) => sum + (branch.actions?.exports || 0), 0) || 0}</li>
          <li><strong>Predicciones generadas:</strong> ${activityData.predictions?.total || 0}</li>
        </ul>
      </div>
      
      <p>El reporte completo incluye:</p>
      <ol>
        <li>Resumen de actividad por sucursal</li>
        <li>Detalles de actividad por sucursal (con exportaciones, última conexión, etc.)</li>
        <li>Errores detectados en el sistema (si hay alguno)</li>
      </ol>
      
      <div style="margin-top: 40px; text-align: center; color: #888; font-size: 14px; padding-top: 20px; border-top: 1px solid #eee;">
        <p>Este es un correo automático de prueba.</p>
        <p>Por favor no responda a este mensaje.</p>
      </div>
    </div>
  `;
} 