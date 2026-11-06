import { Pool, types } from 'pg';

// Pool próprio de Licitações no servidor. Não usa `src/db/client.ts`, que é o pool de Finanças.
// Banco: `TENDERS_DATABASE_URL`, o banco de Licitações (identidade em `public` e o schema `licitacoes`). Sem ela o
// servidor não sobe: não há banco de reserva, e o de Finanças nunca serve (as tabelas de acesso são outras).

// Datas como texto, como no app (src/db/client.ts) e no coletor.
types.setTypeParser(1082, (value) => value); // DATE
types.setTypeParser(1114, (value) => value); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, (value) => value); // TIMESTAMP WITH TIME ZONE

const TENDERS_POOL_SIZE = 10;

function parseDatabaseUrl(value: string, variable: string): URL {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new Error('invalid PostgreSQL URL');
    }
    return url;
  } catch {
    // A URL pode conter senha: nunca repassá-la no erro do parser.
    throw new Error(`${variable} must be a PostgreSQL URL with a database name`);
  }
}

/** Endereço do banco de Licitações; recusa o de Finanças, que serviria as tabelas erradas. */
export function tendersDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const url = env['TENDERS_DATABASE_URL'];
  if (!url) {
    throw new Error('TENDERS_DATABASE_URL is not set');
  }
  const database = parseDatabaseUrl(url, 'TENDERS_DATABASE_URL');
  const financeUrl = env['DATABASE_URL'];
  // O mesmo banco pode ter endereços interno e externo na Render. O nome
  // precisa ser outro, inclusive quando o host ou o papel são diferentes.
  if (financeUrl && decodeURIComponent(database.pathname) === decodeURIComponent(parseDatabaseUrl(financeUrl, 'DATABASE_URL').pathname)) {
    throw new Error('TENDERS_DATABASE_URL points to the same database as DATABASE_URL: Licitações has its own database');
  }
  return url;
}

export function createTendersPool(env: NodeJS.ProcessEnv = process.env): Pool {
  const connectionString = tendersDatabaseUrl(env);
  const hostname = parseDatabaseUrl(connectionString, 'TENDERS_DATABASE_URL').hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

  const pool = new Pool({
    connectionString,
    max: TENDERS_POOL_SIZE,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  // A tabela sem schema (usuarios, contas) vale no `public`, e as datas do PNCP, que chegam sem fuso, valem no
  // horário de Brasília.
  pool.on('connect', (client) => {
    client.query('SET search_path TO public');
    client.query("SET timezone = 'America/Sao_Paulo'");
  });
  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL error (tenders pool):', error);
  });

  return pool;
}
