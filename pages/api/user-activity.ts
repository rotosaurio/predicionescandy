import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    
    // POST - Record user activity
    if (req.method === 'POST') {
      const {
        userId,
        username,
        branch,
        sessionId,
        sessionDate, // Use this for daily consolidation
        events,
        interactionCount,
        totalActiveTime,
        totalIdleTime,
        isFinal,
        sessionStartTime
      } = req.body;

      if (!userId || !username || !sessionId || !events || events.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }

      // Find existing session for this user and date
      const dailySessionQuery = { 
        userId,
        sessionDate: sessionDate || new Date().toISOString().split('T')[0]
      };
      
      let session = await db.collection('user_daily_sessions').findOne(dailySessionQuery);
      
      const eventStartTime = new Date(events[0].timestamp);
      
      if (!session) {
        // Create a new daily session
        session = {
          ...dailySessionQuery,
          username,
          branch,
          startTime: eventStartTime,
          endTime: new Date(), // Will be updated with the latest time
          sessionIds: [sessionId], // Track all session IDs that are part of this day
          events: [],
          totalActiveTime: 0,
          totalIdleTime: 0,
          interactionCount: 0,
          lastUpdated: new Date(),
          sessionStartTime: sessionStartTime || Date.now() // Store the client-side session start time
        };
      } else if (!session.sessionIds.includes(sessionId)) {
        // Add this sessionId to the list if it's not already there
        session.sessionIds.push(sessionId);
      }

      // Filter out duplicate events
      const newEvents = events.filter((event: { details: string; timestamp: string }) => 
        !session.events.some((existingEvent: { details: string; timestamp: string }) => 
          existingEvent.details === event.details && 
          new Date(existingEvent.timestamp).getTime() === new Date(event.timestamp).getTime()
        )
      );

      // Update session with new data - CRITICAL FIX
      session.events = [...session.events, ...newEvents];
      
      // Don't accumulate times; use the latest values from the client
      session.totalActiveTime = totalActiveTime;
      session.totalIdleTime = totalIdleTime;
      session.interactionCount = interactionCount;
      session.lastUpdated = new Date();
      
      // If this is the final update for this session component, update the end time
      if (isFinal) {
        session.endTime = new Date();
      }
      
      // Upsert the daily session
      await db.collection('user_daily_sessions').updateOne(
        dailySessionQuery,
        { $set: session },
        { upsert: true }
      );

      // Update user stats
      await updateUserActivityStats(db, userId, username, branch, isFinal ? session : null);

      return res.status(200).json({ success: true });
    }
    
    // GET - Retrieve user activity data
    if (req.method === 'GET') {
      const { userId, branch, startDate, endDate } = req.query;
      
      // Build query
      let query: any = {};
      
      if (userId) {
        query.userId = userId;
      }
      
      if (branch) {
        query.branch = branch;
      }
      
      if (startDate || endDate) {
        query.sessionDate = {};
        if (startDate) {
          query.sessionDate.$gte = startDate as string;
        }
        if (endDate) {
          query.sessionDate.$lte = endDate as string;
        }
      }
      
      // For single user stats
      if (userId) {
        // Get user overall stats
        const userStats = await db.collection('user_activity_stats').findOne({ userId });
        
        if (!userStats) {
          return res.status(404).json({ success: false, message: 'User stats not found' });
        }
        
        // Get daily sessions, now sorted by date
        const dailySessions = await db.collection('user_daily_sessions')
          .find({ userId })
          .sort({ sessionDate: -1 })
          .limit(14) // Show last 2 weeks
          .toArray();
        
        // If we have sessions but userStats shows zeros, recalculate the stats
        if (dailySessions.length > 0 && 
            (userStats.totalActiveTime === 0 && userStats.totalIdleTime === 0 && userStats.totalSessions === 0)) {
          // Calculate totals from sessions
          let totalActiveTime = 0;
          let totalIdleTime = 0;
          let totalInteractions = 0;
          const uniqueDates = new Set();
          
        interface DailySession {
            totalActiveTime?: number;
            totalIdleTime?: number;
            interactionCount?: number;
            sessionDate: string;
        }

                            dailySessions.forEach((session: DailySession) => {
                                totalActiveTime += session.totalActiveTime || 0;
                                totalIdleTime += session.totalIdleTime || 0;
                                totalInteractions += session.interactionCount || 0;
                                uniqueDates.add(session.sessionDate);
                            });
          
          // Update user stats
          const updatedStats = {
            ...userStats,
            totalSessions: uniqueDates.size,
            totalActiveTime,
            totalIdleTime,
            totalInteractions,
            averageSessionDuration: uniqueDates.size > 0 ? (totalActiveTime + totalIdleTime) / uniqueDates.size : 0,
            averageActiveTimePerSession: uniqueDates.size > 0 ? totalActiveTime / uniqueDates.size : 0,
            lastActive: new Date()
          };
          
          // Update in database
          await db.collection('user_activity_stats').updateOne(
            { userId },
            { $set: updatedStats }
          );
          
          // Return updated stats
          return res.status(200).json({ 
            success: true, 
            userStats: updatedStats,
            recentSessions: dailySessions 
          });
        }
        
        return res.status(200).json({ 
          success: true, 
          userStats,
          recentSessions: dailySessions 
        });
      } else {
        // Return all users' stats
        const allUserStats = await db.collection('user_activity_stats')
          .find({})
          .sort({ lastActive: -1 })
          .toArray();
        
        return res.status(200).json({ success: true, stats: allUserStats });
      }
    }
  } catch (error) {
    console.error('Error in user-activity API:', error);
    res.status(500).json({ success: false, message: 'Server error', error: (error as Error).message });
  }
}

