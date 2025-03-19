import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { db } = await connectToDatabase();

    // Get all inventory metadata, sorted by date
    const inventoryHistory = await db.collection('inventariocedis_metadata')
      .find({})
      .sort({ timestamp: -1 })
      .toArray();

    interface InventoryMetadata {
      timestamp: Date;
      inventoryDate: Date;
      filename: string;
      recordCount: number;
      collectionName: string;
    }

    return res.status(200).json({
      success: true,
      history: inventoryHistory.map((item: InventoryMetadata) => ({
        timestamp: item.timestamp,
        inventoryDate: item.inventoryDate,
        filename: item.filename,
        recordCount: item.recordCount,
        collectionName: item.collectionName
      }))
    });
  } catch (error) {
    console.error('Error retrieving inventory history:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Error interno del servidor'
    });
  }
}
