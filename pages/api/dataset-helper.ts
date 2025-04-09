import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { NextApiRequest, NextApiResponse } from 'next';

// Use consistent API base URL
const API_BASE_URL = 'http://0.0.0.0:8000';

/**
 * Utility to check and debug dataset issues
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const results = {
    directApiCheck: null as any,
    datasetsList: [] as string[],
    uploadFolderCheck: null as any,
    diagnosticInfo: {} as any
  };

  try {
    // Check 1: Test direct API connection
    try {
      console.log('Testing direct API connection to datasets endpoint');
      const response = await axios.get(`${API_BASE_URL}/api/datasets`);
      results.directApiCheck = {
        status: response.status,
        message: 'API connection successful',
        data: response.data
      };
    } catch (error) {
      console.error('Error testing API connection:', error);
      results.directApiCheck = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Check 2: Try to find datasets in the default temp directory
    const tmpDir = path.join(process.cwd(), 'tmp');
    const uploadDir = path.join(tmpDir, 'uploads');
    
    try {
      if (fs.existsSync(tmpDir)) {
        results.datasetsList.push(...fs.readdirSync(tmpDir));
      }
      
      if (fs.existsSync(uploadDir)) {
        results.datasetsList.push(...fs.readdirSync(uploadDir).map(f => `uploads/${f}`));
      }
      
      results.uploadFolderCheck = {
        tmpDirExists: fs.existsSync(tmpDir),
        uploadDirExists: fs.existsSync(uploadDir),
        tmpPath: tmpDir,
        uploadPath: uploadDir
      };
    } catch (error) {
      console.error('Error checking directories:', error);
      results.uploadFolderCheck = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
    
    // Check 3: Additional diagnostic info
    results.diagnosticInfo = {
      apiBaseUrl: API_BASE_URL,
      nodeEnv: process.env.NODE_ENV,
      platform: process.platform,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    };

    return res.status(200).json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error in dataset helper:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking datasets',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
