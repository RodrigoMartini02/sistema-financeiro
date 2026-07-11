import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(process.cwd(), '../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
