import { Pool, types } from 'pg';

// Pool próprio de Licitações no servidor. Não usa `src/db/client.ts`, que é o pool de Finanças.
// Banco: `TENDERS_DATABASE_URL`; sem ela, o banco de hoje (`DATABASE_URL`, o mesmo de Finanças) até a entrega 3B
// da Etapa 3 mover Licitações para o banco dela.

// Datas como texto, como no app (src/db/client.ts) e no coletor.
types.setTypeParser(1082, (value) => value); // DATE
types.setTypeParser(1114, (value) => value); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, (value) => value); // TIMESTAMP WITH TIME ZONE

const TENDERS_POOL_SIZE = 10;
const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

/** Endereço do banco de Licitações: o próprio, ou o de Finanças enquanto ele não existe. */
export function tendersDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const url = env['TENDERS_DATABASE_URL'] ?? env['DATABASE_URL'];
  if (!url) {
    throw new Error('TENDERS_DATABASE_URL (or DATABASE_URL) is not set');
  }
  return url;
}

export function createTendersPool(env: NodeJS.ProcessEnv = process.env): Pool {
  const connectionString = tendersDatabaseUrl(env);
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const schema = env['DB_SCHEMA'] ?? 'public';
  if (!SCHEMA_NAME.test(schema)) {
    throw new Error('DB_SCHEMA is invalid');
  }

  const pool = new Pool({
    connectionString,
    max: TENDERS_POOL_SIZE,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  // Mesma sessão do pool de Finanças: a tabela sem schema (usuarios, contas) vale no DB_SCHEMA do ambiente, e
  // as datas do PNCP, que chegam sem fuso, valem no horário de Brasília.
  pool.on('connect', (client) => {
    client.query(`SET search_path TO ${schema}, public`);
    client.query("SET timezone = 'America/Sao_Paulo'");
  });
  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL error (tenders pool):', error);
  });

  return pool;
}
