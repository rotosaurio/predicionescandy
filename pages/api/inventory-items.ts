import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { collection, search } = req.query;
                    
    if (!collection || typeof collection !== 'string') {
      return res.status(400).json({ 
        success: false,     
        message: 'Collection name parameter is required' 
      });
    }

    // Updated regex pattern to match the actual collection name format
    // This matches "inventariocedis" followed by an optional timestamp in ISO format with underscores
    if (!/^inventariocedis(_\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}_\d{3}Z)?$/.test(collection)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid collection name: ' + collection
      });
    }

    const { db } = await connectToDatabase();
    
    // Build query based on search parameter if provided
    const query = search && typeof search === 'string' && search.length > 0
      ? { articulo: { $regex: new RegExp(search, 'i') } }
      : {};
    
    // Get items from the specified collection
    const items = await db.collection(collection).find(query)
      .sort({ articulo: 1 })
      .limit(1000) // Limit to a reasonable number of items
      .toArray();

    return res.status(200).json({
      success: true,
      items,
      total: items.length
    });
  } catch (error) {
    console.error('Error retrieving inventory items:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Error interno del servidor'
    });
  }
}
