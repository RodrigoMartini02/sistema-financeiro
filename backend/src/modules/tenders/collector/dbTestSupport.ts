import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import type { Pool } from 'pg';
import { TransactionRollbackError } from 'drizzle-orm';
import { accounts } from '../../../db/schema/accounts';
import { users } from '../../../db/schema/users';
import {
  tenderContracts,
  tenderEnabledAccounts,
  tenderNotices,
  tenderSavedSearches,
  tenderTrackingHistory,
  tenderTrackings,
} from '../db/schema';
import type { TrackingStatus } from '../domains';
import type { ArchiveStorage } from './archive';
import { loadCollectorConfig, type ContractsSettings } from './config';
import type { TenderContractRow } from './contractMapping';
import { createCollectorDatabase, type TendersDb } from './database';
import { createCollectorLogger } from './logger';
import { payloadHash, type TenderNoticeRow } from './mapping';
import { PncpClient } from './pncpClient';
import type { CollectorContext } from './runs';

// Apoio dos testes de banco (*.db.test.ts). Eles só rodam pelo script
// test:tenders-db (TENDERS_DB_TESTS=1), só no banco local e cada teste numa
// transação desfeita no fim: nada fica gravado.

const LOCAL_DATABASE_URL = /@localhost:5433\/sistema_financas_dev$/;

export const databaseTestsSkipReason =
  process.env['TENDERS_DB_TESTS'] === '1' ? false : 'teste de banco: rode npm --prefix backend run test:tenders-db';

let connection: { pool: Pool; db: TendersDb } | undefined;

function localConnection(): { pool: Pool; db: TendersDb } {
  if (connection) {
    return connection;
  }
  if (process.env['DOTENV_CONFIG_PATH']) {
    dotenv.config({ path: process.env['DOTENV_CONFIG_PATH'] });
  }
  const url = process.env['DATABASE_URL'] ?? '';
  if (!LOCAL_DATABASE_URL.test(url)) {
    throw new Error('Os testes de banco só rodam no banco local (localhost:5433/sistema_financas_dev).');
  }
  connection = createCollectorDatabase(url);
  return connection;
}

export function localTestPool(): Pool {
  return localConnection().pool;
}

export async function closeLocalTestDatabase(): Promise<void> {
  await connection?.pool.end();
  connection = undefined;
}

