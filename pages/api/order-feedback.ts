import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { OrderFeedback, NoOrdenadoRazon } from '../../types/models';

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { producto, cantidad, sucursal, fecha, ordenado, razon_no_ordenado, comentario } = req.body;

  if (!producto || !sucursal || !fecha || ordenado === undefined) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const { db } = await connectToDatabase();
    const feedback: OrderFeedback = {
      predictionId: '', // Add appropriate prediction ID if available
      producto,
      sucursal,
      fecha,
      ordenado,
      razon_no_ordenado,
      comentario,
      usuario: '', // Add appropriate user information if available
      fecha_feedback: new Date().toISOString()
    };

    await db.collection('feedback').insertOne(feedback);

    console.log('Order feedback saved:', feedback);
    return res.status(200).json({ success: true, feedback });
  } catch (error) {
    console.error('Error saving order feedback:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
