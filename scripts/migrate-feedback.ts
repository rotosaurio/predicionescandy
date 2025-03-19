import { MongoClient } from 'mongodb';

// Run this script once to add predictionId to existing feedback records

async function migrateFeedback() {
  // Replace with your MongoDB connection string
  const uri = process.env.MONGODB_URI || '';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('inventory_predictions'); // Replace with your actual DB name
    const feedbackCollection = db.collection('feedback');
    
    // Get all feedback without predictionId
    const feedbackNoId = await feedbackCollection.find({ predictionId: { $exists: false } }).toArray();
    console.log(`Found ${feedbackNoId.length} feedback records without predictionId`);
    
    // For each feedback, find the matching prediction
    let updatedCount = 0;
    for (const feedback of feedbackNoId) {
      // Find the closest prediction for this feedback's date and branch
      const historyCollection = db.collection('predictions_history');
      const matchingPrediction = await historyCollection.find({
        branch: feedback.sucursal,
        date: feedback.fecha
      }).sort({ timestamp: -1 }).limit(1).toArray();
      
      if (matchingPrediction.length > 0) {
        // Update the feedback with the predictionId
        await feedbackCollection.updateOne(
          { _id: feedback._id },
          { $set: { predictionId: matchingPrediction[0].timestamp } }
        );
        updatedCount++;
      }
    }
    
    console.log(`Updated ${updatedCount} feedback records with prediction IDs`);
  } catch (error) {
    console.error('Error in migration:', error);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

migrateFeedback().catch(console.error);
