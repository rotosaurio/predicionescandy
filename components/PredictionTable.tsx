import React from 'react';
import { Prediction } from '../types/models';
import { FiInfo } from 'react-icons/fi';

interface PredictionTableProps {
  predictions: Prediction[];
  onShowDetails: (product: Prediction) => void;
}

const confianzaANivel = (confianza: number): number => {
  if (confianza >= 90) return 5;       // 90-100% -> Level 5 (highest priority)
  if (confianza >= 80) return 4;       // 80-89% -> Level 4
  if (confianza >= 70) return 3;       // 70-79% -> Level 3
  if (confianza >= 60) return 2;       // 60-69% -> Level 2
  return 1;                           // <60% -> Level 1 (lowest priority)
};

export const PredictionTable: React.FC<PredictionTableProps> = ({ predictions, onShowDetails }) => {
  if (!predictions || predictions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No predictions available
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Confidence</th>
            <th>Level</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {predictions.map((producto, index) => {
            const confidenceClass = 
              producto.confianza >= 80 ? 'confidence-alta' : 
              producto.confianza >= 60 ? 'confidence-media' : 
              'confidence-baja';
            const level = confianzaANivel(producto.confianza || 0);
            
            return (
              <tr key={`${producto.nombre}-${index}`}>
                <td>{producto.nombre}</td>
                <td>{producto.cantidad}</td>
                <td className={confidenceClass}>
                  {typeof producto.confianza === 'number' ? `${producto.confianza.toFixed(1)}%` : '-'}
                </td>
                <td>
                  <div className="level-indicator" data-level={level}>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </td>
                <td>
                  <button 
                    className="btn btn-sm btn-primary"
                    onClick={() => onShowDetails(producto)}
                  >
                    <FiInfo size={14} />
                    <span>Details</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PredictionTable;
