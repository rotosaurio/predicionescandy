import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://candymarttest:0uGLqVvDsMCAVn5P@cluster0.mts9c.mongodb.net/';
const MONGODB_DB = process.env.MONGODB_DB || 'inventory_predictions';

if (!MONGODB_URI) {
  throw new Error('Por favor, define la variable de entorno MONGODB_URI');
}

let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

export async function connectToDatabase() {
  // Si ya existe una conexión, la retornamos
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Creamos una nueva conexión
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);

  // Almacenamos la conexión en caché
  cachedClient = client;
  cachedDb = db;

  return { client, db };
} 