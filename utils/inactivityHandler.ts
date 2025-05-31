import { getActivityTrackerV2 } from './activityTrackerV2';

// Constantes de tiempo (en milisegundos)
export const IDLE_TIMEOUT = 600000; // 10 minutos
export const WARNING_TIMEOUT = 580000; // 9 minutos 40 segundos

// Manejar evento de actividad del usuario
export function handleUserActivity(): void {
  const activityTracker = getActivityTrackerV2();
  // Registrar actividad genérica para reiniciar el temporizador de inactividad
  activityTracker.recordAction('user_active');
}

// Verificar si un componente debe mostrar la advertencia de inactividad
export function shouldShowInactivityWarning(lastActivity: Date): boolean {
  const now = new Date().getTime();
  const lastActivityTime = lastActivity.getTime();
  const idleTime = now - lastActivityTime;
  
  // Mostrar la advertencia si ha pasado el tiempo de WARNING_TIMEOUT pero menos del IDLE_TIMEOUT
  return idleTime >= WARNING_TIMEOUT && idleTime < IDLE_TIMEOUT;
}

// Calcular tiempo restante antes del cierre de sesión (en segundos)
export function getRemainingTime(lastActivity: Date): number {
  const now = new Date().getTime();
  const lastActivityTime = lastActivity.getTime();
  const timeElapsed = now - lastActivityTime;
  const timeRemaining = IDLE_TIMEOUT - timeElapsed;
  
  // Convertir a segundos y asegurar que sea positivo
  return Math.max(Math.floor(timeRemaining / 1000), 0);
} 