import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from './auth';
import { systemLogger } from './systemStatus';

// Constants 
const IDLE_TIMEOUT = 60000; // 1 minute in milliseconds
const ACTIVITY_THRESHOLD = 10000; // 10 seconds of activity to consider user active
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Logger interno simplificado
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[ACTIVITY-TRACKER] [INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`[ACTIVITY-TRACKER] [ERROR] ${message}`, data ? JSON.stringify(data) : '');
  },
  debug: (message: string, data?: any) => {
    console.log(`[ACTIVITY-TRACKER] [DEBUG] ${message}`, data ? JSON.stringify(data) : '');
  }
};

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
  private isTracking: boolean = false;
  private lastActivityTime: number = 0;
  private sessionStartTime: number = 0;
  private activityCheckInterval: NodeJS.Timeout | null = null;
  private pageViews: Array<{ path: string, timestamp: number }> = [];
  private idleThreshold: number = 5 * 60 * 1000; // 5 minutos en ms
  
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

  /**
   * Iniciar el seguimiento de actividad
   */
  startTracking(): void {
    if (this.isTracking) return;
    
    try {
      this.isTracking = true;
      this.sessionStartTime = Date.now();
      this.lastActivityTime = Date.now();
      
      // Registrar actividad inicial
      logger.info('Iniciando seguimiento de actividad');
      
      // Configurar listeners de eventos
      if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', this.handleUserActivity);
        window.addEventListener('keydown', this.handleUserActivity);
        window.addEventListener('click', this.handleUserActivity);
    window.addEventListener('scroll', this.handleUserActivity);
        window.addEventListener('visibilitychange', this.handleVisibilityChange);
        
        // Comprobar inactividad periódicamente
        this.activityCheckInterval = setInterval(() => this.checkActivity(), 60000); // cada minuto
      }
    } catch (error) {
      logger.error('Error al iniciar seguimiento de actividad', error);
    }
  }
  
  /**
   * Detener el seguimiento de actividad
   */
  stopTracking(): void {
    if (!this.isTracking) return;
    
    try {
      this.isTracking = false;
      
      // Limpiar listeners de eventos
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', this.handleUserActivity);
        window.removeEventListener('keydown', this.handleUserActivity);
        window.removeEventListener('click', this.handleUserActivity);
        window.removeEventListener('scroll', this.handleUserActivity);
        window.removeEventListener('visibilitychange', this.handleVisibilityChange);
      }
      
      // Limpiar intervalo
      if (this.activityCheckInterval) {
        clearInterval(this.activityCheckInterval);
        this.activityCheckInterval = null;
      }
      
      // Registrar fin de seguimiento
      const sessionDuration = Date.now() - this.sessionStartTime;
      logger.info('Finalizando seguimiento de actividad', { 
        sessionDuration: Math.floor(sessionDuration / 1000), 
        pageViews: this.pageViews.length 
      });
      
      // Reiniciar contadores
      this.pageViews = [];
    } catch (error) {
      logger.error('Error al detener seguimiento de actividad', error);
    }
  }
  
  /**
   * Manejar eventos de actividad del usuario
   */
  private handleUserActivity = (): void => {
    this.lastActivityTime = Date.now();
  };
  
  /**
   * Manejar cambios de visibilidad de la página
   */
  private handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined') {
      if (document.visibilityState === 'visible') {
        logger.debug('Página visible - reanudando seguimiento');
        this.lastActivityTime = Date.now();
      } else {
        logger.debug('Página oculta - pausando seguimiento');
      }
    }
  };
  
  /**
   * Comprobar si el usuario está inactivo
   */
  private checkActivity(): void {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;
    
    if (timeSinceLastActivity > this.idleThreshold) {
      logger.debug('Usuario inactivo detectado', { 
        inactiveTime: Math.floor(timeSinceLastActivity / 1000) 
      });
    }
  }
  
  /**
   * Registrar vista de página
   */
  recordPageView(path: string): void {
    if (!this.isTracking) return;
    
    try {
      this.pageViews.push({
        path,
        timestamp: Date.now()
      });
      
      this.lastActivityTime = Date.now();
      logger.debug('Vista de página registrada', { path });
    } catch (error) {
      logger.error('Error al registrar vista de página', error);
    }
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

// Singleton para el tracker de actividad
let activityTrackerInstance: ActivityTracker | null = null;

/**
 * Obtener la instancia del tracker de actividad
 */
export function getActivityTracker(): ActivityTracker {
  if (!activityTrackerInstance) {
    activityTrackerInstance = new ActivityTracker();
  }
  return activityTrackerInstance;
}

export default getActivityTracker;
