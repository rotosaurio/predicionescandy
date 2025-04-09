import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import axios from 'axios';
import FormData from 'form-data'; // Import Node.js form-data package
import { isValidRecordSetFormat, createRecordSet, convertSingleRecordToRecordSet } from './recordset-helper';

// Update API base URL to match other endpoints
const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';

export const config = {
  api: {
    bodyParser: false, // Disable the default body parser for file uploads
    responseLimit: '12mb',
  },
};

// Helper function to parse form data that works with different formidable versions
const parseForm = (req: NextApiRequest): Promise<{
  fields: formidable.Fields,
  files: formidable.Files
}> => {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true });
    
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    console.log('Processing file upload request to forward to Hugging Face');
    
    // Use the callback-based approach which works with all formidable versions
    const { fields, files } = await parseForm(req);
    
    // Check if file exists
    const fileArray = files.file;
    if (!fileArray || Array.isArray(fileArray) && fileArray.length === 0) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    // Get the file (handle both array and single object formats)
    const uploadedFile = Array.isArray(fileArray) ? fileArray[0] : fileArray;
    
    // Get the info from fields
    const infoField = fields.info;
    const info = infoField 
      ? (Array.isArray(infoField) ? infoField[0] : infoField)
      : '{}';
    
    const infoObj = typeof info === 'string' ? JSON.parse(info) : info;
    
    // Fix: Add null checks and provide default values for potentially null properties
    const fileName = uploadedFile.originalFilename || 'unnamed_file';
    const fileSize = uploadedFile.size || 0;
    const filePath = uploadedFile.filepath || '';
    const fileMimeType = uploadedFile.mimetype || 'application/octet-stream';
    
    console.log(`Uploading file: ${fileName}, Size: ${fileSize} bytes`);
    
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }
    
    // Process JSON files to ensure RecordSet format
    if (fileName.endsWith('.json')) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);
        
        // Check if it's not already in RecordSet format
        if (!jsonData.RecordSet) {
          // Convert to RecordSet format
          const convertedData = Array.isArray(jsonData) 
            ? createRecordSet(jsonData)
            : convertSingleRecordToRecordSet(jsonData);
          
          // Write the converted file back
          fs.writeFileSync(filePath, JSON.stringify(convertedData));
          console.log('Converted file to RecordSet format');
        }
      } catch (err) {
        console.error('Error processing JSON file:', err);
        // Continue with original file if conversion fails
      }
    }
    
    // Create Node.js form-data for the proxied request
    const formData = new FormData();
    
    // Add file to form data using createReadStream
    formData.append('file', fs.createReadStream(filePath), {
      filename: fileName,
      contentType: fileMimeType
    });
    
    // Extract and add all the fields directly from the request
    // This makes the code more flexible as we add more parameters
    const extractField = (fieldName: string, defaultValue?: string): string => {
      const field = fields[fieldName];
      if (!field) return defaultValue || '';
      return Array.isArray(field) ? field[0] : field;
    };
    
    // Add required and optional fields to the form data as per API specifications
    formData.append('dataset_name', extractField('dataset_name'));
    formData.append('description', extractField('description'));
    formData.append('replace_existing', extractField('replace_existing', 'false'));
    formData.append('date_format', extractField('date_format', 'DD.MM.YYYY'));
    
    // Add optional fields
    if (fields.start_date) formData.append('start_date', extractField('start_date'));
    if (fields.end_date) formData.append('end_date', extractField('end_date'));

    try {
      // Now we can use formData.getHeaders() since we're using the Node.js form-data package
      const response = await axios.post(`${API_BASE_URL}/api/upload-dataset`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      // Clean up temp file
      fs.unlinkSync(filePath);
      
      // Log response information for debugging
      console.log(`Response status: ${response.status}`);
      
      // Check if we have an error status code
      if (response.status >= 400) {
        console.log('Error response details:', response.data);
        
        // Return the error details from the API
        return res.status(response.status).json({
          success: false,
          message: 'Server validation error',
          api_response: response.data,
          status_code: response.status
        });
      }
      
      // Forward the successful response with expected format
      return res.status(response.status).json({
        success: true,
        message: response.data.message || 'Dataset uploaded successfully',
        dataset_id: response.data.dataset_id,
        summary: response.data.summary || {
          total_records: response.data.total_records,
          unique_products: response.data.unique_products,
          unique_locations: response.data.unique_locations,
          date_range: response.data.date_range,
          errors: response.data.errors || []
        }
      });
    } catch (axiosError) {
      // Handle axios-specific errors
      if (axios.isAxiosError(axiosError) && axiosError.response) {
        console.log('Error response details:', axiosError.response.data);
        
        return res.status(axiosError.response.status || 500).json({
          success: false,
          message: 'Error from API server',
          api_response: axiosError.response.data,
          status_code: axiosError.response.status
        });
      }
      
      // Re-throw for general error handling
      throw axiosError;
    }
    
  } catch (error) {
    console.error('Error in upload proxy:', error);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error processing upload', 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    });
  }
}
