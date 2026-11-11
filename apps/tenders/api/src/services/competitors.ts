import { and, asc, count, eq, sql } from 'drizzle-orm';
import { addCalendarDays, brasiliaDate } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import { queryCompetitorSummaries } from '../contractStore/competitorQueries';
import type { ContractStoreAccess } from '../contractStore/reader';
import { tenderCompetitors } from '../db/schema';
import { RequestInputError } from '../utils/requestInput';
import { toBrasiliaIso } from './dates';
import type { SearchRequester } from './noticeSearch';

// Concorrentes monitorados de cada pessoa na conta (plano .plans/licitacoes-4-concorrentes-monitorados.md, migration
// 0005): o CNPJ do fornecedor que ela acompanha, com apelido opcional e o botão "Avisar contratos novos". São pessoais
// (toda leitura e escrita filtra conta e pessoa, vindas da sessão), com o limite de 30. O nome e os números do concorrente
// vêm do armazém de contratos (`readCompetitorSummaries`); a lista em si só usa o Postgres e nunca depende do armazém.
// O aviso de contrato novo é gerado pela rotina diária (collector/contractNotifications.ts).

/** Concorrentes por pessoa na conta. */
export const MAX_COMPETITORS_PER_USER = 30;
export const MAX_COMPETITOR_NICKNAME_LENGTH = 80;
/** A janela do número "novos": contratos publicados nos últimos 30 dias. */
export const COMPETITOR_RECENT_DAYS = 30;

const NOT_FOUND_MESSAGE = 'Concorrente não encontrado';

export interface CompetitorView {
  cnpj: string;
  nickname: string | null;
  /** Avisar no sino quando o concorrente tiver contrato novo. */
  notify: boolean;
  createdAt: string | null;
}

export interface CompetitorList {
  items: CompetitorView[];
  /** O limite por pessoa, para a tela mostrar "N de 30". */
  limit: number;
}

/** Os números de um concorrente no armazém; sem contrato nenhum, tudo zero e sem nome. */
export interface CompetitorSummaryView {
  cnpj: string;
  /** O nome no contrato mais recente. */
  name: string | null;
  total: number;
  /** Vigentes hoje. */
  active: number;
  /** Publicados nos últimos 30 dias. */
  last30Days: number;
  /** Data e hora da publicação mais recente, em ISO 8601 com o fuso de Brasília. */
  lastPublishedAt: string | null;
}

/** O que o resumo usa: o Postgres, o armazém e o relógio (o `TendersApiDeps` das rotas serve). */
export interface CompetitorSummaryDeps {
  db: TendersDb;
  contractStore: ContractStoreAccess;
  now: () => Date;
}

type CompetitorRow = typeof tenderCompetitors.$inferSelect;

function ownedBy(requester: SearchRequester) {
  return and(eq(tenderCompetitors.accountId, requester.accountId), eq(tenderCompetitors.userId, requester.userId));
}

function ownCompetitor(requester: SearchRequester, cnpj: string) {
  return and(ownedBy(requester), eq(tenderCompetitors.cnpj, cnpj));
}

function toView(row: CompetitorRow): CompetitorView {
  return { cnpj: row.cnpj, nickname: row.nickname, notify: row.notify, createdAt: toBrasiliaIso(row.createdAt) };
}

