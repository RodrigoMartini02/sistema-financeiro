import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { TendersDb } from '../collector/database';
import type { ContractStoreAccess } from '../contractStore/reader';
import * as tendersTables from '../db/schema';
import { readTendersAuthConfig, type TendersAuthConfig } from '../services/authTokens';
import { createGoogleProfileReader, type GoogleProfileReader } from '../services/googleAuth';
import { createPncpDetailSource, type PncpDetailSource } from '../services/pncpDetails';
import { createRecoveryEmailSender, type RecoveryEmailSender } from '../services/recoveryEmail';

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

/**
 * O que o acesso (login, cadastro, recuperação de senha, Google) usa: o banco do módulo, o segredo do token e os
 * serviços externos, que os testes trocam por versões simuladas.
 */
export interface TendersAuthDeps {
  db: TendersDb;
  config: TendersAuthConfig;
  now: () => Date;
  sendRecoveryEmail: RecoveryEmailSender;
  readGoogleProfile: GoogleProfileReader;
}

/** No servidor: segredo e validade do ambiente, EmailJS e Google de verdade. Sem TENDERS_JWT_SECRET o servidor não sobe. */
export function tendersAuthDepsFromEnv(db: TendersDb, env: NodeJS.ProcessEnv): TendersAuthDeps {
  return {
    db,
    config: readTendersAuthConfig(env),
    now: () => new Date(),
    sendRecoveryEmail: createRecoveryEmailSender(env),
    readGoogleProfile: createGoogleProfileReader(env),
  };
}
