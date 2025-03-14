import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { sucursal } = req.query;

  try {
    const { db } = await connectToDatabase();
    const query = sucursal ? { sucursal } : {};
    const feedback = await db.collection('feedback').find(query).toArray();

    return res.status(200).json({ success: true, feedback });
  } catch (error) {
    console.error('Error fetching feedback data:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
