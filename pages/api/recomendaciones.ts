import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

// API endpoint del modelo de predicción
const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';
const API_ENDPOINTS = {
  RECOMENDACIONES: `${API_BASE_URL}/api/recomendaciones`,
};

/**
 * API para obtener recomendaciones específicas para una sucursal
 * 
 * Este endpoint reenvía la solicitud directamente al modelo de recomendaciones
 * y devuelve todos los resultados sin filtrar ni generar recomendaciones automáticas.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  try {
    const { sucursal, fecha, limite } = req.body;

    if (!sucursal) {
      return res.status(400).json({ 
        success: false, 
        message: 'El parámetro "sucursal" es obligatorio' 
      });
    }

    console.log(`[RECOMENDACIONES] Solicitando recomendaciones para la sucursal: ${sucursal}`);
    
    // Construir el cuerpo de la solicitud
    const requestBody: any = {
      sucursal,
    };

    // Parámetros opcionales
    if (fecha) requestBody.fecha = fecha;
    if (limite) requestBody.top_n = parseInt(limite);
    
    // Realizar la solicitud al API del modelo
    const response = await fetch(API_ENDPOINTS.RECOMENDACIONES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Error al llamar al API de recomendaciones: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Guardar en la base de datos si está disponible
    try {
      const { db } = await connectToDatabase();
      
      if (db) {
        const timestamp = new Date().toISOString();
        const normalizeBranchName = (branch: string) => branch.trim().toLowerCase().replace(/[\s-]+/g, '_');
        const collectionName = `recommendations_${normalizeBranchName(sucursal)}`;
        
        await db.collection(collectionName).insertOne({
          timestamp,
          branch: sucursal,
          date: fecha || new Date().toISOString().split('T')[0],
          source: 'endpoint_directo',
          recommendations: data.recomendaciones || []
        });
        
        console.log(`[RECOMENDACIONES] Guardadas ${data.recomendaciones?.length || 0} recomendaciones en la colección ${collectionName}`);
      }
    } catch (dbError) {
      console.error('[RECOMENDACIONES] Error al guardar en la base de datos:', dbError);
      // Continuamos aunque haya error en la BD
    }
    
    // Retornar los resultados
    return res.status(200).json({
      success: true,
      message: 'Recomendaciones obtenidas correctamente',
      sucursal,
      fecha: fecha || new Date().toISOString().split('T')[0],
      total: data.recomendaciones?.length || 0,
      recomendaciones: data.recomendaciones || [],
      metadata: data.meta || {}
    });
    
  } catch (error) {
    console.error('[RECOMENDACIONES] Error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido al obtener recomendaciones',
    });
  }
} 