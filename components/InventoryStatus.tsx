import { useState, useEffect } from 'react';

interface InventoryStatusProps {
  productName: string;
  className?: string;
}

interface InventoryData {
  articulo: string;
  existencia: number;
  disponible: boolean;
}

export default function InventoryStatus({ productName, className = '' }: InventoryStatusProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);

  useEffect(() => {
    async function fetchInventoryData() {
      if (!productName) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const response = await fetch(`/api/check-inventory?productName=${encodeURIComponent(productName)}`);
        
        if (!response.ok) {
          throw new Error('Error al consultar inventario');
        }
        
        const data = await response.json();
        
        if (data.success && data.found) {
          setInventoryData(data.data);
        } else {
          setInventoryData(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchInventoryData();
  }, [productName]);

  if (loading) {
    return <div className={`text-sm text-gray-500 ${className}`}>Consultando inventario...</div>;
  }

  if (error) {
    return <div className={`text-sm text-red-500 ${className}`}>Error: {error}</div>;
  }

  if (!inventoryData) {
    return <div className={`text-sm text-gray-500 ${className}`}>No encontrado en inventario CEDIS</div>;
  }

  return (
    <div className={`${className}`}>
      <div className="flex items-center">
        <div className={`w-2 h-2 rounded-full mr-2 ${
          inventoryData.disponible ? 'bg-green-500' : 'bg-red-500'
        }`}></div>
        <span className="text-sm">
          {inventoryData.disponible 
            ? `Disponible en CEDIS (${inventoryData.existencia} piezas)` 
            : 'No disponible en CEDIS'}
        </span>
      </div>
    </div>
  );
}
