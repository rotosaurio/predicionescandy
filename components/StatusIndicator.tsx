import { useState } from 'react';

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'unknown' | 'limited';
  showDetails?: boolean;
  details?: {
    gpu?: string;
    modelLoaded?: boolean | string;
    branches?: number;
    products?: number;
  };
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ 
  status, 
  showDetails = false,
  details
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  
  const getStatusText = () => {
    switch(status) {
      case 'online':
        return "Sistema Online";
      case 'offline':
        return "Sistema Offline";
      case 'limited':
        return "Capacidad Limitada";
      default:
        return "Estado Desconocido";
    }
  };
  
  return (
    <div 
      className={`status-indicator ${status}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {getStatusText()}
      
      {showDetails && showTooltip && details && (
        <div className="absolute z-10 mt-2 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg text-sm border border-gray-200 dark:border-gray-700 right-0">
          <h4 className="font-semibold mb-1">Detalles del sistema:</h4>
          <ul className="space-y-1">
            {details.gpu && (
              <li>GPU: {details.gpu}</li>
            )}
            {details.modelLoaded && (
              <li>Modelo cargado: {typeof details.modelLoaded === 'string' ? details.modelLoaded : (details.modelLoaded ? 'Sí' : 'No')}</li>
            )}
            {details.branches !== undefined && (
              <li>Sucursales: {details.branches}</li>
            )}
            {details.products !== undefined && (
              <li>Productos: {details.products}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default StatusIndicator;
