import React, { useState } from 'react';
import { Prediction, NoOrdenadoRazon } from '../types/models';
import { FiInfo, FiCheck, FiX } from 'react-icons/fi';
import OrderFeedbackModal from './OrderFeedbackModal';
import {FeedbackProduct} from '../types/models';

// Import the FeedbackProduct interface to maintain type compatibility


interface PredictionTableProps {
  predictions: Prediction[];
  onShowDetails: (product: Prediction) => void;
  onSaveFeedback?: (product: Prediction | FeedbackProduct, ordered: boolean, reason?: NoOrdenadoRazon, comment?: string) => Promise<void>;
  showOrderFeedback?: boolean;
  sucursal?: string;
}

const confianzaANivel = (confianza: number): number => {
  if (confianza >= 90) return 5;       // 90-100% -> Level 5 (highest priority)
  if (confianza >= 80) return 4;       // 80-89% -> Level 4
  if (confianza >= 70) return 3;       // 70-79% -> Level 3
  if (confianza >= 60) return 2;       // 60-69% -> Level 2
  return 1;                           // <60% -> Level 1 (lowest priority)
};

export const PredictionTable: React.FC<PredictionTableProps> = ({
  predictions,
  onShowDetails,
  onSaveFeedback,
  showOrderFeedback = false,
  sucursal
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Prediction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState<{[key: string]: boolean}>({});

  const handleOpenFeedbackModal = (product: Prediction) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleFeedbackSubmit = async (
    product: FeedbackProduct,
    ordered: boolean,
    reason?: NoOrdenadoRazon,
    comment?: string
  ) => {
    if (onSaveFeedback && selectedProduct) {
      // Track loading state for this product
      setLoading(prev => ({ ...prev, [product.producto]: true }));
      
      try {
        await onSaveFeedback(selectedProduct, ordered, reason, comment);
        // Update prediction in local state
        if (selectedProduct) {
          selectedProduct.ordenado = ordered;
          selectedProduct.razon_no_ordenado = reason;
          selectedProduct.comentario_no_ordenado = comment;
        }
      } catch (error) {
        console.error("Error saving feedback:", error);
        alert("No se pudo guardar la retroalimentación. Intente de nuevo.");
      } finally {
        setLoading(prev => ({ ...prev, [product.producto]: false }));
      }
    }
  };

  if (!predictions || predictions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No predictions available
      </div>
    );
  }

  // Helper function to render order status
  const renderOrderStatus = (product: Prediction) => {
    if (product.ordenado === true) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <FiCheck className="mr-1" /> Ordenado
        </span>
      );
    } else if (product.ordenado === false) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <FiX className="mr-1" /> No ordenado
          {product.razon_no_ordenado && (
            <span className="ml-1">
              ({product.razon_no_ordenado === 'hay_en_tienda' 
                ? 'Hay producto en tienda' 
                : product.razon_no_ordenado === 'hay_en_cedis' 
                  ? 'No hay producto en CEDIS' 
                  : 'Otro'})
            </span>
          )}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Confidence</th>
            <th>Level</th>
            {showOrderFeedback && <th>Estatus</th>}
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
                {showOrderFeedback && (
                  <td>
                    {renderOrderStatus(producto)}
                  </td>
                )}
                <td className="flex space-x-2">
                  <button 
                    className="btn btn-sm btn-primary"
                    onClick={() => onShowDetails(producto)}
                  >
                    <FiInfo size={14} />
                    <span>Details</span>
                  </button>
                  
                  {/* Only show feedback button if feedback doesn't exist AND showOrderFeedback is true */}
                  {showOrderFeedback && onSaveFeedback && producto.ordenado === undefined && (
                    <button 
                      className="px-2 py-1 text-xs font-medium text-white bg-[#0B9ED9] rounded hover:bg-[#0989c0] flex items-center"
                      onClick={() => handleOpenFeedbackModal(producto)}
                      disabled={loading[producto.nombre]}
                    >
                      {loading[producto.nombre] ? (
                        <span className="loading"></span>
                      ) : (
                        <span>Motivo de omisión</span>
                      )}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {selectedProduct && (
        <OrderFeedbackModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleFeedbackSubmit}
        />
      )}
    </div>
  );
};

export default PredictionTable;
