import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

interface InventoryItem {
  articulo: string;
  existencia: number;
}

interface BatchRequestBody {
  productNames: string[];
  predictionDate?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { productNames, predictionDate } = req.body as BatchRequestBody;
    
    if (!productNames || !Array.isArray(productNames) || productNames.length === 0) {
      return res.status(400).json({ success: false, message: 'Product names array is required' });
    }

    console.log(`Processing batch inventory check for ${productNames.length} products`);
    
    const { db } = await connectToDatabase();
    
    // Determine which collection to search
    let collectionToSearch = 'inventariocedis';
    
    if (predictionDate) {
      // Find the closest inventory snapshot to the prediction date (same logic as check-inventory.ts)
      const metadata = await db.collection('inventariocedis_metadata')
        .find()
        .sort({ timestamp: 1 }) 
        .toArray();
      
      if (metadata && metadata.length > 0) {
        const targetDate = new Date(predictionDate);
        let closestMetadata = metadata[0];
        let minDiff = Math.abs(new Date(metadata[0].timestamp).getTime() - targetDate.getTime());
        
        for (let i = 1; i < metadata.length; i++) {
          const recordDate = new Date(metadata[i].timestamp);
          const diff = Math.abs(recordDate.getTime() - targetDate.getTime());
          
          if (diff < minDiff) {
            closestMetadata = metadata[i];
            minDiff = diff;
          }
          
          if (recordDate > targetDate) {
            break;
          }
        }
        
        if (closestMetadata.collectionName) {
          collectionToSearch = closestMetadata.collectionName;
          console.log(`Selected historical inventory collection: ${collectionToSearch}`);
        }
      }
    }

    // Create regex patterns for all product names
    // This prepares an optimized query that can find matches for multiple products
    const regexPatterns = productNames.map(name => ({
      $regex: new RegExp(name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
    }));

    // Create array of conditions for $or query - each condition uses a regex pattern
    const orConditions = productNames.map(name => ({
      articulo: { $regex: new RegExp(name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }
    }));

    // Find all inventory items matching any of the product names using $or instead of $in
    const inventoryItems = await db.collection(collectionToSearch)
      .find({ 
        $or: orConditions 
      })
      .toArray();
    
    console.log(`Found ${inventoryItems.length} inventory items matching the batch request`);

    // Create a result map for fast lookup when matching results to requests
    const resultMap: Record<string, { 
      articulo: string, 
      existencia: number, 
      disponible: boolean 
    }> = {};

    // Process each inventory item
    for (const item of inventoryItems) {
      // Find which product name(s) this inventory item matches
      for (const productName of productNames) {
        if (item.articulo.toLowerCase().includes(productName.toLowerCase()) || 
            productName.toLowerCase().includes(item.articulo.toLowerCase())) {
          
          resultMap[productName] = {
            articulo: item.articulo,
            existencia: item.existencia,
            disponible: item.existencia > 0
          };
          break; // Once we find a match, move to the next inventory item
        }
      }
    }

    // For any product that didn't match, add a not-found entry
    productNames.forEach(name => {
      if (!resultMap[name]) {
        resultMap[name] = {
          articulo: name, 
          existencia: 0,
          disponible: false
        };
      }
    });

    return res.status(200).json({
      success: true,
      results: resultMap,
      collection: collectionToSearch,
      total: {
        requested: productNames.length,
        found: inventoryItems.length
      }
    });

  } catch (error) {
    console.error('Error checking batch inventory:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Error interno del servidor' 
    });
  }
}
