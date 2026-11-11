import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { TendersDb } from '../collector/database';
import type { ContractStoreAccess } from '../contractStore/reader';
import * as tendersTables from '../db/schema';
import type { ObjectStorage } from '../objectStorage';
import { readTendersAuthConfig, type TendersAuthConfig } from '../services/authTokens';
import { createBrasilApiCompanySource, type CompanyLookupSource } from '../services/companyLookup';
import { createGoogleProfileReader, type GoogleProfileReader } from '../services/googleAuth';
import { createPncpDetailSource, type PncpDetailSource } from '../services/pncpDetails';
import { createRecoveryEmailSender, type RecoveryEmailSender } from '../services/recoveryEmail';
import type { SanctionSource } from '../services/sanctionSource';

/**
 * O que as rotas do módulo usam; os testes trocam o banco (transação desfeita),
 * o PNCP (simulado), a consulta do CNPJ (simulada), a consulta de sanções (simulada) e o armazém de contratos (um armazém de exemplo).
 */
export interface TendersApiDeps {
  db: TendersDb;
  pncpDetails: PncpDetailSource;
  /** A consulta cadastral do CNPJ do perfil da empresa. */
  companyLookup: CompanyLookupSource;
  /** Os contratos, no R2 (contractStore): consulta e se há cópia pronta. */
  contractStore: ContractStoreAccess;
  /** O R2 dos arquivos dos usuários (foto de perfil); null sem as variáveis `R2_*`: o envio de foto fica indisponível. */
  userFiles: ObjectStorage | null;
  /**
   * A consulta de sanções (CEIS, CNEP e CEPIM, no Portal da Transparência); null sem a chave
   * `PORTAL_TRANSPARENCIA_API_KEY`: a tela mostra "consulta indisponível".
   */
  sanctions: SanctionSource | null;
  now: () => Date;
}

/**
 * No servidor: o pool do app (fuso de Brasília e datas como texto), o PNCP e a consulta do CNPJ de verdade, o armazém
 * do Web Service, o R2 dos arquivos dos usuários e a fonte das sanções (nula sem a chave).
 */
export function tendersApiDepsFromPool(
  pool: Pool,
  contractStore: ContractStoreAccess,
  userFiles: ObjectStorage | null,
  sanctions: SanctionSource | null,
): TendersApiDeps {
  return {
    db: drizzle(pool, { schema: tendersTables }),
    pncpDetails: createPncpDetailSource(),
    companyLookup: createBrasilApiCompanySource(),
    contractStore,
    userFiles,
    sanctions,
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
