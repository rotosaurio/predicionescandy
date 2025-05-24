// Sistema de logging simplificado compatible con entornos serverless

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  prefix: string;
  includeTimestamp?: boolean;
}

class Logger {
  private prefix: string;
  private includeTimestamp: boolean;

  constructor(options: LoggerOptions) {
    this.prefix = options.prefix;
    this.includeTimestamp = options.includeTimestamp !== false;
  }

  /**
   * Formatea un mensaje de log
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = this.includeTimestamp ? `[${new Date().toISOString()}] ` : '';
    return `${timestamp}[${this.prefix}] [${level.toUpperCase()}] ${message}`;
  }

  /**
   * Log de nivel debug
   */
  debug(message: string, data?: any): void {
    const formattedMessage = this.formatMessage('debug', message);
    console.log(formattedMessage, data);
  }

  /**
   * Log de nivel info
   */
  info(message: string, data?: any): void {
    const formattedMessage = this.formatMessage('info', message);
    console.log(formattedMessage, data);
  }

  /**
   * Log de nivel warn
   */
  warn(message: string, data?: any): void {
    const formattedMessage = this.formatMessage('warn', message);
    console.warn(formattedMessage, data);
  }

  /**
   * Log de nivel error
   */
  error(message: string, data?: any): void {
    const formattedMessage = this.formatMessage('error', message);
    console.error(formattedMessage, data);
  }
}

// Crear instancias de loggers
export const loggers = {
  app: new Logger({ prefix: 'APP' }),
  system: new Logger({ prefix: 'SYSTEM' }),
  api: new Logger({ prefix: 'API' })
};

/**
 * Configura manejo global de errores no capturados
 */
export function setupGlobalErrorLogging(): void {
  if (typeof window !== 'undefined') {
    window.onerror = (message, source, lineno, colno, error) => {
      loggers.app.error(`Uncaught error: ${message}`, { source, lineno, colno, error });
      return false; // Permite que el error se propague
    };

    window.addEventListener('unhandledrejection', (event) => {
      loggers.app.error('Unhandled promise rejection', event.reason);
    });
  }
}

/**
 * Registra un error en el sistema
 */
export function logError(category: string, error: any, context?: any): void {
  loggers.app.error(`[${category}] Error: ${error.message || error}`, {
    context,
    stack: error.stack
  });
}

/**
 * Registra una acción del usuario
 */
export function logUserAction(action: string, data?: any): void {
  loggers.app.info(`User action: ${action}`, data);
}

export default loggers; 