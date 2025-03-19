import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

interface InventoryItem {
  articulo: string;
  existencia: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
      const { productName, predictionDate } = req.query;
    
    if (!productName) {
      return res.status(400).json({ success: false, message: 'Nombre de producto requerido' });
    }

    // Parse the productName and predictionDate (could be string or array)
    const parsedProductName = Array.isArray(productName) ? productName[0] : productName;
    const parsedPredictionDate = Array.isArray(predictionDate) ? predictionDate[0] : predictionDate;

    // Log what we're searching for to help debug
    console.log(`Searching for product: "${parsedProductName}"${parsedPredictionDate ? ` with prediction date: ${parsedPredictionDate}` : ''}`);

    const { db } = await connectToDatabase();
    
    // Determine which collection to search based on prediction date
    let collectionToSearch = 'inventariocedis';
    
    if (parsedPredictionDate) {
      // Find the closest inventory snapshot to the prediction date
      const metadata = await db.collection('inventariocedis_metadata')
        .find()
        .sort({ timestamp: 1 }) // Sort by timestamp ascending
        .toArray();
      
      if (metadata && metadata.length > 0) {
        // Convert prediction date to date object for comparison
        const targetDate = new Date(parsedPredictionDate);
        let closestMetadata = metadata[0];
        let minDiff = Math.abs(new Date(metadata[0].timestamp).getTime() - targetDate.getTime());
        
        // Find the closest inventory snapshot
        for (let i = 1; i < metadata.length; i++) {
          const recordDate = new Date(metadata[i].timestamp);
          const diff = Math.abs(recordDate.getTime() - targetDate.getTime());
          
          // If we find an inventory that's closer to our target date
          if (diff < minDiff) {
            closestMetadata = metadata[i];
            minDiff = diff;
          }
          
          // If we have an inventory that's after our prediction date, stop searching
          // This ensures we get the inventory that was valid at the time of prediction
          if (recordDate > targetDate) {
            break;
          }
        }
        
        // Use the collection name from the closest metadata
        if (closestMetadata.collectionName) {
          collectionToSearch = closestMetadata.collectionName;
          console.log(`Selected historical inventory collection: ${collectionToSearch}`);
        }
      } else {
        console.log('No inventory metadata found, using current inventory');
      }
    }
    
    // Try multiple search strategies in order of precision
    
    // 1. First try exact match (case-insensitive)
    let inventoryItem = await db.collection(collectionToSearch).findOne({ 
      articulo: { $regex: new RegExp(`^${parsedProductName}$`, 'i') } 
    });
    
    // 2. If not found, try exact match with normalized string (remove extra spaces)
    if (!inventoryItem) {
      const normalizedName = parsedProductName.toString().trim().replace(/\s+/g, ' ');
      console.log(`Trying normalized name: "${normalizedName}"`);
      inventoryItem = await db.collection(collectionToSearch).findOne({ 
        articulo: { $regex: new RegExp(`^${normalizedName}$`, 'i') } 
      });
    }
    
    // 3. If still not found, try partial match that contains the product name
    if (!inventoryItem) {
      console.log(`Trying partial match for: "${parsedProductName}"`);
      inventoryItem = await db.collection(collectionToSearch).findOne({ 
        articulo: { $regex: new RegExp(parsedProductName.toString().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') } 
      });
    }
    
    // 4. List all inventory items that have a similar name for debugging
    if (!inventoryItem) {
      console.log("Product not found. Looking for similar items...");
      // Get a list of all items that might be similar for debugging
      const searchTerm = parsedProductName.toString().split(' ')[0]; // Use just the first word
      const similarItems = await db.collection(collectionToSearch)
        .find({ articulo: { $regex: new RegExp(searchTerm, 'i') } })
        .limit(5)
        .toArray();
      
      console.log("Similar items found:", similarItems.map((item: InventoryItem) => item.articulo));  
      
      // Try one more search with just the first word
      if (searchTerm.length > 3) { // Only if the first word is meaningful
        inventoryItem = await db.collection(collectionToSearch).findOne({ 
          articulo: { $regex: new RegExp(searchTerm, 'i') } 
        });
      }
    }

    // Add a special case for known problematic products
    if (!inventoryItem) {
      // Hard-coded matches for specific product names that we know are problematic
      const specialCases: Record<string, string> = {
        'MINI OBLEAS SUGAR FREE 6P/10G': 'MINI OBLEAS SUGAR FREE 6P/10G',
        // Add more special cases as needed
      };
      
      // Check if we have a special case for this product
      const normalizedProductName = parsedProductName.toString().trim().toUpperCase();
      for (const [key, value] of Object.entries(specialCases)) {
        if (normalizedProductName === key) {
          console.log(`Found special case match for "${parsedProductName}"`);
          inventoryItem = await db.collection(collectionToSearch).findOne({ 
            articulo: value 
          });
          break;
        }
      }
    }
    
    // Log the result
    if (inventoryItem) {
      console.log(`Found inventory item: ${inventoryItem.articulo} with ${inventoryItem.existencia} units in collection ${collectionToSearch}`);
    } else {
      console.log(`No inventory found for product: ${parsedProductName}`);
    }
    
    return res.status(200).json({
      success: true,
      found: !!inventoryItem,
      data: inventoryItem ? {
        articulo: inventoryItem.articulo,
        existencia: inventoryItem.existencia,
        disponible: inventoryItem.existencia > 0
      } : null,
      collection: collectionToSearch
    });

  } catch (error) {
    console.error('Error checking inventory:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Error interno del servidor' 
    });
  }
}
