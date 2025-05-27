import nodemailer from 'nodemailer';

// Configuración por defecto para el correo
const EMAIL_USER = 'candymarttest@gmail.com';
const EMAIL_PASS = 'nouq oheg mawp tzek';
const DEFAULT_FROM = 'Sistema de Predicciones <candymarttest@gmail.com>';

// Logger simplificado para no depender de módulos del cliente
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[MAIL-SERVICE] [INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`[MAIL-SERVICE] [ERROR] ${message}`, data ? JSON.stringify(data) : '');
  }
};

// Crear el transportador para nodemailer
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
};

// Validar si un email es válido usando una expresión regular simple
export const isValidEmail = (email: string): boolean => {
  if (!email || email.trim() === '') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Envía un correo electrónico
 * @param to Destinatario del correo
 * @param subject Asunto del correo
 * @param html Contenido HTML del correo
 * @param text Contenido en texto plano (alternativa)
 * @returns Promise con el resultado del envío
 */
export const sendEmail = async (
  to: string | string[],
  subject: string,
  html: string,
  text?: string
): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    
    logger.info(`Enviando correo a: ${typeof to === 'string' ? to : to.join(', ')}`, { subject });
    
    const mailOptions = {
      from: DEFAULT_FROM,
      to,
      subject,
      text: text || html.replace(/<[^>]*>/g, ''), // Quita las etiquetas HTML si no se proporciona versión de texto
      html
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    logger.info(`Correo enviado exitosamente`, { 
      messageId: info.messageId,
      response: info.response
    });
    
    return true;
  } catch (error) {
    logger.error(`Error al enviar correo electrónico`, error);
    return false;
  }
};

/**
 * Envía un correo con un reporte de actividad de usuarios
 * @param to Correo destinatario 
 * @param activityData Datos de actividad para incluir en el correo
 * @returns Promise con el resultado del envío
 */
