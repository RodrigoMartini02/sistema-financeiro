import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { TendersDb } from '../collector/database';
import type { ContractStoreAccess } from '../contractStore/reader';
import * as tendersTables from '../db/schema';
import { createPncpDetailSource, type PncpDetailSource } from '../services/pncpDetails';

/**
 * O que as rotas do módulo usam; os testes trocam o banco (transação desfeita),
 * o PNCP (simulado) e o armazém de contratos (um armazém de exemplo).
 */
export interface TendersApiDeps {
  db: TendersDb;
  pncpDetails: PncpDetailSource;
  /** Os contratos, no R2 (contractStore): consulta e se há cópia pronta. */
  contractStore: ContractStoreAccess;
  now: () => Date;
}

/** No servidor: o pool do app (fuso de Brasília e datas como texto), o PNCP de verdade e o armazém do Web Service. */
export function tendersApiDepsFromPool(pool: Pool, contractStore: ContractStoreAccess): TendersApiDeps {
  return {
    db: drizzle(pool, { schema: tendersTables }),
    pncpDetails: createPncpDetailSource(),
    contractStore,
    now: () => new Date(),
  };
}
