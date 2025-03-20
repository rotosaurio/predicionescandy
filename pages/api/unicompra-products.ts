import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Connect to database with error handling
    const { db, client } = await connectToDatabase();
    
    // Check if the collection exists to provide better error messages
    const collections = await db.listCollections({ name: 'unicompra-codigo' }).toArray();
    if (collections.length === 0) {
      console.error('Collection unicompra-codigo does not exist in the database');
    return res.status(404).json({
      success: false,
      message: 'Collection unicompra-codigo not found in database',
      debug: {
        available_collections: await db.listCollections().toArray().then((cols: { name: string }[]) => cols.map((c: { name: string }) => c.name))
      }
    });
    }
    
    // Get products from the unicompra-codigo collection
    console.log('Fetching products from unicompra-codigo collection...');
    const products = await db.collection('unicompra-codigo')
      .find({})
      .toArray();
    
    console.log(`Successfully retrieved ${products.length} products from unicompra-codigo collection`);
    
    return res.status(200).json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    const err = error as Error;
    console.error('Error fetching UniCompra products:', err);
    console.error('Error stack:', err.stack);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching products',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
