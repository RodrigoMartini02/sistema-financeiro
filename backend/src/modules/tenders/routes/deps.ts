import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { TendersDb } from '../collector/database';
import * as tendersTables from '../db/schema';
import { createPncpDetailSource, type PncpDetailSource } from '../services/pncpDetails';

/** O que as rotas do módulo usam; os testes trocam o banco (transação desfeita) e o PNCP (simulado). */
export interface TendersApiDeps {
  db: TendersDb;
  pncpDetails: PncpDetailSource;
  now: () => Date;
}

/** No servidor: o pool do app (fuso de Brasília e datas como texto) e o PNCP de verdade. */
export function tendersApiDepsFromPool(pool: Pool): TendersApiDeps {
  return {
    db: drizzle(pool, { schema: tendersTables }),
    pncpDetails: createPncpDetailSource(),
    now: () => new Date(),
  };
}
