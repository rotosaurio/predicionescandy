import { useState, useEffect } from 'react';

interface InactivityWarningProps {
  warningTime: number; // Tiempo en ms antes de mostrar la advertencia
  logoutTime: number;  // Tiempo en ms antes de cerrar sesión automáticamente
  onActivity: () => void; // Función para reiniciar el temporizador cuando hay actividad
}

const InactivityWarning: React.FC<InactivityWarningProps> = ({ 
  warningTime = 50000, // 50 segundos (1 min - 10 seg)
  logoutTime = 60000,  // 1 minuto
  onActivity 
}) => {
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(10); // 10 segundos restantes
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null);

  // Reiniciar el temporizador cuando hay actividad
  const resetTimer = () => {
    setShowWarning(false);
    if (timerId) clearInterval(timerId);
    setTimerId(null);
    onActivity();
  };

  // Iniciar el temporizador para mostrar la advertencia
  useEffect(() => {
    const warningTimer = setTimeout(() => {
      setShowWarning(true);
      
      // Iniciar cuenta regresiva
      const countdownTimer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      setTimerId(countdownTimer);
    }, warningTime);

    // Limpiar temporizador cuando el componente se desmonte
    return () => {
      clearTimeout(warningTimer);
      if (timerId) clearInterval(timerId);
    };
  }, [warningTime]);

  // Ocultar el componente si no se debe mostrar la advertencia
  if (!showWarning) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 py-3 bg-amber-500 text-white">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6 mr-2" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
          <p>
            <strong>¡Alerta de inactividad!</strong> Su sesión se cerrará en {countdown} segundos debido a inactividad.
          </p>
        </div>
        <button 
          onClick={resetTimer}
          className="bg-white text-amber-600 px-4 py-1 rounded-md font-medium hover:bg-amber-50"
        >
          Continuar sesión
        </button>
      </div>
    </div>
  );
};

export default InactivityWarning; 