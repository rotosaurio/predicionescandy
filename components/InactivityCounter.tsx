import { useState, useEffect } from 'react';
import { getActivityTrackerV2 } from '../utils/activityTrackerV2';

interface InactivityCounterProps {
  onActivity: () => void;
}

const InactivityCounter: React.FC<InactivityCounterProps> = ({ onActivity }) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(600); // 10 minutos = 600 segundos
  const [visible, setVisible] = useState<boolean>(true);
  
  // Registrar actividad del usuario cuando se mueve el ratón o interactúa
  useEffect(() => {
    const handleActivity = () => {
      // Reiniciar el contador a 10 minutos (600 segundos)
      setSecondsLeft(600);
      // Llamar al callback de actividad
      onActivity();
    };
    
    // Eventos que indican actividad del usuario
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];
    
    // Agregar event listeners
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });
    
    // Limpiar event listeners
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [onActivity]);
  
  // Actualizar el contador cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 0) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Formatear el tiempo para mostrar minutos:segundos
  const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  // Mostrar u ocultar contador al hacer clic
  const toggleVisibility = () => {
    setVisible(prev => !prev);
  };
  
  // Estilo para el contador
  const counterStyle = {
    position: 'fixed' as const,
    bottom: '10px',
    right: '10px',
    background: secondsLeft < 30 ? '#ef4444' : '#0B9ED9',
    color: 'white',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  };
  
  // Si no está visible, mostrar un pequeño indicador
  if (!visible) {
    return (
      <div 
        onClick={toggleVisibility}
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '10px',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: secondsLeft < 30 ? '#ef4444' : '#0B9ED9',
          zIndex: 1000,
          cursor: 'pointer'
        }}
      />
    );
  }
  
  return (
    <div style={counterStyle} onClick={toggleVisibility}>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="16" 
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span>Sesión: {formatTime(secondsLeft)}</span>
    </div>
  );
};

export default InactivityCounter; 