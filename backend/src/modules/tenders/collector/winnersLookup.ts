import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inArray } from 'drizzle-orm';
import { ContractStoreReader, type ContractStoreAccess } from '../contractStore/reader';
import { PURCHASE_CONTROL_NUMBER } from '../contractStore/layout';
import {
  queryTopAgencies,
  queryWinnerList,
  queryWinnerSummary,
  type WinnerAgencySummary,
  type WinnerListRow,
  type WinnerSummary,
} from '../contractStore/winnerQueries';
import { tenderNotices } from '../db/schema';
import { CollectorConfigError } from './config';
import type { TendersDb } from './database';
import type { CollectorContext } from './runs';

// Consulta de vencedores por CNPJ (comando `winners-lookup`, plano .plans/licitacoes-vencedores.md): o aceite da
// Parte 3, sem tela. Abre o armazém só com o conjunto `vencedores` numa pasta própria do disco temporário, imprime o
// resumo do fornecedor, os órgãos em que mais venceu e as vitórias mais recentes, com o edital ligado quando ele
// ainda existe no banco (os editais saem 12 meses depois de encerrados) ou o endereço da compra. O CNPJ entra só como
// argumento: nada aqui é específico de uma empresa.

/** Pasta da cópia de consulta: só os arquivos dos vencedores, longe da cópia de trabalho dos contratos. */
const LOOKUP_DIRECTORY = join(tmpdir(), 'licitacoes-vencedores-consulta');
export const DEFAULT_LOOKUP_LIMIT = 20;
export const MAX_LOOKUP_LIMIT = 100;
const TOP_AGENCIES = 10;

export interface WinnerLookupItem extends WinnerListRow {
  /** Id do edital no banco, quando a licitação ainda tem edital. */
  noticeId: number | null;
  /** Endereço da compra na fonte oficial, para o que não tem edital. */
  link: string;
}

export interface WinnersLookupReport {
  cnpj: string;
  /** A versão do armazém lida. */
  store: { revision: string | null; publishedAt: string | null; winnerRows: number };
  summary: WinnerSummary;
  agencies: WinnerAgencySummary[];
  recentWins: WinnerLookupItem[];
}

/** Endereço da compra pelo número de controle (CNPJ do órgão, ano e sequencial sem zeros à esquerda). */
export function purchaseLink(purchaseControlNumber: string): string {
  const match = PURCHASE_CONTROL_NUMBER.exec(purchaseControlNumber);
  return match ? `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${match[2]}` : '';
}

/** Os ids dos editais que existem no banco, por número de controle, numa consulta só. */
export async function findNoticeIds(db: TendersDb, controlNumbers: readonly string[]): Promise<Map<string, number>> {
  if (controlNumbers.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: tenderNotices.id, controlNumber: tenderNotices.pncpControlNumber })
    .from(tenderNotices)
    .where(inArray(tenderNotices.pncpControlNumber, [...controlNumbers]));
  return new Map(rows.map((row) => [row.controlNumber, row.id]));
}

export interface WinnersLookupDeps {
  store: ContractStoreAccess;
  /** Ids dos editais por número de controle; no comando, a consulta no banco (findNoticeIds). */
  noticeIds: (controlNumbers: readonly string[]) => Promise<Map<string, number>>;
}

/** O relatório de um fornecedor sobre o armazém indicado. O CNPJ é conferido pelas consultas (14 dígitos). */
export async function lookupWinners(deps: WinnersLookupDeps, cnpj: string, limit = DEFAULT_LOOKUP_LIMIT): Promise<WinnersLookupReport> {
  const status = deps.store.status();
  const { summary, agencies, wins } = await deps.store.query(async (connection) => ({
    summary: await queryWinnerSummary(connection, cnpj),
    agencies: await queryTopAgencies(connection, cnpj, TOP_AGENCIES),
    wins: await queryWinnerList(connection, cnpj, { limit: Math.min(Math.max(Math.trunc(limit), 1), MAX_LOOKUP_LIMIT) }),
  }));
  const noticeIds = await deps.noticeIds(wins.map((win) => win.purchaseControlNumber));
  return {
    cnpj,
    store: { revision: status.revision, publishedAt: status.publishedAt, winnerRows: status.winners?.rows ?? 0 },
    summary,
    agencies,
    recentWins: wins.map((win) => ({ ...win, noticeId: noticeIds.get(win.purchaseControlNumber) ?? null, link: purchaseLink(win.purchaseControlNumber) })),
  };
}

/** O comando: abre a cópia de consulta dos vencedores no R2, monta o relatório e fecha. */
export async function runWinnersLookup(context: CollectorContext, cnpj: string, limit: number): Promise<WinnersLookupReport> {
  if (!context.storage) {
    throw new CollectorConfigError('Os vencedores ficam no R2: defina TENDERS_ARCHIVE_ENDPOINT, TENDERS_ARCHIVE_BUCKET, TENDERS_ARCHIVE_ACCESS_KEY_ID, TENDERS_ARCHIVE_SECRET_ACCESS_KEY e TENDERS_STORAGE_PREFIX');
  }
  const reader = await ContractStoreReader.create({
    storage: context.storage,
    directory: LOOKUP_DIRECTORY,
    logger: context.logger,
    datasets: ['vencedores'],
  });
  try {
    await reader.refresh();
    if (!reader.status().ready) {
      throw new Error('O armazém não respondeu: tente de novo em instantes');
    }
    return await lookupWinners({ store: reader, noticeIds: (controlNumbers) => findNoticeIds(context.db, controlNumbers) }, cnpj, limit);
  } finally {
    await reader.close();
  }
}
