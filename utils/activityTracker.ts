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
        
        // Enviar heartbeats periódicos para mantener la sesión actualizada
        this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL);
        
        // Enviar heartbeat inicial
        this.sendHeartbeat();
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
      
      // Enviar un último heartbeat antes de detener
      this.sendHeartbeat();
      
      // Limpiar listeners de eventos
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', this.handleUserActivity);
        window.removeEventListener('keydown', this.handleUserActivity);
        window.removeEventListener('click', this.handleUserActivity);
        window.removeEventListener('scroll', this.handleUserActivity);
        window.removeEventListener('visibilitychange', this.handleVisibilityChange);
      }
      
      // Limpiar intervalos
      if (this.activityCheckInterval) {
        clearInterval(this.activityCheckInterval);
        this.activityCheckInterval = null;
      }
      
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      
      // Registrar fin de seguimiento
      const sessionDuration = Date.now() - this.sessionStartTime;
      logger.info('Finalizando seguimiento de actividad', { 
        sessionDuration: Math.floor(sessionDuration / 1000), 
        pageViews: this.pageViews.length 
      });
      
      // Intentar enviar evento de fin de sesión
      this.sendSessionEnd();
      
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
   * Enviar heartbeat para mantener sesión actualizada
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      // Obtener usuario actual
      const user = getCurrentUser();
      if (!user) {
        logger.debug('No hay usuario autenticado para enviar heartbeat');
        return;
      }
      
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isIdle = (Date.now() - this.lastActivityTime) > this.idleThreshold;
      
      const heartbeatData = {
        userId: user.id,
        username: user.username,
        branch: user.sucursal,
        sessionId: this.state.sessionId,
        activityType: 'heartbeat',
        metadata: {
          currentPage: currentPath,
          isIdle,
          timestamp: new Date().toISOString()
        }
      };
      
      // Asegurar que siempre usamos la fecha actual
      this.state.sessionDate = new Date().toISOString().split('T')[0];
      
      logger.debug('Enviando heartbeat', { 
        userId: user.id, 
        page: currentPath,
        isIdle,
        sessionDate: this.state.sessionDate
      });
      
      const response = await fetch('/api/user-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(heartbeatData)
      });
      
      if (!response.ok) {
        throw new Error(`Error al enviar heartbeat: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Error al enviar heartbeat', error);
    }
  }
  
  /**
   * Enviar evento de fin de sesión
   */
  private async sendSessionEnd(): Promise<void> {
    try {
      // Obtener usuario actual
      const user = getCurrentUser();
      if (!user) {
        logger.debug('No hay usuario autenticado para finalizar sesión');
        return;
      }
      
      const sessionEndData = {
        userId: user.id,
        username: user.username,
        branch: user.sucursal,
        sessionId: this.state.sessionId,
        activityType: 'session_end',
        pageViews: this.pageViews,
        metadata: {
          currentPage: typeof window !== 'undefined' ? window.location.pathname : '',
          endTime: new Date().toISOString()
        }
      };
      
      logger.debug('Enviando fin de sesión', { 
        userId: user.id,
        sessionId: this.state.sessionId
      });
      
      const response = await fetch('/api/user-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sessionEndData)
      });
      
      if (!response.ok) {
        throw new Error(`Error al finalizar sesión: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Error al finalizar sesión', error);
    }
  }
  
  /**
   * Registrar vista de página
   */
  recordPageView(path: string): void {
    if (!this.isTracking) {
      this.startTracking();
    }
    
    try {
      const timestamp = Date.now();
      this.pageViews.push({
        path,
        timestamp
      });
      
      this.lastActivityTime = timestamp;
      
      // Obtener usuario actual para enviar evento
      const user = getCurrentUser();
      if (!user) {
        logger.debug('No hay usuario autenticado para registrar vista de página');
        return;
      }
      
      logger.debug('Vista de página registrada', { path });
      
      // Enviar evento de vista de página
      fetch('/api/user-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          username: user.username,
          branch: user.sucursal,
          sessionId: this.state.sessionId,
          activityType: 'page_view',
          metadata: {
            page: path,
            referrer: typeof document !== 'undefined' ? document.referrer : '',
            module: this.getModuleFromPath(path),
            timestamp: new Date().toISOString()
          }
        })
      }).catch(error => {
        logger.error('Error al registrar vista de página', error);
      });
    } catch (error) {
      logger.error('Error al registrar vista de página', error);
    }
  }
  
  /**
   * Obtener módulo de la aplicación basado en la ruta
   */
  private getModuleFromPath(path: string): string {
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/analista')) return 'analista';
    if (path.startsWith('/enrique')) return 'advanced';
    if (path.startsWith('/predictions')) return 'predictions';
    if (path.startsWith('/sucursal')) return 'branch';
    return 'general';
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
