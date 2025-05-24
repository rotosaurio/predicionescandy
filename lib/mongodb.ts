import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://candymarttest:0uGLqVvDsMCAVn5P@cluster0.mts9c.mongodb.net/';
const MONGODB_DB = process.env.MONGODB_DB || 'inventory_predictions';

// Sistema de logs para MongoDB
function logMongo(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [MONGODB] [${level}]`;
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

if (!MONGODB_URI) {
  logMongo('ERROR', 'Variable de entorno MONGODB_URI no definida');
  throw new Error('Por favor, define la variable de entorno MONGODB_URI');
}

let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

export async function connectToDatabase() {
  // Si ya existe una conexión, la retornamos
  if (cachedClient && cachedDb) {
    logMongo('INFO', 'Utilizando conexión en caché a MongoDB');
    return { client: cachedClient, db: cachedDb };
  }

  // Creamos una nueva conexión
  logMongo('INFO', 'Estableciendo nueva conexión a MongoDB', { 
    database: MONGODB_DB,
    uri: MONGODB_URI.substring(0, 20) + '***' // Mostramos solo parte de la URI por seguridad
  });
  
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);

    // Almacenamos la conexión en caché
    cachedClient = client;
    cachedDb = db;

    logMongo('INFO', 'Conexión a MongoDB establecida exitosamente');
    return { client, db };
  } catch (error) {
    logMongo('ERROR', 'Error al conectar con MongoDB', error);
    throw error;
  }
}

// Función para cerrar la conexión cuando sea necesario
export async function closeMongoConnection() {
  if (cachedClient) {
    logMongo('INFO', 'Cerrando conexión a MongoDB');
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    logMongo('INFO', 'Conexión a MongoDB cerrada exitosamente');
  }
} 