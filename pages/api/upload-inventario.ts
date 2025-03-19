import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '../../lib/mongodb';
import { IncomingForm } from 'formidable';
import { promises as fs } from 'fs';
import * as xlsx from 'xlsx';
import path from 'path';
import os from 'os';

// Disable the default body parser to handle form data with files
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    // Use OS temp directory instead of project directory for temporary storage
    const uploadsDir = path.join(os.tmpdir(), 'candy-app-tmp');
    try {
      await fs.access(uploadsDir);
    } catch (error) {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    // Parse the incoming form data with debug options
    const form = new IncomingForm({
      uploadDir: uploadsDir,
      keepExtensions: true,
      maxFiles: 1,
      multiples: false,
    });

    // Process the form with better error handling and logging
    const formData = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Error parsing form:', err);
          return reject(err);
        }
        
        // Log the structure for debugging
        console.log('Form fields:', fields);
        console.log('Files object structure:', Object.keys(files));
        
        resolve({ fields, files });
      });
    });

    // Get the uploaded file - handle multiple formidable versions
    let file = null;
    if (formData.files.file) {
      // Handle as array or direct object based on structure
      if (Array.isArray(formData.files.file)) {
        file = formData.files.file[0];
      } else {
        file = formData.files.file;
      }
    }

    if (!file) {
      console.error('No file found in request. Files object:', formData.files);
      return res.status(400).json({ success: false, message: 'No se ha subido ningún archivo' });
    }

    console.log('File found:', file.originalFilename || file.name);

    // Read the Excel file - handle different property names for filepath
    const filePath = file.filepath || file.path;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'Error al procesar el archivo: ruta no encontrada' });
    }

    const workbook = xlsx.readFile(filePath);
    
    // Select the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Clean up temp file immediately after reading
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      console.error('Error deleting temp file:', unlinkError);
      // Continue processing even if file deletion fails
    }
    
    // Extract data specifically from columns A and L starting from row 8
    const processedData = [];
    let row = 8; // Start from row 8
    
    while (true) {
      const articleCell = worksheet[`A${row}`];
      const existenceCell = worksheet[`L${row}`];
      
      // Break if we've reached the end of data (no more article values)
      if (!articleCell || !articleCell.v) {
        break;
      }
      
      // Get article value - convert to string
      const articleValue = articleCell.v.toString().trim();
      
      // Skip if article is empty
      if (articleValue === '') {
        row++;
        continue;
      }
      
      // Get existence value - handle empty/missing values
      let existenceValue = 0;
      if (existenceCell && existenceCell.v !== undefined && existenceCell.v !== null) {
        // Convert to string for normalization
        const existenceStr = existenceCell.v.toString().trim();
        
        if (existenceStr !== '') {
          // Clean the string: remove dots (thousand separators), replace decimal commas with dots
          const cleanValue = existenceStr.replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^\d.-]/g, '');
          
          existenceValue = parseFloat(cleanValue) || 0;
        }
      }
      
      // Add to processed data
      processedData.push({
        articulo: articleValue,
        existencia: existenceValue
      });
      
      // Move to next row
      row++;
    }

    if (processedData.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se encontraron datos válidos en el archivo' 
      });
    }

    console.log(`Found ${processedData.length} valid entries from column A and L`);

    // Connect to MongoDB and insert data
    const { db } = await connectToDatabase();
    
    // Create a timestamp for this inventory snapshot
    const timestamp = new Date();
    const timestampStr = timestamp.toISOString();
    const inventoryDate = formData.fields.inventoryDate || timestamp.toISOString().split('T')[0];
    
    // Create a new collection with timestamp in the name for historical purposes
    const collectionName = `inventariocedis_${timestampStr.replace(/[:.]/g, '_')}`;
    
    // Insert new data into the historical collection
    await db.collection(collectionName).insertMany(processedData);
    console.log(`Created historical inventory collection: ${collectionName}`);
    
    // Also update the current inventory collection for backward compatibility
    try {
      await db.collection('inventariocedis').drop();
    } catch (error) {
      // Collection might not exist, continue
    }
    // Insert into current collection
    await db.collection('inventariocedis').insertMany(processedData);
    
    // Add metadata entry
    const metadataEntry = {
      timestamp,
      inventoryDate,
      filename: file.originalFilename || file.name,
      recordCount: processedData.length,
      collectionName,
    };
    
    // Add timestamp metadata
    await db.collection('inventariocedis_metadata').insertOne(metadataEntry);

    return res.status(200).json({
      success: true,
      message: 'Archivo procesado correctamente',
      count: processedData.length,
      preview: processedData.slice(0, 10), // Return first 10 items as preview
      inventoryDate,
      timestamp: timestampStr
    });

  } catch (error) {
    console.error('Error processing Excel file:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Error interno del servidor' 
    });
  }
}
