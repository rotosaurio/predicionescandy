import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { subDays, subMonths, format } from 'date-fns';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    const { 
      period = 'month', 
      userId, 
      adminKey, 
      branch,
      startDate: customStartDate, 
      endDate: customEndDate 
    } = req.query;
    
    // Only admins should be able to run reports
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    let startDate;
    let endDate = new Date(); // Default end date is current date
    let groupBy = '%Y-%m-%d'; // Default to group by day
    
    // Determine date range based on period or custom dates
    if (period === 'custom' && customStartDate) {
      startDate = new Date(customStartDate as string);
      if (customEndDate) {
        endDate = new Date(customEndDate as string);
        // Set to end of day
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      // Use predefined periods
      switch (period) {
        case 'week':
          startDate = subDays(new Date(), 7);
          break;
        case 'month':
          startDate = subMonths(new Date(), 1);
          break;
        case 'quarter':
          startDate = subMonths(new Date(), 3);
          break;
        case 'year':
          startDate = subMonths(new Date(), 12);
          groupBy = '%Y-%m'; // Group by month for yearly reports
          break;
        default:
          startDate = subMonths(new Date(), 1);
      }
    }
    
    // Format dates as ISO strings with just the date part
    const formattedStartDate = format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = format(endDate, 'yyyy-MM-dd');
    
    // Build query with date range
    const query: any = {
      sessionDate: { 
        $gte: formattedStartDate
      }
    };
    
    // Add end date to query if it's not today
    if (formattedEndDate !== format(new Date(), 'yyyy-MM-dd')) {
      query.sessionDate.$lte = formattedEndDate;
    }
    
    // Add userId filter if provided
    if (userId) {
      query.userId = userId;
    }
    
    // Add branch filter if provided
    if (branch && branch !== '') {
      query.branch = branch;
    }
    
    // Get daily sessions from both active and archive collections
    const activeSessions = await db.collection('user_daily_sessions')
      .find(query)
      .project({
        userId: 1,
        username: 1,
        branch: 1,
        sessionDate: 1,
        totalActiveTime: 1,
        totalIdleTime: 1,
        interactionCount: 1,
        startTime: 1,
        endTime: 1
      })
      .toArray();
      
    // Also check archived data if needed
    const archivedSessions = await db.collection('user_activity_archive')
      .find(query)
      .project({
        userId: 1,
        username: 1,
        branch: 1,
        sessionDate: 1,
        totalActiveTime: 1,
        totalIdleTime: 1,
        interactionCount: 1,
        startTime: 1,
        endTime: 1
      })
      .toArray();
    
    // Combine results 
    const allSessions = [...activeSessions, ...archivedSessions];
    
    // Group by user and date or month
    const result = groupSessionsByDateAndUser(allSessions, groupBy === '%Y-%m');
    
    // Get list of unique branches in the result
    const uniqueBranches = new Set<string>();
    allSessions.forEach(session => {
      if (session.branch) uniqueBranches.add(session.branch);
    });
    
    return res.status(200).json({
      success: true,
      period,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      branch: branch || null,
      branches: Array.from(uniqueBranches),
      data: result
    });
    
  } catch (error) {
    console.error('Error generating activity report:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: (error as Error).message 
    });
  }
}

// Helper to group sessions by date and user
function groupSessionsByDateAndUser(sessions: any[], groupByMonth = false) {
  const groupedData: Record<string, Record<string, any>> = {};
  
  sessions.forEach(session => {
    const { userId, username, sessionDate, totalActiveTime, totalIdleTime, interactionCount } = session;
    
    // Format the date based on grouping (month or day)
    const dateKey = groupByMonth ? sessionDate.substring(0, 7) : sessionDate;
    
    // Create date group if it doesn't exist
    if (!groupedData[dateKey]) {
      groupedData[dateKey] = {};
    }
    
    // Create or update user data within this date
    if (!groupedData[dateKey][userId]) {
      groupedData[dateKey][userId] = {
        userId,
        username,
        totalActiveTime: 0,
        totalIdleTime: 0,
        interactionCount: 0,
        sessionCount: 0
      };
    }
    
    // Add this session's stats
    const userStats = groupedData[dateKey][userId];
    userStats.totalActiveTime += totalActiveTime || 0;
    userStats.totalIdleTime += totalIdleTime || 0;
    userStats.interactionCount += interactionCount || 0;
    userStats.sessionCount++;
  });
  
  // Convert to array format
  const result = Object.entries(groupedData).map(([date, users]) => ({
    date,
    users: Object.values(users)
  }));
  
  // Sort by date
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
