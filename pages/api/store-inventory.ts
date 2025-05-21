import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

// Función para calcular el próximo lunes a las 9am
function getNextMonday9AM(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 (domingo) a 6 (sábado)
  
  // Calcular días hasta el próximo lunes
  // Si hoy es lunes (1) y es antes de las 9am, la expiración es hoy a las 9am
  // Si hoy es lunes (1) y es después de las 9am, o cualquier otro día, la expiración es el próximo lunes
  let daysUntilMonday = dayOfWeek === 1 && now.getHours() < 9
    ? 0  // Hoy es lunes y aún no son las 9am
    : (8 - dayOfWeek) % 7;  // Días hasta el próximo lunes
  
  if (daysUntilMonday === 0 && now.getHours() >= 9) {
    daysUntilMonday = 7; // Si hoy es lunes después de las 9am, la expiración es el próximo lunes
  }
  
  // Crear fecha del próximo lunes
  const expirationDate = new Date(now);
  expirationDate.setDate(now.getDate() + daysUntilMonday);
  
  // Establecer hora a las 9:00:00 AM
  expirationDate.setHours(9, 0, 0, 0);
  
  return expirationDate;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('store_inventory');
    
    // GET: Obtener el inventario de tienda para una sucursal
    if (req.method === 'GET') {
      const { branch } = req.query;
      
      if (!branch || typeof branch !== 'string') {
        return res.status(400).json({ success: false, message: 'Se requiere un ID de sucursal válido' });
      }
      
      const inventory = await collection.findOne({ branch });
      
      // Verificar si los datos han expirado
      if (inventory && inventory.expiresAt) {
        const expirationDate = new Date(inventory.expiresAt);
        const now = new Date();
        
        // Si ya pasó la fecha de expiración, devolver un objeto vacío
        if (now > expirationDate) {
          console.log(`Inventario de tienda para ${branch} ha expirado (${expirationDate.toISOString()}), devolviendo objeto vacío`);
          return res.status(200).json({
            success: true,
            inventory: {},
            expiration: null,
            expired: true
          });
        }
        
        // Devolver la información de expiración junto con los productos
        return res.status(200).json({
          success: true,
          inventory: inventory.products || {},
          expiration: inventory.expiresAt,
          expired: false
        });
      }
      
      return res.status(200).json({
        success: true,
        inventory: inventory?.products || {},
        expiration: inventory?.expiresAt || null,
        expired: false
      });
    }
    
    // POST: Guardar el inventario de tienda para una sucursal
    if (req.method === 'POST') {
      const { branch, products } = req.body;
      
      if (!branch || typeof branch !== 'string') {
        return res.status(400).json({ success: false, message: 'Se requiere un ID de sucursal válido' });
      }
      
      if (!products || typeof products !== 'object') {
        return res.status(400).json({ success: false, message: 'Se requiere un objeto de productos válido' });
      }
      
      // Calcular fecha de expiración (próximo lunes a las 9am)
      const expiresAt = getNextMonday9AM();
      
      console.log(`Estableciendo expiración del inventario de tienda para ${branch} al ${expiresAt.toISOString()}`);
      
      // Actualizar o insertar con fecha de expiración
      await collection.updateOne(
        { branch },
        { 
          $set: { 
            branch, 
            products, 
            updatedAt: new Date(),
            expiresAt: expiresAt
          } 
        },
        { upsert: true }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Inventario de tienda actualizado correctamente',
        expiration: expiresAt
      });
    }
  } catch (error) {
    console.error('Error en API de inventario de tienda:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
} 