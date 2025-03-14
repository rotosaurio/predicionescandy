// Helper functions for the app

/**
 * Format date from YYYY-MM-DD to DD/MM/YYYY format for API requests
 */
export const formatDateForAPI = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

/**
 * Format date from DD/MM/YYYY to YYYY-MM-DD format
 */
export const formatDateFromAPI = (dateStr: string): string => {
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month}-${day}`;
};

/**
 * Calculate recommendation level from confidence percentage
 */
export const confidenceToLevel = (confianza: number): number => {
  if (confianza >= 90) return 5;       // 90-100% -> Level 5 (highest priority)
  if (confianza >= 80) return 4;       // 80-89% -> Level 4
  if (confianza >= 70) return 3;       // 70-79% -> Level 3
  if (confianza >= 60) return 2;       // 60-69% -> Level 2
  return 1;                           // <60% -> Level 1 (lowest priority)
};

/**
 * Convert confidence to CSS class
 */
export const confidenceToClass = (confianza: number): string => {
  if (confianza >= 80) return 'confidence-alta';
  if (confianza >= 60) return 'confidence-media';
  return 'confidence-baja';
};

/**
 * Export array data to CSV file
 */
export const exportToCSV = (filename: string, headers: string[], data: any[][]): void => {
  // Create CSV header
  let csvContent = headers.join(',') + '\n';
  
  // Add each row
  data.forEach(row => {
    csvContent += row.map(item => {
      // Wrap strings with quotes, especially if they contain commas
      if (typeof item === 'string' && (item.includes(',') || item.includes('"'))) {
        return `"${item.replace(/"/g, '""')}"`;
      }
      return item;
    }).join(',') + '\n';
  });
  
  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  // Set attributes and click to download
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Try to save data to localStorage with error handling
 */
export const saveToLocalStorage = (key: string, data: any): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`Failed to save to localStorage key "${key}":`, e);
    return false;
  }
};

/**
 * Try to load data from localStorage with error handling
 */
export const loadFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Failed to load from localStorage key "${key}":`, e);
    return defaultValue;
  }
};
