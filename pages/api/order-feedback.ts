import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { OrderFeedback } from '../../types/models';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { db } = await connectToDatabase();

    if (req.method === 'POST' && req.url === '/api/order-feedback/batch') {
      const feedbacks = req.body;

      if (!Array.isArray(feedbacks) || feedbacks.length === 0) {
        return res.status(400).json({ message: 'Invalid feedback data' });
      }

      const feedbackDocs = feedbacks.map(feedback => ({
        ...feedback,
        predictionId: feedback.predictionId || null, // Include predictionId if provided
        fecha_feedback: new Date().toISOString()
      }));

      await db.collection('feedback').insertMany(feedbackDocs);

      console.log('Batch order feedback saved:', feedbackDocs);
      return res.status(200).json({ success: true, feedbacks: feedbackDocs });
    }

    if (req.method === 'POST') {
      const { producto, cantidad, sucursal, fecha, ordenado, razon_no_ordenado, comentario, predictionId } = req.body;

      if (!producto || !sucursal || !fecha || ordenado === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Verificar si ya existe feedback para el producto y la fecha
      const existingFeedback = await db.collection('feedback').findOne({
        producto,
        sucursal,
        fecha,
        predictionId // Add predictionId to uniqueness check if provided
      });

      if (existingFeedback) {
        return res.status(200).json({ message: 'Feedback already exists for this product and date' });
      }

      const feedback: OrderFeedback = {
        producto,
        cantidad,
        sucursal,
        fecha,
        ordenado,
        razon_no_ordenado,
        comentario,
        predictionId: predictionId || null, // Store predictionId if provided
        fecha_feedback: new Date().toISOString(),
      };

      await db.collection('feedback').insertOne(feedback);

      return res.status(201).json({ success: true, feedback });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
