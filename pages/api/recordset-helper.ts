/**
 * RecordSet Format Helper
 * 
 * This file provides utilities for working with the RecordSet format
 * required by the Candy Model API.
 * 
 * The RecordSet format looks like:
 * {
 *   "RecordSet": [
 *     {
 *       "FECHA": "17.03.2025",
 *       "NOMBRE_SUCURSAL_ORIGEN": "CENTRO",
 *       "ARTICULO_ID": 49687,
 *       "NOMBRE_ARTICULO": "PALETA VAQUERO 20PZS",
 *       "CANTIDAD": 30
 *     },
 *     // More records...
 *   ]
 * }
 * 
 * But can also accept standalone records like:
 * {
 *    "EXP_REQ_ID" : 17007,
 *    "FECHA" : "17.03.2025",
 *    "ORIGEN" : 7,
 *    "NOMBRE_SUCURSAL_ORIGEN" : "CENTRO",
 *    "ARTICULO_ID" : 1136315,
 *    "NOMBRE_ARTICULO" : "PALETA VAQUERO 20PZS",
 *    "CANTIDAD" : 30
 * }
 */

/**
 * Helper functions for handling RecordSet format for datasets and orders
 */

// Required fields for a valid record
const requiredFields = ['FECHA', 'ARTICULO_ID', 'NOMBRE_ARTICULO', 'CANTIDAD'];
// At least one of these location fields must be present
const locationFields = ['NOMBRE_SUCURSAL_ORIGEN', 'SUCURSAL'];

/**
 * Check if a single record has the minimum required fields
 */
export function isValidRecord(record: any): boolean {
  if (!record || typeof record !== 'object') return false;
  
  // Check required fields
  for (const field of requiredFields) {
    if (!(field in record)) return false;
  }
  
  // Check that at least one location field is present
  const hasLocation = locationFields.some(field => field in record);
  if (!hasLocation) return false;
  
  return true;
}

/**
 * Check if data is in valid RecordSet format
 */
export function isValidRecordSetFormat(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if (!data.RecordSet || !Array.isArray(data.RecordSet)) return false;
  
  // Empty RecordSet is valid (but may not be useful)
  if (data.RecordSet.length === 0) return true;
  
  // Check first record to ensure it has required fields
  return isValidRecord(data.RecordSet[0]);
}

/**
 * Create a RecordSet from an array of records
 */
export function createRecordSet(records: any[]): { RecordSet: any[] } {
  if (!Array.isArray(records)) {
    throw new Error('Records must be an array');
  }
  
  return {
    RecordSet: records
  };
}

/**
 * Convert a single record to RecordSet format
 */
export function convertSingleRecordToRecordSet(record: any): { RecordSet: any[] } {
  if (!record || typeof record !== 'object') {
    throw new Error('Record must be an object');
  }
  
  return {
    RecordSet: [record]
  };
}

/**
 * Validate and convert data to RecordSet format if needed
 * Returns [isValid, convertedData] tuple
 */
export function validateAndConvertToRecordSet(data: any): [boolean, any] {
  // Already in RecordSet format
  if (isValidRecordSetFormat(data)) {
    return [true, data];
  }
  
  // Try to convert from array
  if (Array.isArray(data)) {
    // Check if array contains at least one valid record
    if (data.length > 0 && isValidRecord(data[0])) {
      return [true, createRecordSet(data)];
    }
    return [false, null];
  }
  
  // Try to convert from single record
  if (data && typeof data === 'object' && isValidRecord(data)) {
    return [true, convertSingleRecordToRecordSet(data)];
  }
  
  return [false, null];
}

/**
 * Converts a date string from DD/MM/YYYY format to DD.MM.YYYY format
 * required by the API
 * @param dateStr Date string in DD/MM/YYYY format
 * @returns Date string in DD.MM.YYYY format
 */
export function convertDateFormat(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.replace(/\//g, '.');
}

/**
 * Validates a date string is in the correct format (DD.MM.YYYY)
 * @param dateStr Date string to validate
 * @returns boolean indicating if the date format is valid
 */
export function isValidDateFormat(dateStr: string): boolean {
  const regex = /^\d{2}\.\d{2}\.\d{4}$/;
  return regex.test(dateStr);
}

/**
 * Example use of RecordSet format for the Candy Model API:
 * 
 * 1. Registering Batch Orders: /api/registrar_pedidos_batch
 * 2. Uploading Datasets: /api/upload-dataset
 * 3. Making Predictions: /api/predecir
 * 
 * See documentation for specific API usage examples.
 */