export const sendActivityReport = async (
  to: string,
  activityData: any
): Promise<boolean> => {
  const date = new Date();
  const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
  const reportDate = activityData.date ? activityData.date.split('-').reverse().join('/') : formattedDate;
  
  const subject = `Reporte de Actividad del Sistema - ${reportDate}`;
  
  // Generar el contenido HTML del correo
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h1 style="color: #333; text-align: center; border-bottom: 2px solid #eee; padding-bottom: 10px;">
        Reporte de Actividad del Sistema
      </h1>
      <p style="color: #666; text-align: center; font-size: 16px; margin-bottom: 30px;">
        Fecha del reporte: ${reportDate}
      </p>
      
      <div style="margin-bottom: 30px; background-color: #f9f9f9; padding: 15px; border-radius: 8px; border-left: 4px solid #4a6cf7;">
        <h3 style="color: #333; margin-top: 0;">Resumen del Día</h3>
        <ul style="color: #555;">
          <li><strong>Sucursales activas:</strong> ${activityData.branches?.length || 0}</li>
          <li><strong>Usuarios activos:</strong> ${activityData.users?.length || 0}</li>
          <li><strong>Predicciones generadas:</strong> ${activityData.predictions?.total || 0}</li>
          <li><strong>Errores del sistema:</strong> ${activityData.systemHealth?.errorCount || 0}</li>
        </ul>
      </div>
      
      <h2 style="color: #444; margin-top: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Actividad por Sucursal</h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <thead>
          <tr style="background-color: #f3f3f3;">
            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Sucursal</th>
            <th style="padding: 12px; text-align: center; border-bottom: 1px solid #ddd;">Última Conexión</th>
            <th style="padding: 12px; text-align: center; border-bottom: 1px solid #ddd;">Tiempo Activo Total</th>
            <th style="padding: 12px; text-align: center; border-bottom: 1px solid #ddd;">Usuarios Activos</th>
            <th style="padding: 12px; text-align: center; border-bottom: 1px solid #ddd;">Exportaciones</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  // Agregar filas para cada sucursal
  if (activityData.branches && Array.isArray(activityData.branches) && activityData.branches.length > 0) {
    activityData.branches.forEach((branch: any) => {
      html += `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${branch.name || 'No especificada'}</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">${branch.lastConnection || 'No disponible'}</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">${branch.totalActiveTime || '0h 0m'}</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">${branch.activeUsers || 0}</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">${branch.actions?.exports || 0}</td>
        </tr>
      `;
    });
  } else {
    html += `
      <tr>
        <td colspan="5" style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">No hay datos disponibles para ninguna sucursal</td>
      </tr>
    `;
  }
  
  html += `
        </tbody>
      </table>
      
      <h3 style="color: #444; margin-top: 30px;">Detalles de Actividad por Sucursal</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px;">
  `;
  
  // Verificamos si hay sucursales con datos
  console.log('Branches data:', JSON.stringify(activityData.branches || []));
  
  // Detalles de cada sucursal
  if (activityData.branches && Array.isArray(activityData.branches) && activityData.branches.length > 0) {
    activityData.branches.forEach((branch: any) => {
      // Asegurarse de que branch sea un objeto válido
      if (!branch || typeof branch !== 'object') return;
      
      html += `
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px;">
          <h4 style="color: #333; margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px;">${branch.name || 'No especificada'}</h4>
          <ul style="list-style: none; padding-left: 0; margin-bottom: 15px;">
            <li><strong>Usuarios activos:</strong> ${branch.activeUsers || 0}</li>
            <li><strong>Tiempo total activo:</strong> ${branch.totalActiveTime || '0h 0m'}</li>
            <li><strong>Última conexión:</strong> ${branch.lastConnection || 'No disponible'}</li>
            <li><strong>Exportaciones Excel:</strong> ${(branch.actions && branch.actions.exports) || 0}</li>
            <li><strong>Descargas de reportes:</strong> ${(branch.actions && branch.actions.downloads) || 0}</li>
            <li><strong>Predicciones generadas:</strong> ${(branch.actions && branch.actions.predictions) || 0}</li>
            <li><strong>Vistas de predicciones:</strong> ${(branch.actions && branch.actions.views) || 0}</li>
          </ul>
          ${branch.recentActivity ? `
            <div style="background-color: #e9f5ff; padding: 10px; border-radius: 5px; margin-top: 10px;">
              <h5 style="margin-top: 0; color: #0066cc;">Última actividad:</h5>
              <p style="margin: 5px 0;"><strong>Acción:</strong> ${branch.recentActivity.action || 'No especificada'}</p>
              <p style="margin: 5px 0;"><strong>Usuario:</strong> ${branch.recentActivity.username || 'No especificado'}</p>
              <p style="margin: 5px 0;"><strong>Hora:</strong> ${branch.recentActivity.timestamp || 'No disponible'}</p>
            </div>
          ` : ''}
        </div>
      `;
    });
  } else {
    html += `
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; text-align: center;">
        <p style="color: #666;">No hay datos de actividad disponibles para ninguna sucursal.</p>
      </div>
    `;
  }
  
  html += `
      </div>
      
      ${activityData.systemHealth && activityData.systemHealth.errors && activityData.systemHealth.errors.length > 0 ? `
      <h2 style="color: #444; margin-top: 40px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Errores Detectados</h2>
      <div style="background-color: #fff8f8; border-left: 4px solid #e74c3c; padding: 15px; margin-top: 20px; border-radius: 5px;">
        <p style="margin-top: 0; color: #e74c3c; font-weight: bold;">Se detectaron ${activityData.systemHealth.errorCount} errores en el sistema.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #ffeeee;">
              <th style="padding: 10px; text-align: left; border-bottom: 1px solid #eee;">Error</th>
              <th style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">Componente</th>
              <th style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">Hora</th>
            </tr>
          </thead>
          <tbody>
      ${activityData.systemHealth.errors.map((error: any) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${error.message || 'Error no especificado'}</td>
          <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${error.component || 'No especificado'}</td>
          <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${error.timestamp || 'No disponible'}</td>
        </tr>
      `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}
      
      <div style="margin-top: 40px; text-align: center; color: #888; font-size: 14px; padding: 20px; border-top: 1px solid #eee;">
        <p>Este es un correo automático generado por el Sistema de Predicciones.</p>
        <p>Reporte generado el ${formattedDate} a las ${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}</p>
        <p>Por favor no responda a este mensaje.</p>
      </div>
    </div>
  `;
  
  return await sendEmail(to, subject, html);
}; 