/** Apelido com espaços simples e sem as pontas; vazio vira nulo (sem apelido). */
export function normalizeNickname(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

async function findOwn(db: TendersDb, requester: SearchRequester, cnpj: string): Promise<CompetitorRow | undefined> {
  const [row] = await db.select().from(tenderCompetitors).where(ownCompetitor(requester, cnpj)).limit(1);
  return row;
}

async function assertBelowLimit(db: TendersDb, requester: SearchRequester): Promise<void> {
  const [existing] = await db.select({ total: count() }).from(tenderCompetitors).where(ownedBy(requester));
  if ((existing?.total ?? 0) >= MAX_COMPETITORS_PER_USER) {
    throw new RequestInputError(`Você já acompanha ${MAX_COMPETITORS_PER_USER} concorrentes nesta conta. Remova algum para acompanhar outro.`);
  }
}

/** Os concorrentes da pessoa: com apelido primeiro, em ordem alfabética, e depois os sem apelido pelo CNPJ. */
export async function listCompetitors(db: TendersDb, requester: SearchRequester): Promise<CompetitorList> {
  const rows = await db
    .select()
    .from(tenderCompetitors)
    .where(ownedBy(requester))
    .orderBy(asc(tenderCompetitors.nickname), asc(tenderCompetitors.cnpj));
  return { items: rows.map(toView), limit: MAX_COMPETITORS_PER_USER };
}

/**
 * Passa a acompanhar o CNPJ (já conferido pela rota). Idempotente: quem já acompanha continua como está (apelido e
 * aviso não mudam) e `created` sai falso. O aviso começa valendo agora (`aviso_desde`, o padrão da coluna).
 */
export async function addCompetitor(
  db: TendersDb,
  requester: SearchRequester,
  input: { cnpj: string; nickname?: string | null },
): Promise<{ competitor: CompetitorView; created: boolean }> {
  const existing = await findOwn(db, requester, input.cnpj);
  if (existing) {
    return { competitor: toView(existing), created: false };
  }
  await assertBelowLimit(db, requester);
  const [inserted] = await db
    .insert(tenderCompetitors)
    .values({ accountId: requester.accountId, userId: requester.userId, cnpj: input.cnpj, nickname: normalizeNickname(input.nickname) })
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    return { competitor: toView(inserted), created: true };
  }
  // Outro pedido da mesma pessoa gravou o mesmo CNPJ no meio do caminho: vale o que ficou gravado.
  const current = await findOwn(db, requester, input.cnpj);
  if (!current) {
    throw new RequestInputError('Não foi possível salvar o concorrente agora. Tente de novo.', 409);
  }
  return { competitor: toView(current), created: false };
}

/**
 * Altera o apelido e/ou o aviso. Campo ausente mantém. Religar o aviso (de desligado para ligado) recomeça o
 * `aviso_desde`: o que foi publicado enquanto esteve desligado não gera aviso retroativo. Concorrente de outra pessoa ou
 * conta, ou que não existe: "não encontrado".
 */
export async function updateCompetitor(
  db: TendersDb,
  requester: SearchRequester,
  cnpj: string,
  changes: { nickname?: string | null; notify?: boolean },
): Promise<CompetitorView> {
  const row = await findOwn(db, requester, cnpj);
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  const rearmed = changes.notify === true && !row.notify;
  const set = {
    ...(changes.nickname !== undefined ? { nickname: normalizeNickname(changes.nickname) } : {}),
    ...(changes.notify !== undefined ? { notify: changes.notify } : {}),
    ...(rearmed ? { notifySince: sql`now()` } : {}),
  };
  if (Object.keys(set).length === 0) {
    return toView(row);
  }
  const [updated] = await db.update(tenderCompetitors).set(set).where(ownCompetitor(requester, cnpj)).returning();
  return toView(updated ?? row);
}

/** Deixa de acompanhar. Idempotente: quem não acompanha não dá erro. */
export async function removeCompetitor(db: TendersDb, requester: SearchRequester, cnpj: string): Promise<void> {
  await db.delete(tenderCompetitors).where(ownCompetitor(requester, cnpj));
}

/**
 * Os números dos concorrentes da pessoa, do armazém, numa consulta só: contratos, vigentes, publicados nos últimos 30 dias,
 * a última publicação e o nome. Um item por concorrente, na ordem da lista; o que não tem contrato nenhum vem zerado.
 * Sem cópia pronta do armazém, `ContractStoreUnavailableError` (503 na rota).
 */
export async function readCompetitorSummaries(
  deps: CompetitorSummaryDeps,
  requester: SearchRequester,
): Promise<{ items: CompetitorSummaryView[] }> {
  const rows = await deps.db
    .select({ cnpj: tenderCompetitors.cnpj })
    .from(tenderCompetitors)
    .where(ownedBy(requester))
    .orderBy(asc(tenderCompetitors.nickname), asc(tenderCompetitors.cnpj));
  const cnpjs = rows.map((row) => row.cnpj);
  if (cnpjs.length === 0) {
    return { items: [] };
  }
  const today = brasiliaDate(deps.now());
  const recentSince = addCalendarDays(today, -COMPETITOR_RECENT_DAYS);
  const found = await deps.contractStore.query((connection) => queryCompetitorSummaries(connection, cnpjs, today, recentSince));
  const byCnpj = new Map(found.map((summary) => [summary.cnpj, summary]));
  return {
    items: cnpjs.map((cnpj) => {
      const summary = byCnpj.get(cnpj);
      return {
        cnpj,
        name: summary?.name ?? null,
        total: summary?.total ?? 0,
        active: summary?.active ?? 0,
        last30Days: summary?.recent ?? 0,
        lastPublishedAt: toBrasiliaIso(summary?.lastPublishedAt),
      };
    }),
  };
}
