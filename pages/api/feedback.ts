import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { db } = await connectToDatabase();
    const feedbackCollection = 'feedback';

    // GET - Obtener feedback
    if (req.method === 'GET') {
      const { sucursal, fecha, predictionId } = req.query;
      
      const query: any = {};
      
      if (sucursal) {
        query.sucursal = sucursal;
      }
      
      if (fecha) {
        query.fecha = fecha;
      }
      
      if (predictionId) {
        query.predictionId = predictionId;
      }

      // Verificar que la colección existe
      const collections = await db.listCollections({ name: feedbackCollection }).toArray();
      if (collections.length === 0) {
        console.log('[API] La colección feedback no existe');
        return res.status(200).json({
          success: true,
          feedback: []
        });
      }

      console.log('[API] Consultando colección feedback con filtro:', query);
      const feedback = await db
        .collection(feedbackCollection)
        .find(query)
        .toArray();

      console.log(`[API] Encontrados ${feedback.length} registros de feedback`);
      
      return res.status(200).json({
        success: true,
        feedback
      });
    }

    // POST - Guardar nuevo feedback
    if (req.method === 'POST') {
      const { producto, sucursal, fecha, ordenado, razon_no_ordenado, comentario } = req.body;
      
      if (!producto || !sucursal || !fecha || ordenado === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Faltan campos requeridos (producto, sucursal, fecha, ordenado)'
        });
      }
      
      // Si no se ordenó, verificar si hay razón
      if (!ordenado && !razon_no_ordenado) {
        return res.status(400).json({
          success: false,
          message: 'Si el producto no fue ordenado, debe proporcionar una razón'
        });
      }
      
      const document = {
        producto,
        sucursal,
        fecha,
        ordenado,
        razon_no_ordenado: ordenado ? null : razon_no_ordenado,
        comentario: comentario || null,
        timestamp: new Date().toISOString()
      };
      
      // Asegurar que la colección existe
      try {
        await db.createCollection(feedbackCollection);
      } catch (e) {
        // La colección ya existe, lo cual está bien
      }
      
      const result = await db.collection(feedbackCollection).insertOne(document);
      
      if (result.acknowledged) {
        return res.status(201).json({
          success: true,
          message: 'Feedback guardado correctamente',
          id: result.insertedId
        });
      } else {
        throw new Error('Error al insertar en la base de datos');
      }
    }
    
    // Método no permitido
    return res.status(405).json({
      success: false,
      message: 'Método no permitido'
    });
    
  } catch (error) {
    console.error('[API] Error en API de feedback:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
