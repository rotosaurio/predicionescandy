import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';

interface UserDailySession {
  userId: string;
  sessionDate: string;
  totalActiveTime?: number;
  totalIdleTime?: number;
  interactionCount?: number;
  startTime?: string;
  endTime?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests with authentication
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Simple Auth - you can improve this
  const { adminKey } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { db } = await connectToDatabase();
    
    // Get all users with activity
    const users = await db.collection('user_activity_stats').find({}).toArray();
    
    const results = [];
    
    // For each user, recalculate their stats
    for (const user of users) {
      // Get all daily sessions for this user
      const dailySessions = await db.collection('user_daily_sessions')
        .find({ userId: user.userId })
        .sort({ sessionDate: 1 })
        .toArray();
      
      // Create empty date records if needed
    const uniqueDates: Set<string> = new Set(dailySessions.map((session: UserDailySession) => session.sessionDate));
      
      // Make sure we have a record for each date
      for (const date of Array.from(uniqueDates)) {
        const exists = await db.collection('user_session_dates')
          .countDocuments({ userId: user.userId, sessionDate: date });
        
        if (exists === 0) {
          await db.collection('user_session_dates').insertOne({
            userId: user.userId,
            sessionDate: date
          });
        }
      }
      
      // Calculate totals
      let totalActiveTime = 0;
      let totalIdleTime = 0;
      let totalInteractions = 0;
      let totalDuration = 0;
      
      for (const session of dailySessions) {
        totalActiveTime += session.totalActiveTime || 0;
        totalIdleTime += session.totalIdleTime || 0;
        totalInteractions += session.interactionCount || 0;
        
        if (session.startTime && session.endTime) {
          const duration = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
          totalDuration += duration;
        }
      }
      
      // Update user stats
      const updatedStats = {
        totalSessions: uniqueDates.size,
        totalActiveTime,
        totalIdleTime,
        totalInteractions,
        averageSessionDuration: uniqueDates.size > 0 ? totalDuration / uniqueDates.size : 0,
        averageActiveTimePerSession: uniqueDates.size > 0 ? totalActiveTime / uniqueDates.size : 0,
        lastActive: user.lastActive || new Date()
      };
      
      await db.collection('user_activity_stats').updateOne(
        { userId: user.userId },
        { $set: updatedStats }
      );
      
      results.push({
        userId: user.userId,
        username: user.username,
        uniqueDates: uniqueDates.size,
        totalActiveTime,
        totalIdleTime,
        totalInteractions
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: `Fixed stats for ${results.length} users`,
      results
    });
    
  } catch (error) {
    console.error('Error fixing user stats:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: (error as Error).message 
    });
  }
}
