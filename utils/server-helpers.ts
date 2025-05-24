// Este archivo contiene funciones que solo deben ejecutarse en el lado del servidor

// Función para importar módulos del lado del servidor de manera dinámica
export async function importServerOnlyModule() {
  // Verificar que estamos en el servidor
  if (typeof window === 'undefined') {
    try {
      // Importar dinámicamente el módulo de scheduler
      console.log('Inicializando servicios del lado del servidor...');
      
      // Importar el servicio de tareas programadas
      const { initScheduler } = await import('./schedulerService');
      await initScheduler();
      
      console.log('Servicios del lado del servidor inicializados correctamente');
      return true;
    } catch (error) {
      console.error('Error al inicializar servicios del servidor:', error);
      return false;
    }
  }
  return false;
} 