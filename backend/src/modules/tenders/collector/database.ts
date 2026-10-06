import { Pool, types } from 'pg';
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as tendersTables from '../db/schema';
import type { CollectorLogger } from './logger';

// Conexão própria do coletor. Não usa src/db/client.ts, que exige DATABASE_URL
// e abre o pool do app: o coletor roda no Render Cron Job com o usuário
// restrito ao schema `licitacoes` (TENDERS_COLLECTOR_DATABASE_URL).

// Datas como texto, como no app (src/db/client.ts).
types.setTypeParser(1082, (value) => value); // DATE
types.setTypeParser(1114, (value) => value); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, (value) => value); // TIMESTAMP WITH TIME ZONE

/** Banco do módulo: aceita a conexão direta ou uma transação (as funções do coletor recebem qualquer uma). */
export type TendersDb = PgDatabase<NodePgQueryResultHKT, typeof tendersTables>;

const COLLECTOR_POOL_SIZE = 3;

export function createCollectorDatabase(databaseUrl: string, logger?: CollectorLogger): { pool: Pool; db: TendersDb } {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: COLLECTOR_POOL_SIZE,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  // As datas do PNCP chegam sem fuso: com a sessão em Brasília, o banco as grava no horário certo.
  pool.on('connect', (client) => {
    client.query("SET timezone = 'America/Sao_Paulo'");
  });
  pool.on('error', (error) => {
    logger?.error('Erro inesperado na conexão do coletor', { error });
  });

  return { pool, db: drizzle(pool, { schema: tendersTables }) };
}
