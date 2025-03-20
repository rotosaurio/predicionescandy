import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from './auth';

// Constants 
const IDLE_TIMEOUT = 60000; // 1 minute in milliseconds
const ACTIVITY_THRESHOLD = 10000; // 10 seconds of activity to consider user active
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

interface ActivityState {
  sessionId: string;
  sessionDate: string; // Track session date for daily consolidation
  startTime: number; // When the session started
  lastActivity: number;
  isIdle: boolean;
  idleStartTime?: number;
  totalIdleTime: number;
  activeStartTime: number;
  totalActiveTime: number;
  interactionCount: number;
  isTracking: boolean;
  events: any[];
  pendingEvents: any[];
  activityBuffer: number[]; // Store recent activity timestamps
  isVisible: boolean; // Track whether the page is visible
  pageHiddenTime?: number; // When the page was hidden
}

class ActivityTracker {
  private state: ActivityState;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    const now = Date.now();
    this.state = {
      sessionId: uuidv4(),
      sessionDate: new Date().toISOString().split('T')[0], // Store date as YYYY-MM-DD
      startTime: now,
      lastActivity: now,
      isIdle: false,
      totalIdleTime: 0,
      activeStartTime: now,
      totalActiveTime: 0,
      interactionCount: 0,
      isTracking: false,
      events: [],
      pendingEvents: [],
      activityBuffer: [],
      isVisible: true // Start with page visible
    };
  }

  // Start tracking user activity
  public startTracking(): void {
    if (this.state.isTracking) return;
    
    const now = Date.now();
    this.state.isTracking = true;
    this.state.sessionDate = new Date().toISOString().split('T')[0];
    this.state.startTime = now;
    this.state.lastActivity = now;
    this.state.activeStartTime = now;
    this.state.isVisible = document.visibilityState === 'visible';
    
    // Register event listeners for user activity
    window.addEventListener('mousemove', this.handleUserActivity);
    window.addEventListener('mousedown', this.handleUserInteraction);
    window.addEventListener('keydown', this.handleUserInteraction);
    window.addEventListener('scroll', this.handleUserActivity);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    // Add visibility change listener
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Start heartbeat to regularly check and report user state
    this.heartbeatInterval = setInterval(this.checkIdleState, HEARTBEAT_INTERVAL);
    
    // Record login event
    this.recordEvent('login', 'User logged in');
    
    // Submit pending events
    this.submitPendingEvents();
    
    console.log('Activity tracking started');
  }

  // Stop tracking user activity
  public stopTracking(): void {
    if (!this.state.isTracking) return;
    
    // Calculate final active time if user is not idle
    if (!this.state.isIdle && this.state.isVisible) {
      const activeTime = Date.now() - this.state.activeStartTime;
      this.state.totalActiveTime += activeTime;
    }
    
    // Calculate final idle time if page is not visible
    if (!this.state.isVisible && this.state.pageHiddenTime) {
      const inactiveTime = Date.now() - this.state.pageHiddenTime;
      this.state.totalIdleTime += inactiveTime;
    }
    
    // Remove event listeners
    window.removeEventListener('mousemove', this.handleUserActivity);
    window.removeEventListener('mousedown', this.handleUserInteraction);
    window.removeEventListener('keydown', this.handleUserInteraction);
    window.removeEventListener('scroll', this.handleUserActivity);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Record logout event
    this.recordEvent('logout', 'User logged out');
    
    // Submit all pending events
    this.submitPendingEvents(true);
    
    this.state.isTracking = false;
    
    console.log('Activity tracking stopped');
  }

  // Handle visibility change (tab switching)
  private handleVisibilityChange = (): void => {
    const now = Date.now();
    const isVisible = document.visibilityState === 'visible';
    
    console.log(`Page visibility changed: ${isVisible ? 'visible' : 'hidden'}`);
    
    if (isVisible) {
      // Page became visible again
      if (this.state.pageHiddenTime) {
        // Calculate how long the page was hidden
        const hiddenTime = now - this.state.pageHiddenTime;
        
        // Add to idle time
        this.state.totalIdleTime += hiddenTime;
        
        // Record event
        this.recordEvent('interaction', 'Page became visible again', undefined, hiddenTime);
        
        // Reset activeStartTime to now since we're starting a new active period
        this.state.activeStartTime = now;
      }
      
      this.state.pageHiddenTime = undefined;
    } else {
      // Page became hidden
      
      // If we were in an active state, calculate active time up to this point
      if (!this.state.isIdle) {
        const activeTime = now - this.state.activeStartTime;
        this.state.totalActiveTime += activeTime;
      }
      
      // Record when the page was hidden
      this.state.pageHiddenTime = now;
      
      // Record event
      this.recordEvent('interaction', 'Page hidden');
    }
    
    this.state.isVisible = isVisible;
  };

  // Record a page view
  public recordPageView(page: string): void {
    if (!this.state.isTracking) return;
    
    this.recordEvent('page_view', `Visited page: ${page}`, page);
  }

  // Handle user activity (movement without interaction)
  private handleUserActivity = (): void  => {
    // If page is not visible, don't process activity
    if (!this.state.isVisible) return;
    
    const now = Date.now();
    
    // Store this activity timestamp in buffer
    this.state.activityBuffer.push(now);
    
    // Keep only the most recent minute of activity timestamps
    this.state.activityBuffer = this.state.activityBuffer.filter(
      timestamp => now - timestamp < 60000
    );

    // If user was idle, calculate idle time
    if (this.state.isIdle && this.state.idleStartTime) {
      // Only consider user active again if there's been substantial activity
      if (this.state.activityBuffer.length >= 3) {
        const idleTime = now - this.state.idleStartTime;
        this.state.totalIdleTime += idleTime;
        
        // Record end of idle period if it was significant
        if (idleTime > IDLE_TIMEOUT) {
          this.recordEvent('interaction', 'User returned from being idle', undefined, idleTime);
        }
        
        this.state.isIdle = false;
        this.state.idleStartTime = undefined;
        this.state.activeStartTime = now; // Start a new active period
      }
    }
    
    this.state.lastActivity = now;
  };

  // Handle user interaction (clicks, typing)
  private handleUserInteraction = (): void => { 
    // If page is not visible, don't process interaction
    if (!this.state.isVisible) return;
    
    this.handleUserActivity();
    this.state.interactionCount++;
    
    // Record the interaction
    this.recordEvent('interaction', 'User interaction');
  };

  // Check if user has gone idle
  private checkIdleState = (): void => {
    // If page is not visible, don't check idle state
    if (!this.state.isVisible) return;
    
    const now = Date.now();
    const timeSinceLastActivity = now - this.state.lastActivity;
    
    // If user has been inactive for too long and not already marked as idle
    if (timeSinceLastActivity > IDLE_TIMEOUT && !this.state.isIdle) {
      // Calculate active time up to this point
      const activeTime = now - this.state.activeStartTime;
      this.state.totalActiveTime += activeTime;
      
      this.state.isIdle = true;
      this.state.idleStartTime = now;
      this.state.activityBuffer = []; // Clear activity buffer
      
      // Record the start of idle period
      this.recordEvent('interaction', 'User went idle');
    }
    
    // Submit any pending events periodically
    this.submitPendingEvents();
  };

  // Handle page unload event
  private handleBeforeUnload = (): void => {
    // If not idle and page is visible, calculate final active time
    if (!this.state.isIdle && this.state.isVisible) {
      const activeTime = Date.now() - this.state.activeStartTime;
      this.state.totalActiveTime += activeTime;
    }
    
    // If page is not visible, calculate final idle time
    if (!this.state.isVisible && this.state.pageHiddenTime) {
      const hiddenTime = Date.now() - this.state.pageHiddenTime;
      this.state.totalIdleTime += hiddenTime;
    }
    
    // Record logout on page unload
    this.recordEvent('logout', 'Page unloaded');
    
    // Try to submit events synchronously before page unload
    this.submitPendingEvents(true);
  };

  // Record an event
  private recordEvent(
    eventType: 'login' | 'logout' | 'interaction' | 'page_view',
    details?: string,
    page?: string,
    idleTime?: number
  ): void {
    const event = {
      timestamp: new Date(),
      eventType,
      details,
      page,
      idleTime
    };
    
    this.state.events.push(event);
    this.state.pendingEvents.push(event);
    
    // If we have accumulated several events or this is a significant event, submit right away
    if (this.state.pendingEvents.length >= 10 || eventType === 'login' || eventType === 'logout') {
      this.submitPendingEvents();
    }
  }

  // Submit pending events to the server
  private submitPendingEvents(isFinal: boolean = false): void {
    if (this.state.pendingEvents.length === 0) return;
    
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    // Calculate current times
    const now = Date.now();
    
    // Calculate current active time if not idle and page is visible
    let currentActiveTime = 0;
    if (!this.state.isIdle && this.state.isVisible && this.state.activeStartTime) {
      currentActiveTime = now - this.state.activeStartTime;
    }
    
    // Calculate current idle time if page is not visible or user is idle
    let currentIdleTime = 0;
    if (!this.state.isVisible && this.state.pageHiddenTime) {
      currentIdleTime = now - this.state.pageHiddenTime;
    } else if (this.state.isIdle && this.state.idleStartTime) {
      currentIdleTime = now - this.state.idleStartTime;
    }
    
    // Calculate total times
    const totalActiveTime = this.state.totalActiveTime + currentActiveTime;
    const totalIdleTime = this.state.totalIdleTime + currentIdleTime;
    
    // Log very clearly what we're submitting
    if (isFinal) {
      console.log(`ACTIVITY STATS:
        - Session duration: ${this.formatTime(now - this.state.startTime)}
        - Active time: ${this.formatTime(totalActiveTime)}
        - Idle time: ${this.formatTime(totalIdleTime)}
        - Total time accounted for: ${this.formatTime(totalActiveTime + totalIdleTime)}
        - Interactions: ${this.state.interactionCount}
      `);
    }
    
    const payload = {
      userId: currentUser.id,
      username: currentUser.username,
      branch: currentUser.branch,
      sessionId: this.state.sessionId,
      sessionDate: this.state.sessionDate,
      events: [...this.state.pendingEvents],
      interactionCount: this.state.interactionCount,
      totalActiveTime: totalActiveTime,
      totalIdleTime: totalIdleTime,
      isFinal,
      sessionStartTime: this.state.startTime,
      sessionDuration: now - this.state.startTime
    };
    
    // Clone and clear pending events before sending to avoid data loss if request fails
    const eventsToSend = [...this.state.pendingEvents];
    this.state.pendingEvents = [];
    
    // Submit events to the server
    fetch('/api/user-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .catch(error => {
      console.error('Failed to submit activity events:', error);
      // Put the events back in the pending queue to try again later
      this.state.pendingEvents = [...eventsToSend, ...this.state.pendingEvents];
    });
  }

  // Helper function to format time for logging
  private formatTime(ms: number): string {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  // Get current activity statistics
  public getActivityStats(): {
    sessionDuration: number;
    activeTime: number;
    idleTime: number;
    interactionCount: number;
  } {
    const now = Date.now();
    
    // Calculate current active time if not idle and page is visible
    let currentActiveTime = 0;
    if (!this.state.isIdle && this.state.isVisible && this.state.activeStartTime) {
      currentActiveTime = now - this.state.activeStartTime;
    }
    
    // Calculate current idle time if page is not visible
    let currentHiddenTime = 0;
    if (!this.state.isVisible && this.state.pageHiddenTime) {
      currentHiddenTime = now - this.state.pageHiddenTime;
    }
    
    const sessionDuration = now - this.state.startTime;
    const activeTime = this.state.totalActiveTime + currentActiveTime;
    const idleTime = this.state.totalIdleTime + currentHiddenTime + 
                    (this.state.isIdle && this.state.idleStartTime ? now - this.state.idleStartTime : 0);
    
    return {
      sessionDuration,
      activeTime,
      idleTime,
      interactionCount: this.state.interactionCount,
    };
  }
}

// Create singleton instance
let activityTrackerInstance: ActivityTracker;

// Get the activity tracker instance
export const getActivityTracker = (): ActivityTracker => {
  if (typeof window === 'undefined') {
    // Return a dummy tracker for server-side rendering
    return {
      startTracking: () => {},
      stopTracking: () => {},
      recordPageView: () => {},
      getActivityStats: () => ({ 
        sessionDuration: 0, 
        activeTime: 0, 
        idleTime: 0, 
        interactionCount: 0 
      })
    } as unknown as ActivityTracker;
  }
  
  if (!activityTrackerInstance) {
    activityTrackerInstance = new ActivityTracker();
  }
  
  return activityTrackerInstance;
};
