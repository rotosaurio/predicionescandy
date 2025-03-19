import React from 'react';
import { FeedbackProduct } from '../types/models';

interface ObservationsTableProps {
  observations: FeedbackProduct[];
  showPredictionId?: boolean; // Add optional prop to show prediction ID
}

export default function ObservationsTable({ observations, showPredictionId = false }: ObservationsTableProps) {
  if (!observations || observations.length === 0) {
    return <div className="text-center p-4 text-gray-500 dark:text-gray-400">No hay observaciones para mostrar</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Producto</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ordenado</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Razón</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Comentario</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cantidad</th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha Feedback</th>
            {showPredictionId && (
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Predicción</th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {observations.map((observation, index) => (
            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                {observation.producto}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm">
                {observation.ordenado !== undefined ? (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    observation.ordenado 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                  }`}>
                    {observation.ordenado ? 'Sí' : 'No'}
                  </span>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">-</span>
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {observation.razon_no_ordenado || '-'}
              </td>
              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                {observation.comentario_no_ordenado || observation.comentario || '-'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {observation.cantidad || '-'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {observation.fecha
                  ? new Date(observation.fecha).toLocaleString('es-MX', {
                      year: 'numeric', month: '2-digit', day: '2-digit', 
                      hour: '2-digit', minute: '2-digit'
                    }) 
                  : observation.fecha 
                    ? new Date(observation.fecha).toLocaleString('es-MX', {
                        year: 'numeric', month: '2-digit', day: '2-digit', 
                        hour: '2-digit', minute: '2-digit'
                      }) 
                    : '-'}
              </td>
              {showPredictionId && (
                <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {observation.predictionId 
                    ? new Date(observation.predictionId).toLocaleString('es-MX', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '-'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