// These collections store historical user activity:
// 1. user_daily_sessions - Daily consolidated sessions
// 2. user_activity_stats - Overall user statistics
// 3. user_session_dates - Tracking unique active dates per user

async function updateUserActivityStats(db: any, userId: string, username: string, branch?: string, completedSession?: any) {
  // Get current stats
  let userStats = await db.collection('user_activity_stats').findOne({ userId });
  
  if (!userStats) {
    // Create new stats object if it doesn't exist
    userStats = {
      userId,
      username,
      branch,
      totalSessions: 0, // Now counts days of activity
      totalActiveTime: 0,
      totalIdleTime: 0,
      totalInteractions: 0,
      averageSessionDuration: 0,
      averageActiveTimePerSession: 0,
      lastActive: new Date(),
      mostVisitedPages: []
    };
  }
  
  // Update last active time
  userStats.lastActive = new Date();
  
  // If this is a completed session component, and we're marking a session as final,
  // increment the session counter only if this is the first time we've seen this date
  if (completedSession && completedSession.sessionDate) {
    // Check if we've already counted this date
    const sessionDatesCount = await db.collection('user_session_dates')
      .countDocuments({ userId, sessionDate: completedSession.sessionDate });
    
    // IMPORTANT FIX: Always update active time, idle time and interactions
    // even if we've already counted this session date
    const newActiveTime = completedSession.totalActiveTime || 0;
    const newIdleTime = completedSession.totalIdleTime || 0;
    const newInteractions = completedSession.interactionCount || 0;
    
    console.log(`Updating stats for ${username} - Active: ${formatDuration(newActiveTime)}, Idle: ${formatDuration(newIdleTime)}, Int: ${newInteractions}`);
    
    // Update the cumulative stats
    userStats.totalActiveTime += newActiveTime;
    userStats.totalIdleTime += newIdleTime;
    userStats.totalInteractions += newInteractions;
    
    if (sessionDatesCount === 0) {
      // This is a new date - increment the counter and record it
      userStats.totalSessions += 1;
      await db.collection('user_session_dates').insertOne({
        userId,
        sessionDate: completedSession.sessionDate
      });
      
      // Recalculate averages based on all daily sessions
      // ...existing code for recalculating averages...
    }
    
    // Update most visited pages
    // ...existing code for page visits...
  }
  
  // Update or insert the stats
  await db.collection('user_activity_stats').updateOne(
    { userId },
    { $set: userStats },
    { upsert: true }
  );
  
  return userStats;
}

// Helper function to format duration for logging
function formatDuration(ms: number): string {
  if (!ms) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
