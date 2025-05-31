import { getCurrentUser, logoutDueToInactivity } from './auth';

// Configuración de tiempos
const IDLE_TIMEOUT = 600000; // 10 minutos de inactividad = usuario idle
const MAX_IDLE_BEFORE_LOGOUT = 600000; // 10 minutos de idle time antes de cerrar sesión
const MIN_ACTIVITY_RECORD_INTERVAL = 10000; // 10 segundos mínimo entre registros
const PAGE_VISIBILITY_CHECK_INTERVAL = 1000; // Revisar visibilidad cada segundo
const SESSION_SYNC_INTERVAL = 60000; // Sincronizar sesión cada 1 minuto
const MIN_ACTIVITY_TIME_PER_INTERACTION = 1000; // Asignar al menos 1 segundo por cada interacción

interface ActivitySessionData {
  userId: string;
  username: string;
  branch?: string;
  startTime: Date;
  lastActivity: Date;
  isIdle: boolean;
  isPageVisible: boolean;
  idleSince?: Date;
  activeTimeAccumulated: number; // en milisegundos
  sessionId: string;
  currentPage?: string;
  actions: ActivityAction[];
}

interface ActivityAction {
  type: string;
  timestamp: Date;
  page?: string;
  metadata?: any;
  duration?: number;
}

// Interface para los métodos públicos del ActivityTracker
interface IActivityTrackerV2 {
  startTracking(page?: string): void;
  stopTracking(): void;
  recordAction(actionType: string, metadata?: any): void;
  recordPageView(page: string): void;
  recordExportAction(fileName: string, actionData?: any): void;
  getSessionStats(): any;
}

