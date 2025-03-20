import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { subMonths } from 'date-fns';

interface UserDailySession {
  sessionDate: string;
  events?: Array<{
    eventType: string;
    page?: string;
  }>;
  [key: string]: any; // Allow additional properties
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests with authentication
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Simple Auth - use admin key for security
  const { adminKey } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { db } = await connectToDatabase();
    
    // Archive data older than X months (default: 3 months)
    const monthsToKeep = req.body.monthsToKeep || 3;
    const cutoffDate = subMonths(new Date(), monthsToKeep).toISOString().split('T')[0];
    
    console.log(`Archiving data older than ${cutoffDate}`);
    
    // 1. Find sessions to archive (older than cutoff date)
    const sessionsToArchive = await db.collection('user_daily_sessions')
      .find({ sessionDate: { $lt: cutoffDate } })
      .toArray();
    
    if (sessionsToArchive.length > 0) {
      // 2. Insert into archive collection
    await db.collection('user_activity_archive').insertMany(
      sessionsToArchive.map((session: UserDailySession) => ({
        ...session,
        archivedAt: new Date(),
        // We can compress the events array to save space
        eventCount: session.events?.length || 0,
        eventsSummary: summarizeEvents(session.events),
        // Remove the full events array to save space
        events: undefined
      }))
    );
      
      // 3. Delete from active collection
      const result = await db.collection('user_daily_sessions').deleteMany({
        sessionDate: { $lt: cutoffDate }
      });
      
      return res.status(200).json({ 
        success: true, 
        message: `Archived ${sessionsToArchive.length} sessions, deleted ${result.deletedCount} records`,
        sessionDate: cutoffDate
      });
    } else {
      return res.status(200).json({ 
        success: true, 
        message: 'No sessions to archive found',
        sessionDate: cutoffDate
      });
    }
  } catch (error) {
    console.error('Error archiving user activity data:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: (error as Error).message 
    });
  }
}

// Helper function to create a summary of events
function summarizeEvents(events: any[] = []) {
  if (!events || events.length === 0) return {};
  
  const summary = {
    loginCount: 0,
    logoutCount: 0,
    interactionCount: 0,
    pageViewCount: 0,
    pagesVisited: new Set<string>()
  };
  
  events.forEach(event => {
    switch (event.eventType) {
      case 'login': summary.loginCount++; break;
      case 'logout': summary.logoutCount++; break;
      case 'interaction': summary.interactionCount++; break;
      case 'page_view': 
        summary.pageViewCount++; 
        if (event.page) summary.pagesVisited.add(event.page);
        break;
    }
  });
  
  return {
    ...summary,
    pagesVisited: Array.from(summary.pagesVisited)
  };
}
