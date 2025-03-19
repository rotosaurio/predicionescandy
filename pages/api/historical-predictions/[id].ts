import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../../lib/mongodb';

const DB_NAME = 'inventory_predictions';
const COLLECTION_NAME = 'predictions_history';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const { timestamp } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing branch ID' });
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);

    console.log(`[API] Looking up historical predictions for branch: "${id}", timestamp: "${timestamp || 'latest'}"`);
    
    // Build query to filter by branch and optionally by timestamp
    // Important: Use case-insensitive regex for branch names
    const query: any = { 
      $or: [
        { branch: new RegExp(`^${escapeRegExp(id)}$`, 'i') },
        { branch: id.toUpperCase() }, 
        { branch: id }
      ]
    };

    if (timestamp && typeof timestamp === 'string') {
      try {
        // Try to match the exact timestamp string
        query.timestamp = timestamp;
      } catch (parseError) {
        console.error('[API] Error parsing timestamp:', parseError);
      }
    }

    console.log('[API] MongoDB Query:', JSON.stringify(query));
    
    // Fetch historical predictions
    const historicalPredictions = await collection.find(query).sort({ timestamp: -1 }).toArray();

    console.log(`[API] Found ${historicalPredictions.length} prediction records`);

    if (!historicalPredictions || historicalPredictions.length === 0) {
      // Try a more flexible approach without timestamp constraint
      delete query.timestamp;
      console.log('[API] No results with timestamp, trying without timestamp:', JSON.stringify(query));
      const fallbackResults = await collection.find(query).sort({ timestamp: -1 }).limit(1).toArray();
      
      if (fallbackResults && fallbackResults.length > 0) {
        console.log('[API] Found fallback result:', fallbackResults[0]._id);
        return res.status(200).json({ historicalPredictions: fallbackResults });
      }
      
      return res.status(404).json({ 
        error: 'No historical predictions found for this branch',
        query: query,
        branch: id
      });
    }

    res.status(200).json({ historicalPredictions });
  } catch (error) {
    console.error('[API] Error fetching historical predictions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper function to escape special characters in regex
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
