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
    
    // Modificación: Siempre usar las últimas 24 horas para el reporte
    // independientemente del período solicitado
    const endDate = new Date(); // Fecha actual
    const startDate = subDays(new Date(), 1); // 24 horas atrás
    
    // Format dates as ISO strings with just the date part
    const formattedStartDate = format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = format(endDate, 'yyyy-MM-dd');
    
    console.log(`Generando reporte de actividad para las últimas 24 horas: ${formattedStartDate} a ${formattedEndDate}`);
    
    // Build query with date range for the last 24 hours
    const query: any = {};
    
    // Para capturas actividades de las últimas 24 horas exactas, usamos timestamp en lugar de sessionDate
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    query.$or = [
      // Buscar en sesiones diarias por fecha
      {
        sessionDate: { $gte: formattedStartDate },
        // Si las fechas son iguales, usar hora
        ...(formattedStartDate === formattedEndDate ? 
          { startTime: { $gte: yesterday.toISOString() } } : {})
      },
      // Buscar en logs específicos por timestamp
      {
        timestamp: { $gte: yesterday }
      }
    ];
    
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
    
    // Obtener los logs de exportaciones de Excel (user_exports) de las últimas 24 horas
    const exportLogs = await db.collection('user_exports')
      .find({
        timestamp: { $gte: yesterday }
      })
      .toArray();
    
    // Obtener logs del sistema para acciones específicas
    const systemLogs = await db.collection('system_log')
      .find({
        timestamp: { $gte: yesterday },
        'details.action': { $in: ['export_excel', 'download_report'] }
      })
      .toArray();
    
    // Combine results 
    const allSessions = [...activeSessions, ...archivedSessions];
    
    // Group by user and date or month
    const result = groupSessionsByDateAndUser(allSessions, false);
    
    // Get list of unique branches in the result
    const uniqueBranches = new Set<string>();
    allSessions.forEach(session => {
      if (session.branch) uniqueBranches.add(session.branch);
    });
    
    return res.status(200).json({
      success: true,
      period: 'last24h', // Siempre reportamos últimas 24 horas
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      branch: branch || null,
      branches: Array.from(uniqueBranches),
      data: result,
      exportLogs,
      systemLogs
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
