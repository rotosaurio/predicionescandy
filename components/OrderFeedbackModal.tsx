import { useState } from 'react';
import { FeedbackProduct, NoOrdenadoRazon } from '../types/models';

interface OrderFeedbackModalProps {
  product: FeedbackProduct;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (product: FeedbackProduct, ordered: boolean, reason?: NoOrdenadoRazon, comment?: string) => Promise<void>;
  loading?: boolean;
}

export const OrderFeedbackModal: React.FC<OrderFeedbackModalProps> = ({
  product,
  isOpen,
  onClose,
  onSubmit,
  loading = false
}) => {
  const [ordered, setOrdered] = useState<boolean | null>(product.ordenado !== undefined ? product.ordenado : null);
  const [reason, setReason] = useState<NoOrdenadoRazon | ''>(product.razon_no_ordenado || '');
  const [comment, setComment] = useState(product.comentario_no_ordenado || '');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (ordered === null) return;
    
    if (ordered) {
      onSubmit(product, true);
    } else {
      if (reason) {
        onSubmit(product, false, reason as NoOrdenadoRazon, reason === 'otro' ? comment : undefined);
      }
    }
  };

  // Get the display quantity (support both Prediction and CommonProduct formats)
  const displayQuantity = product.cantidad || product.cantidadPredicha || 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="border-b border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Retroalimentación de pedido
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {product.producto} - Cantidad sugerida: {displayQuantity}
          </p>
        </div>
        
        <div className="p-4">
          <div className="mb-4">
            <p className="mb-2 font-medium text-gray-700 dark:text-gray-300">¿Ordenó este producto?</p>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setOrdered(true)}
                className={`px-4 py-2 rounded-md ${
                  ordered === true
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
                disabled={loading}
              >
                Sí, lo ordené
              </button>
              <button
                type="button"
                onClick={() => setOrdered(false)}
                className={`px-4 py-2 rounded-md ${
                  ordered === false
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
                disabled={loading}
              >
                No lo ordené
              </button>
            </div>
          </div>
          
          {ordered === false && (
            <>
              <div className="mb-4">
                <p className="mb-2 font-medium text-gray-700 dark:text-gray-300">¿Por qué no lo ordenó?</p>
                <div className="grid grid-cols-1 gap-2">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      value="hay_en_tienda"
                      checked={reason === 'hay_en_tienda'}
                      onChange={() => setReason('hay_en_tienda')}
                      className="form-radio h-5 w-5 text-[#0B9ED9]"
                    />
                    <span className="ml-2">Hay producto en tienda</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      value="hay_en_cedis"
                      checked={reason === 'hay_en_cedis'}
                      onChange={() => setReason('hay_en_cedis')}
                      className="form-radio h-5 w-5 text-[#0B9ED9]"
                    />
                    <span className="ml-2">No hay producto en CEDIS</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setReason('otro')}
                    className={`px-4 py-2 text-left rounded-md ${
                      reason === 'otro'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}
                    disabled={loading}
                  >
                    Otro motivo
                  </button>
                </div>
              </div>
              
              {reason === 'otro' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Especifique el motivo
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={loading}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    rows={3}
                    placeholder="Escriba el motivo por el cual no ordenó este producto"
                  />
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || ordered === null || (ordered === false && !reason)}
            className={`w-full mt-6 py-2 px-4 rounded-md ${
              loading || ordered === null || (ordered === false && !reason)
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#0B9ED9] hover:bg-[#0989c0] text-white'
            }`}
          >
            {loading && (
              <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
            )}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderFeedbackModal;
