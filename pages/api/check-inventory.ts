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
    const { productName } = req.query;
    
    if (!productName) {
      return res.status(400).json({ success: false, message: 'Nombre de producto requerido' });
    }

    // Log what we're searching for to help debug
    console.log(`Searching for product: "${productName}"`);

    const { db } = await connectToDatabase();
    
    // Try multiple search strategies in order of precision
    
    // 1. First try exact match (case-insensitive)
    let inventoryItem = await db.collection('inventariocedis').findOne({ 
      articulo: { $regex: new RegExp(`^${productName}$`, 'i') } 
    });
    
    // 2. If not found, try exact match with normalized string (remove extra spaces)
    if (!inventoryItem) {
      const normalizedName = productName.toString().trim().replace(/\s+/g, ' ');
      console.log(`Trying normalized name: "${normalizedName}"`);
      inventoryItem = await db.collection('inventariocedis').findOne({ 
        articulo: { $regex: new RegExp(`^${normalizedName}$`, 'i') } 
      });
    }
    
    // 3. If still not found, try partial match that contains the product name
    if (!inventoryItem) {
      console.log(`Trying partial match for: "${productName}"`);
      inventoryItem = await db.collection('inventariocedis').findOne({ 
        articulo: { $regex: new RegExp(productName.toString().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') } 
      });
    }
    
    // 4. List all inventory items that have a similar name for debugging
    if (!inventoryItem) {
      console.log("Product not found. Looking for similar items...");
      // Get a list of all items that might be similar for debugging
      const searchTerm = productName.toString().split(' ')[0]; // Use just the first word
      const similarItems = await db.collection('inventariocedis')
        .find({ articulo: { $regex: new RegExp(searchTerm, 'i') } })
        .limit(5)
        .toArray();
      
      console.log("Similar items found:", similarItems.map((item: InventoryItem) => item.articulo));  
      
      // Try one more search with just the first word
      if (searchTerm.length > 3) { // Only if the first word is meaningful
        inventoryItem = await db.collection('inventariocedis').findOne({ 
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
      const normalizedProductName = productName.toString().trim().toUpperCase();
      for (const [key, value] of Object.entries(specialCases)) {
        if (normalizedProductName === key) {
          console.log(`Found special case match for "${productName}"`);
          inventoryItem = await db.collection('inventariocedis').findOne({ 
            articulo: value 
          });
          break;
        }
      }
    }
    
    // Log the result
    if (inventoryItem) {
      console.log(`Found inventory item: ${inventoryItem.articulo} with ${inventoryItem.existencia} units`);
    } else {
      console.log(`No inventory found for product: ${productName}`);
    }
    
    return res.status(200).json({
      success: true,
      found: !!inventoryItem,
      data: inventoryItem ? {
        articulo: inventoryItem.articulo,
        existencia: inventoryItem.existencia,
        disponible: inventoryItem.existencia > 0
      } : null
    });

  } catch (error) {
    console.error('Error checking inventory:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Error interno del servidor' 
    });
  }
}
