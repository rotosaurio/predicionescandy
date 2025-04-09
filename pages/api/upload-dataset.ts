import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const config = {
  api: {
    bodyParser: false,
  },
};

const API_BASE_URL = 'https://rotosaurio-candymodel.hf.space';
const API_ENDPOINT = `${API_BASE_URL}/api/upload-dataset`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Fix: Use options object for formidable configuration
    const form = formidable({
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB limit
    });

    const formData = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const { fields, files } = formData;
    console.log('Received file upload with fields:', fields);

    // Get file from the request (handle both array and single file cases)
    const fileArray = files.file;
    const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;
    
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    // Fix: Use node-fetch or another method to send multipart/form-data to API
    const formDataForApi = new FormData();
    
    // Read file and append to form with proper null checks
    const fileBuffer = fs.readFileSync(file.filepath as string);
    const fileName = file.originalFilename || 'dataset.json';
    formDataForApi.append('file', new Blob([fileBuffer]), fileName);

    // Add metadata fields with null checks
    if (fields.dataset_name && typeof fields.dataset_name === 'string') {
      formDataForApi.append('dataset_name', fields.dataset_name);
    }
    
    if (fields.start_date && typeof fields.start_date === 'string') {
      formDataForApi.append('start_date', fields.start_date);
    }
    
    if (fields.end_date && typeof fields.end_date === 'string') {
      formDataForApi.append('end_date', fields.end_date);
    }

    // Forward request to backend API
    const response = await axios.post(API_ENDPOINT, formDataForApi, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    // Clean up the temp file
    fs.unlinkSync(file.filepath as string);

    return res.status(200).json({
      success: true,
      message: 'Dataset uploaded successfully',
      data: response.data,
    });
  } catch (error) {
    console.error('Error in upload-dataset API route:', error);
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown error occurred while uploading dataset';
      
    return res.status(500).json({
      success: false,
      message: 'Error uploading dataset to backend',
      error: errorMessage,
    });
  }
}