/** Roda o teste numa transação desfeita no fim. */
export async function withRollback(work: (tx: TendersDb) => Promise<void>): Promise<void> {
  try {
    await localConnection().db.transaction(async (tx) => {
      await work(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) {
      throw error;
    }
  }
}

export async function createTestUser(tx: TendersDb, label: string): Promise<number> {
  const [user] = await tx
    .insert(users)
    .values({ name: `Teste licitações ${label}`, email: `licitacoes-${label}-${randomUUID()}@exemplo.test`, password: 'teste' })
    .returning({ id: users.id });
  if (!user) {
    throw new Error('usuário de teste não criado');
  }
  return user.id;
}

/** Conta PJ de teste com o titular; `enabled` a habilita no módulo. */
export async function createTestAccount(
  tx: TendersDb,
  label: string,
  options: { enabled: boolean } = { enabled: true },
): Promise<{ accountId: number; ownerId: number }> {
  const ownerId = await createTestUser(tx, `${label}-titular`);
  const [account] = await tx
    .insert(accounts)
    .values({ userId: ownerId, name: `Conta ${label}`, type: 'empresa' })
    .returning({ id: accounts.id });
  if (!account) {
    throw new Error('conta de teste não criada');
  }
  if (options.enabled) {
    await tx.insert(tenderEnabledAccounts).values({ accountId: account.id, active: true });
  }
  return { accountId: account.id, ownerId };
}

export function buildNoticeRow(overrides: Partial<TenderNoticeRow> = {}): TenderNoticeRow {
  const pncpControlNumber = overrides.pncpControlNumber ?? `TESTE-${randomUUID().slice(0, 18)}`;
  const payload = overrides.payload ?? { numeroControlePNCP: pncpControlNumber, objetoCompra: overrides.procurementObject };
  return {
    pncpControlNumber,
    procurementObject: 'Objeto de teste',
    state: 'MA',
    modalityId: 6,
    situationId: 1,
    estimatedTotalValue: '100000.00',
    proposalClosesAt: null,
    ...overrides,
    payload,
    payloadHash: overrides.payloadHash ?? payloadHash(payload),
  };
}

export async function insertTestNotice(tx: TendersDb, overrides: Partial<TenderNoticeRow> = {}): Promise<number> {
  const [notice] = await tx.insert(tenderNotices).values(buildNoticeRow(overrides)).returning({ id: tenderNotices.id });
  if (!notice) {
    throw new Error('edital de teste não criado');
  }
  return notice.id;
}

export async function insertSavedSearch(
  tx: TendersDb,
  values: Omit<typeof tenderSavedSearches.$inferInsert, 'name'> & { name?: string },
): Promise<number> {
  const [search] = await tx
    .insert(tenderSavedSearches)
    .values({ name: 'Busca de teste', ...values })
    .returning({ id: tenderSavedSearches.id });
  if (!search) {
    throw new Error('busca de teste não criada');
  }
  return search.id;
}

/** Contrato de teste com número de controle único (o banco local pode ter os contratos do piloto). */
export function buildContractRow(overrides: Partial<TenderContractRow> = {}): TenderContractRow {
  const pncpControlNumber = overrides.pncpControlNumber ?? `TESTE-${randomUUID().slice(0, 18)}`;
  return {
    pncpControlNumber,
    contractYear: 2026,
    contractSequence: 1,
    agencyCnpj: '03353358000196',
    contractObject: 'Contrato de teste',
    termStart: '2026-01-01',
    originalTermEnd: '2027-01-01',
    expiresOn: '2027-01-01',
    publishedAt: '2026-01-02T10:00:00',
    payloadHash: payloadHash({ pncpControlNumber, ...overrides }),
    ...overrides,
  };
}

export async function insertTestContract(tx: TendersDb, overrides: Partial<TenderContractRow> = {}): Promise<number> {
  const [contract] = await tx.insert(tenderContracts).values(buildContractRow(overrides)).returning({ id: tenderContracts.id });
  if (!contract) {
    throw new Error('contrato de teste não criado');
  }
  return contract.id;
}

/** Resposta simulada do PNCP para os clientes do contexto de teste. */
export type FakePncpFetch = (url: URL) => Response | Promise<Response>;

/**
 * Contexto do coletor sobre a transação do teste, com clientes do PNCP
 * simulados (sem rede e sem espera) e log desligado. As travas usam o pool
 * local, como na execução real. Sem `archive`, o arquivo bruto fica desligado.
 */
export function createTestCollectorContext(
  tx: TendersDb,
  options: {
    contractsFetch: FakePncpFetch;
    termsFetch?: FakePncpFetch;
    now?: () => Date;
    contracts?: Partial<ContractsSettings>;
    archive?: ArchiveStorage;
  },
): CollectorContext {
  const config = loadCollectorConfig({
    TENDERS_COLLECTOR_DATABASE_URL: 'postgres://teste@localhost:5433/sistema_financas_dev',
    PNCP_MAX_ATTEMPTS: '1',
  });
  const clientOptions = { ...config.pncp, requestIntervalMs: 0, sleep: async () => {} };
  const fakeFetch = (handler: FakePncpFetch): typeof fetch => async (input) => handler(new URL(String(input)));
  const unexpected: FakePncpFetch = (url) => {
    throw new Error(`pedido inesperado ao PNCP: ${url.toString()}`);
  };
  return {
    db: tx,
    pool: localTestPool(),
    pncp: new PncpClient({ ...clientOptions, fetch: fakeFetch(unexpected) }),
    contractsPncp: new PncpClient({ ...clientOptions, pageSize: 500, fetch: fakeFetch(options.contractsFetch) }),
    termsPncp: new PncpClient({
      ...clientOptions,
      baseUrl: 'https://pncp.example/api/pncp',
      pageSize: 500,
      fetch: fakeFetch(options.termsFetch ?? unexpected),
    }),
    archive: options.archive ?? null,
    config: { ...config, contracts: { ...config.contracts, ...options.contracts } },
    logger: createCollectorLogger('error', () => {}),
    now: options.now ?? (() => new Date()),
  };
}

/** Acompanhamento da conta, com a linha de histórico de quem marcou (como a API fará). */
export async function trackNotice(
  tx: TendersDb,
  values: { accountId: number; noticeId: number; status: TrackingStatus; userId: number },
): Promise<void> {
  await tx.insert(tenderTrackings).values({ ...values, updatedBy: values.userId });
  await tx.insert(tenderTrackingHistory).values({
    accountId: values.accountId,
    noticeId: values.noticeId,
    newStatus: values.status,
    userId: values.userId,
  });
}