class ActivityTrackerV2 implements IActivityTrackerV2 {
  private session: ActivitySessionData | null = null;
  private pageVisibilityInterval: NodeJS.Timeout | null = null;
  private sessionId: string;
  private events: { [key: string]: Function[] } = {};
  private sessionSyncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: number = 0;
  private accumulatedActiveTimeSinceSync: number = 0;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupPageVisibilityTracking();
  }

  // Iniciar el seguimiento para un usuario
  public startTracking(page?: string): void {
    const user = getCurrentUser();
    if (!user) return;

    // Iniciar nueva sesión
    this.session = {
      userId: user.id,
      username: user.username,
      branch: user.branch,
      startTime: new Date(),
      lastActivity: new Date(),
      isIdle: false,
      isPageVisible: this.isDocumentVisible(),
      activeTimeAccumulated: 0,
      sessionId: this.sessionId,
      currentPage: page,
      actions: []
    };

    // Configurar escuchas de eventos para detectar actividad
    this.setupActivityListeners();
    
    console.log('Seguimiento de actividad iniciado', {
      userId: user.id,
      username: user.username,
      sessionId: this.sessionId
    });
    
    // Registrar inicio de sesión
    this.recordAction('session_start', { page });
    
    // Iniciar la sincronización de sesión con el servidor
    this.startSessionSync();
    
    // Enviar evento de inicio de sesión al servidor
    this.sendSessionStartToServer(page);
  }

  // Detener el seguimiento de actividad
  public stopTracking(): void {
    if (!this.session) return;

    // Calcular tiempo activo final
    this.updateActiveTime();

    // Registrar fin de sesión con el tiempo total activo
    this.recordAction('session_end', {
      totalActiveTime: this.session.activeTimeAccumulated,
      duration: this.session.activeTimeAccumulated
    });

    // Enviar actualización final al servidor
    this.sendSessionEndToServer();
    
    // Limpiar intervalos y escuchas
    this.cleanupListeners();
    
    console.log('Seguimiento de actividad detenido', {
      userId: this.session.userId,
      username: this.session.username,
      sessionId: this.sessionId,
      activeTime: this.formatDuration(this.session.activeTimeAccumulated)
    });
    
    this.session = null;
  }

  // Registrar una acción específica del usuario
  public recordAction(actionType: string, metadata: any = {}): void {
    if (!this.session) return;

    const action: ActivityAction = {
      type: actionType,
      timestamp: new Date(),
      page: this.session.currentPage,
      metadata
    };

    // Actualizar última actividad
    this.session.lastActivity = action.timestamp;
    this.session.isIdle = false;
    
    // Si estaba en idle, calcular tiempo activo hasta el momento
    if (this.session.idleSince) {
      this.session.idleSince = undefined;
    }

    // Asegurar que cada interacción registre al menos un tiempo mínimo de actividad
    // Esto garantiza que las interacciones rápidas sean contadas
    const timeToAdd = Math.max(MIN_ACTIVITY_TIME_PER_INTERACTION, metadata.duration || 0);
    this.session.activeTimeAccumulated += timeToAdd;
    this.accumulatedActiveTimeSinceSync += timeToAdd;

    // Guardar acción en la lista de la sesión
    this.session.actions.push(action);

    // Enviar al servidor si es una acción importante
    if (
      ['page_view', 'export_excel', 'download_report', 'generate_prediction', 'view_prediction', 'session_end']
      .includes(actionType)
    ) {
      this.sendActionToServer(action);
    }
  }

  // Registrar cambio de página
  public recordPageView(page: string): void {
    if (!this.session) return;
    
    this.session.currentPage = page;
    this.recordAction('page_view', { page });
  }

  // Registrar acción de exportación
  public recordExportAction(fileName: string, actionData: any = {}): void {
    this.recordAction('export_excel', {
      actionData: {
        fileName,
        ...actionData
      },
      // Estimar duración basada en tamaño de datos (opcional)
      duration: 5000 // 5 segundos por defecto para operaciones de exportación
    });
  }

  // Generar un ID único para la sesión
  private generateSessionId(): string {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  // Verificar si el documento es visible
  private isDocumentVisible(): boolean {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  }

  // Configurar el seguimiento de visibilidad de la página
  private setupPageVisibilityTracking(): void {
    if (typeof window === 'undefined') return;

    // Escuchar cambios de visibilidad
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    // Revisar periódicamente la visibilidad
    this.pageVisibilityInterval = setInterval(() => {
      if (this.session) {
        const isVisible = this.isDocumentVisible();
        
        // Si cambió el estado de visibilidad
        if (this.session.isPageVisible !== isVisible) {
          this.session.isPageVisible = isVisible;
          this.handleVisibilityChange();
        }
        
        // Verificar si debemos marcar como idle
        const now = new Date().getTime();
        const timeSinceLastActivity = now - this.session.lastActivity.getTime();
        
        if (!this.session.isIdle && timeSinceLastActivity > IDLE_TIMEOUT) {
          // Marcar como idle y guardar cuando comenzó
          this.session.isIdle = true;
          this.session.idleSince = new Date();
          console.log('Usuario inactivo detectado');
        }
      }
    }, PAGE_VISIBILITY_CHECK_INTERVAL);
  }

  // Manejar cambios de visibilidad
  private handleVisibilityChange(): void {
    if (!this.session) return;
    
    const isVisible = this.isDocumentVisible();
    this.session.isPageVisible = isVisible;
    
    if (isVisible) {
      // La página volvió a ser visible, actualizar tiempo
      console.log('Página visible nuevamente');
      this.updateActiveTime();
      this.trigger('visibility_change', { isVisible: true });
    } else {
      // La página dejó de ser visible, registrar tiempo hasta este punto
      console.log('Página dejó de ser visible');
      this.updateActiveTime();
      this.trigger('visibility_change', { isVisible: false });
    }
    
    // Iniciar sincronización periódica de la sesión
    this.startSessionSync();
  }

  // Configurar escuchas de eventos para detectar actividad
  private setupActivityListeners(): void {
    if (typeof window === 'undefined') return;
    
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    
    // Añadir escucha para cada evento de actividad
    activityEvents.forEach(eventType => {
      window.addEventListener(eventType, this.handleUserActivity.bind(this), { passive: true });
    });
    
    // Escuchar evento beforeunload para guardar datos antes de salir
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  // Manejar actividad del usuario
  private handleUserActivity(): void {
    if (!this.session) return;
    
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - this.session.lastActivity.getTime();
    
    // Solo actualizar si pasó suficiente tiempo desde la última actividad
    if (timeSinceLastActivity > MIN_ACTIVITY_RECORD_INTERVAL) {
      const wasIdle = this.session.isIdle;
      
      // Actualizar última actividad
      this.session.lastActivity = now;
      this.session.isIdle = false;
      
      // Si estaba inactivo, calcular tiempo activo hasta entrar en idle
      if (wasIdle && this.session.idleSince) {
        this.session.idleSince = undefined;
        console.log('Usuario volvió de inactividad');
      }
    }
  }

  // Manejar el evento de cierre de página
  private handleBeforeUnload(): void {
    this.updateActiveTime();
    this.stopTracking();
  }

  // Actualizar el tiempo activo acumulado
  private updateActiveTime(): void {
    if (!this.session) return;
    
    const now = new Date().getTime();
    
    // Si el usuario está inactivo, usar el tiempo desde la última actividad hasta que se volvió inactivo
    if (this.session.isIdle && this.session.idleSince) {
      const activeEndTime = this.session.idleSince.getTime();
      const timeToAdd = activeEndTime - this.session.lastActivity.getTime();
      
      if (timeToAdd > 0) {
        this.session.activeTimeAccumulated += timeToAdd;
        this.accumulatedActiveTimeSinceSync += timeToAdd;
        this.session.lastActivity = this.session.idleSince;
      }
    } 
    // Si la página está visible y el usuario no está inactivo
    else if (this.session.isPageVisible && !this.session.isIdle) {
      const timeToAdd = now - this.session.lastActivity.getTime();
      
      if (timeToAdd > 0) {
        this.session.activeTimeAccumulated += timeToAdd;
        this.accumulatedActiveTimeSinceSync += timeToAdd;
        this.session.lastActivity = new Date();
      }
    }
  }

  // Limpiar todas las escuchas
  private cleanupListeners(): void {
    if (typeof window === 'undefined') return;
    
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    
    // Eliminar escuchas de actividad
    activityEvents.forEach(eventType => {
      window.removeEventListener(eventType, this.handleUserActivity.bind(this));
    });
    
    // Eliminar escucha de cierre
    window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    
    // Eliminar escucha de visibilidad
    document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Limpiar intervalo de verificación de visibilidad
    if (this.pageVisibilityInterval) {
      clearInterval(this.pageVisibilityInterval);
      this.pageVisibilityInterval = null;
    }
    
    // Limpiar intervalo de sincronización de sesión
    if (this.sessionSyncInterval) {
      clearInterval(this.sessionSyncInterval);
      this.sessionSyncInterval = null;
    }
  }

  // Enviar acción al servidor
  private sendActionToServer(action: ActivityAction): void {
    if (!this.session || typeof window === 'undefined') return;
    
    const user = getCurrentUser();
    if (!user) return;
    
    // Actualizar tiempo activo antes de enviar
    this.updateActiveTime();
    
    // Calcular duración para la acción
    action.duration = action.duration || 0;
    
    // Preparar datos para enviar
    const payload = {
      userId: user.id,
      username: user.username,
      branch: user.branch,
      actionType: action.type,
      metadata: {
        page: action.page || this.session.currentPage,
        duration: action.duration,
        actionData: action.metadata
      },
      sessionId: this.session.sessionId,
      timestamp: action.timestamp
    };
    
    // Enviar al nuevo endpoint
    fetch('/api/user-activity-actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).catch(error => {
      console.error('Error al enviar acción al servidor:', error);
    });
  }

  // Sistema de eventos simple
  private trigger(eventName: string, data: any): void {
    if (!this.events[eventName]) return;
    
    this.events[eventName].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error en callback para evento ${eventName}:`, error);
      }
    });
  }

  // Utilidad para formatear duración
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  // Obtener estadísticas de la sesión actual
  public getSessionStats(): any {
    if (!this.session) return null;
    
    // Actualizar tiempo activo
    this.updateActiveTime();
    
    return {
      userId: this.session.userId,
      username: this.session.username,
      branch: this.session.branch,
      sessionId: this.session.sessionId,
      startTime: this.session.startTime,
      lastActivity: this.session.lastActivity,
      activeTime: this.session.activeTimeAccumulated,
      activeTimeFormatted: this.formatDuration(this.session.activeTimeAccumulated),
      currentPage: this.session.currentPage,
      isIdle: this.session.isIdle,
      isPageVisible: this.session.isPageVisible,
      actionsCount: this.session.actions.length
    };
  }

  // Iniciar sincronización periódica de la sesión
  private startSessionSync(): void {
    if (this.sessionSyncInterval) {
      clearInterval(this.sessionSyncInterval);
    }
    
    this.lastSyncTime = Date.now();
    this.accumulatedActiveTimeSinceSync = 0;
    
    this.sessionSyncInterval = setInterval(() => {
      if (this.session) {
        // Actualizar tiempo activo
        this.updateActiveTime();
        
        // Verificar si el usuario está inactivo y cerrar sesión si es necesario
        this.checkIdleState();
        
        // Calcular tiempo activo desde la última sincronización
        const now = Date.now();
        const timeSinceLastSync = now - this.lastSyncTime;
        
        // Solo enviar si hay tiempo activo acumulado significativo (más de 5 segundos)
        // o si ha pasado suficiente tiempo desde la última sincronización (más de 2 minutos)
        if (this.accumulatedActiveTimeSinceSync > 5000 || timeSinceLastSync > 120000) {
          this.sendSessionUpdateToServer();
          this.lastSyncTime = now;
          this.accumulatedActiveTimeSinceSync = 0;
        }
      }
    }, SESSION_SYNC_INTERVAL);
  }
  
  // Enviar inicio de sesión al servidor
  private sendSessionStartToServer(page?: string): void {
    if (!this.session || typeof window === 'undefined') return;
    
    const user = getCurrentUser();
    if (!user) return;
    
    fetch('/api/user-activity/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'start_session',
        userId: user.id,
        username: user.username,
        branch: user.branch,
        sessionId: this.sessionId,
        page: page || this.session.currentPage,
        timestamp: new Date()
      })
    }).catch(error => {
      console.error('Error al enviar inicio de sesión al servidor:', error);
    });
  }
  
  // Enviar actualización de sesión al servidor
  private sendSessionUpdateToServer(): void {
    if (!this.session || typeof window === 'undefined') return;
    
    const user = getCurrentUser();
    if (!user) return;
    
    // Verificar si hay tiempo activo para enviar
    if (this.accumulatedActiveTimeSinceSync <= 0) return;
    
    fetch('/api/user-activity/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'update_session',
        userId: user.id,
        username: user.username,
        branch: user.branch,
        sessionId: this.sessionId,
        page: this.session.currentPage,
        activeTime: this.accumulatedActiveTimeSinceSync,
        timestamp: new Date()
      })
    }).catch(error => {
      console.error('Error al enviar actualización de sesión al servidor:', error);
    });
  }
  
  // Enviar fin de sesión al servidor
  private sendSessionEndToServer(): void {
    if (!this.session || typeof window === 'undefined') return;
    
    const user = getCurrentUser();
    if (!user) return;
    
    fetch('/api/user-activity/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'end_session',
        userId: user.id,
        username: user.username,
        branch: user.branch,
        sessionId: this.sessionId,
        page: this.session.currentPage,
        activeTime: this.accumulatedActiveTimeSinceSync,
        timestamp: new Date()
      })
    }).catch(error => {
      console.error('Error al enviar fin de sesión al servidor:', error);
    });
  }

  private checkIdleState(): void {
    if (!this.session) return;
    
    const now = new Date().getTime();
    const lastActivity = this.session.lastActivity.getTime();
    const idleTime = now - lastActivity;
    
    // Verificar si el usuario está inactivo
    if (idleTime > IDLE_TIMEOUT && !this.session.isIdle) {
      this.session.isIdle = true;
      this.session.idleSince = new Date();
      this.recordAction('user_idle');
      
      console.log('Usuario inactivo detectado', {
        userId: this.session.userId,
        username: this.session.username,
        idleTime: Math.floor(idleTime / 1000)
      });
    }
    
    // Verificar si el idle time excede el máximo permitido antes de logout
    if (idleTime > MAX_IDLE_BEFORE_LOGOUT) {
      console.log('Sesión cerrada por inactividad', {
        userId: this.session.userId,
        username: this.session.username,
        idleTime: Math.floor(idleTime / 1000)
      });
      
      // Registrar acción de cierre por inactividad
      this.recordAction('session_timeout');
      
      // Forzar cierre de sesión y redireccionar a login
      this.forceLogout();
    }
  }
  
  private forceLogout(): void {
    if (!this.session) return;
    
    // Finalizar sesión actual
    this.stopTracking();
    
    // Usar la función centralizada para logout por inactividad
    if (typeof window !== 'undefined') {
      logoutDueToInactivity();
    }
  }
}

// Singleton para usar en toda la aplicación
let activityTrackerInstance: ActivityTrackerV2 | null = null;

export const getActivityTrackerV2 = (): IActivityTrackerV2 => {
  if (typeof window === 'undefined') {
    // Versión del servidor (mock)
    return {
      startTracking: () => {},
      stopTracking: () => {},
      recordAction: () => {},
      recordPageView: () => {},
      recordExportAction: () => {},
      getSessionStats: () => null
    };
  }
  
  if (!activityTrackerInstance) {
    activityTrackerInstance = new ActivityTrackerV2();
  }
  
  return activityTrackerInstance;
};