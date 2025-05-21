import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

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
      
      return res.status(200).json({
        success: true,
        inventory: inventory?.products || {}
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
      
      // Actualizar o insertar
      await collection.updateOne(
        { branch },
        { $set: { branch, products, updatedAt: new Date() } },
        { upsert: true }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Inventario de tienda actualizado correctamente'
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