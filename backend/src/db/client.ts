import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import * as schema from './schema';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(process.cwd(), '../../.env') });

// Return dates as strings to avoid timezone issues
types.setTypeParser(1082, (val) => val); // DATE
types.setTypeParser(1114, (val) => val); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, (val) => val); // TIMESTAMP WITH TIME ZONE

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const connectionString = process.env.DATABASE_URL;
const isLocal =
  connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const DB_SCHEMA = process.env.DB_SCHEMA ?? 'public';

pool.on('connect', (client) => {
  client.query(`SET search_path TO ${DB_SCHEMA}, public`);
  client.query("SET timezone = 'America/Sao_Paulo'");
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

export const db = drizzle(pool, { schema });

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('PostgreSQL connected:', result.rows[0]?.now);
    return true;
  } catch (error) {
    console.error('PostgreSQL connection failed:', (error as Error).message);
    return false;
  }
}
