import { and, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { formatCnpj } from '../cnpj';
import { COMPETITOR_CNPJS_PER_QUERY, queryContractsPublishedSince, type PublishedContract } from '../contractStore/competitorQueries';
import { phraseContractCriteria } from '../contractStore/criteria';
import { readExpiringByCriteria, readExpiringByKeys, type DayWindow, type ExpiringContract } from '../contractStore/queries';
import { isContractStoreBusy } from '../contractStore/reader';
import { postgresSearchPhrases } from '../contractStore/textSearch';
import { tenderCompetitors, tenderContractFavorites, tenderContractSavedSearches, tenderEnabledAccounts } from '../db/schema';
import type { TenderNotificationType } from '../domains';
import { contractSavedSearchCriteria, countActiveMatches, saveSavedSearchTotal } from '../services/contractSavedSearches';
import type { ContractContext } from '../services/contractSearch';
import type { TendersDb } from './database';
import { addCalendarDays } from './dates';
import type { CollectorLogger } from './logger';

// Avisos de contratos (planos .plans/licitacoes-contratos-a-vencer.md, Parte B,
// e .plans/licitacoes-contratos-no-r2.md, Parte R2). Os destinatários saem dos
// favoritos (as chaves dos contratos) e das buscas salvas (os critérios), no
// Postgres, e quem diz quais contratos vencem na janela é o armazém: o
// coletor cruza os dois e grava em licitacoes.notificacao. O índice único
// (conta, pessoa, tipo, contrato, referência) com ON CONFLICT DO NOTHING impede
// aviso repetido. A referência é o vencimento (AAAA-MM-DD): um vencimento novo
// gera os avisos de novo. Só contas com acesso valendo recebem
// (licitacoes.fn_conta_com_acesso).
//
// O link é o caminho a partir do início do app do módulo, com a chave do contrato
// codificada (/contratos/<chave>, a barra vira %2F).
//
// Também sai daqui o aviso de contrato novo dos concorrentes monitorados (plano
// .plans/licitacoes-4-concorrentes-monitorados.md): os destinatários saem de
// licitacoes.concorrente_monitorado, e quem diz quais contratos foram publicados é o
// armazém. A referência desse aviso é o dia da publicação.

const MESSAGE_LENGTH = 200;
const INSERT_BATCH_SIZE = 500;
/** Chaves por consulta ao armazém ou por busca no Postgres (limite de parâmetros). */
const KEYS_PER_QUERY = 1000;

/** Contexto dos avisos: o Postgres, o armazém (já com cópia pronta), o relógio e o log. */
export interface NotificationContext extends ContractContext {
  logger: CollectorLogger;
}

/**
 * Janelas dos avisos de vencimento. Nas buscas salvas, só os contratos que
 * entraram na janela nos últimos 7 dias (sem aviso retroativo em massa ao
 * criar a busca); nos favoritos, a janela inteira, com um aviso só por janela.
 */
const EXPIRY_WINDOWS: ReadonlyArray<{
  type: TenderNotificationType;
  savedSearch: DayWindow;
  favorite: DayWindow;
  savedSearchTitle: string;
  favoriteTitle: string;
}> = [
  {
    type: 'CONTRATO_VENCE_90D',
    savedSearch: { from: 84, to: 90 },
    favorite: { from: 31, to: 90 },
    savedSearchTitle: 'Contrato vence em até 90 dias: ',
    favoriteTitle: 'Contrato favorito vence em até 90 dias',
  },
  {
    type: 'CONTRATO_VENCE_30D',
    savedSearch: { from: 24, to: 30 },
    favorite: { from: 0, to: 30 },
    savedSearchTitle: 'Contrato vence em até 30 dias: ',
    favoriteTitle: 'Contrato favorito vence em até 30 dias',
  },
];

interface Recipient {
  accountId: number;
  userId: number;
}

interface FavoriteRecipient extends Recipient {
  contractKey: string;
}

interface NewContractNotification extends Recipient {
  type: TenderNotificationType;
  title: string;
  message: string;
  link: string;
  contractKey: string;
  /** O vencimento (avisos de vencimento) ou o dia da publicação (contrato novo de concorrente), em AAAA-MM-DD. */
  reference: string;
}

/** Contas com o módulo valendo: a mesma regra da trava de acesso. */
const accessibleAccount = alias(tenderEnabledAccounts, 'h');
const hasAccess = sql`licitacoes.fn_conta_com_acesso(${sql.identifier('h')})`;

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** Trecho do objeto para a mensagem, sem cortar um caractere ao meio. */
function excerptOf(contractObject: string): string {
  return Array.from(contractObject).slice(0, MESSAGE_LENGTH).join('');
}

/** AAAA-MM-DD → DD/MM/AAAA. */
function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

function notificationOf(recipient: Recipient, type: TenderNotificationType, title: string, contract: ExpiringContract): NewContractNotification {
  return {
    ...recipient,
    type,
    title,
    message: excerptOf(contract.contractObject),
    link: `/contratos/${encodeURIComponent(contract.controlNumber)}`,
    contractKey: contract.controlNumber,
    reference: contract.expiresOn,
  };
}

/**
 * Grava os avisos sem repetir (índice único com ON CONFLICT DO NOTHING) e
 * devolve quantos foram criados. SQL parametrizado, em lotes, com os valores
 * como listas (unnest): um aviso por posição.
 */
async function insertNotifications(db: TendersDb, notifications: readonly NewContractNotification[]): Promise<number> {
  let created = 0;
  for (const batch of chunksOf(notifications, INSERT_BATCH_SIZE)) {
    const result = await db.execute(sql`
      INSERT INTO licitacoes.notificacao (conta_id, usuario_id, tipo, titulo, mensagem, link, contrato_chave, referencia)
      SELECT * FROM unnest(
        ${sql.param(batch.map((item) => item.accountId))}::int[],
        ${sql.param(batch.map((item) => item.userId))}::int[],
        ${sql.param(batch.map((item) => item.type))}::text[],
        ${sql.param(batch.map((item) => item.title))}::text[],
        ${sql.param(batch.map((item) => item.message))}::text[],
        ${sql.param(batch.map((item) => item.link))}::text[],
        ${sql.param(batch.map((item) => item.contractKey))}::text[],
        ${sql.param(batch.map((item) => item.reference))}::text[])
      ON CONFLICT DO NOTHING`);
    created += result.rowCount ?? 0;
  }
  return created;
}

/** O contrato que mudou de vencimento na coleta: a chave, o vencimento novo e o objeto (para a mensagem). */
export interface ChangedContractExpiry {
  controlNumber: string;
  /** null: o contrato ficou sem vencimento, e não há o que avisar. */
  expiresOn: string | null;
  contractObject: string;
}

/**
 * CONTRATO_ALTERADO para quem favoritou, quando o vencimento muda. Referência:
 * o vencimento novo. Contrato que ficou sem vencimento não gera aviso: o título
 * e a referência são a data. O coletor chama depois de publicar o armazém, para
 * ninguém ser avisado de uma mudança que o app ainda não mostra.
 */
export async function notifyChangedContractExpiry(db: TendersDb, changes: readonly ChangedContractExpiry[]): Promise<number> {
  const dated = changes.flatMap((change) =>
    change.expiresOn === null ? [] : [{ controlNumber: change.controlNumber, expiresOn: change.expiresOn, contractObject: change.contractObject }],
  );
  let created = 0;
  for (const chunk of chunksOf(dated, KEYS_PER_QUERY)) {
    const recipients = await db
      .select({ accountId: tenderContractFavorites.accountId, userId: tenderContractFavorites.userId, contractKey: tenderContractFavorites.contractKey })
      .from(tenderContractFavorites)
      .innerJoin(accessibleAccount, eq(accessibleAccount.accountId, tenderContractFavorites.accountId))
      .where(
        and(
          inArray(
            tenderContractFavorites.contractKey,
            chunk.map((change) => change.controlNumber),
          ),
          hasAccess,
        ),
      );
    const changeOf = new Map(chunk.map((change) => [change.controlNumber, change]));
    const notifications = recipients.flatMap(({ contractKey, ...recipient }) => {
      const change = changeOf.get(contractKey);
      return change ? [notificationOf(recipient, 'CONTRATO_ALTERADO', `Vencimento de contrato favorito mudou para ${formatDay(change.expiresOn)}`, change)] : [];
    });
    created += await insertNotifications(db, notifications);
  }
  return created;
}

/** Todos os favoritos de contas com acesso. */
async function readFavoriteRecipients(db: TendersDb): Promise<FavoriteRecipient[]> {
  return db
    .select({ accountId: tenderContractFavorites.accountId, userId: tenderContractFavorites.userId, contractKey: tenderContractFavorites.contractKey })
    .from(tenderContractFavorites)
    .innerJoin(accessibleAccount, eq(accessibleAccount.accountId, tenderContractFavorites.accountId))
    .where(hasAccess);
}

/** Avisos dos favoritos que vencem na janela de cada tipo: os contratos vêm do armazém, em lotes de chaves. */
async function notifyFavorites(context: NotificationContext, today: string): Promise<number> {
  const recipients = await readFavoriteRecipients(context.db);
  if (recipients.length === 0) {
    return 0;
  }
  const keys = [...new Set(recipients.map((recipient) => recipient.contractKey))];
  let created = 0;
  for (const window of EXPIRY_WINDOWS) {
    const expiring = new Map<string, ExpiringContract>();
    for (const chunk of chunksOf(keys, KEYS_PER_QUERY)) {
      const found = await context.contractStore.query((connection) => readExpiringByKeys(connection, today, window.favorite, chunk));
      for (const contract of found) {
        expiring.set(contract.controlNumber, contract);
      }
    }
    const notifications = recipients.flatMap(({ contractKey, ...recipient }) => {
      const contract = expiring.get(contractKey);
      return contract ? [notificationOf(recipient, window.type, window.favoriteTitle, contract)] : [];
    });
    created += await insertNotifications(context.db, notifications);
  }
  return created;
}

interface SavedSearchRecipient extends Recipient {
  id: number;
  name: string;
  row: typeof tenderContractSavedSearches.$inferSelect;
}

/** Buscas salvas de contas com acesso; `notifiableOnly` deixa só as ativas com "Notificar". */
async function readSavedSearches(db: TendersDb, notifiableOnly: boolean): Promise<SavedSearchRecipient[]> {
  const rows = await db
    .select({ search: tenderContractSavedSearches })
    .from(tenderContractSavedSearches)
    .innerJoin(accessibleAccount, eq(accessibleAccount.accountId, tenderContractSavedSearches.accountId))
    .where(
      and(
        hasAccess,
        notifiableOnly ? and(eq(tenderContractSavedSearches.active, true), eq(tenderContractSavedSearches.notify, true)) : undefined,
      ),
    );
  return rows.map(({ search }) => ({ id: search.id, accountId: search.accountId, userId: search.userId, name: search.name, row: search }));
}

/** Avisos das buscas salvas ativas com Notificar: os vigentes que entraram nas janelas e batem com os critérios. */
async function notifySavedSearches(context: NotificationContext, today: string): Promise<number> {
  const searches = await readSavedSearches(context.db, true);
  const phrases = postgresSearchPhrases(context.db);
  let created = 0;
  for (const search of searches) {
    const phrased = await phraseContractCriteria(phrases, contractSavedSearchCriteria(search.row));
    for (const window of EXPIRY_WINDOWS) {
      const found = await context.contractStore.query((connection) => readExpiringByCriteria(connection, today, window.savedSearch, phrased));
      const title = `${window.savedSearchTitle}${search.name}`;
      const recipient = { accountId: search.accountId, userId: search.userId };
      created += await insertNotifications(
        context.db,
        found.map((contract) => notificationOf(recipient, window.type, title, contract)),
      );
    }
  }
  return created;
}

/**
 * CONTRATO_VENCE_90D e CONTRATO_VENCE_30D do dia `today` (AAAA-MM-DD, Brasília):
 * primeiro os favoritos, depois as buscas salvas ativas com Notificar. Um
 * contrato que já recebeu o aviso pelo favorito não recebe de novo pela busca
 * (o índice único). Quem decide se o contrato bate com uma busca é
 * contractStore/criteria.ts, a mesma regra da tela.
 */
export async function notifyContractExpirations(context: NotificationContext, today: string): Promise<number> {
  return (await notifyFavorites(context, today)) + (await notifySavedSearches(context, today));
}

/** Só contratos publicados nos últimos 7 dias geram aviso de concorrente: sem aviso retroativo em massa. */
const COMPETITOR_WINDOW_DAYS = 7;

interface CompetitorRecipient extends Recipient {
  cnpj: string;
  nickname: string | null;
  /** O primeiro dia (AAAA-MM-DD, Brasília) em que o aviso vale: o dia do `aviso_desde`. */
  noticeFrom: string;
}

/** O que a etapa fez com os concorrentes, para `details.competitors` da execução. */
export interface CompetitorNoticeSummary {
  /** Concorrentes com aviso ligado, de contas com acesso (uma linha por pessoa e CNPJ). */
  monitored: number;
  /** CNPJs distintos consultados no armazém. */
  cnpjs: number;
  /** Contratos achados na janela, antes de separar por pessoa. */
  contractsFound: number;
  /** Avisos criados (os repetidos não contam). */
  created: number;
}

/** Concorrentes de contas com acesso e com o aviso ligado; o dia do `aviso_desde` já em Brasília. */
async function readCompetitorRecipients(db: TendersDb): Promise<CompetitorRecipient[]> {
  return db
    .select({
      accountId: tenderCompetitors.accountId,
      userId: tenderCompetitors.userId,
      cnpj: tenderCompetitors.cnpj,
      nickname: tenderCompetitors.nickname,
      noticeFrom: sql<string>`to_char(${tenderCompetitors.notifySince} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    })
    .from(tenderCompetitors)
    .innerJoin(accessibleAccount, eq(accessibleAccount.accountId, tenderCompetitors.accountId))
    .where(and(eq(tenderCompetitors.notify, true), hasAccess));
}

function competitorNotificationOf(recipient: CompetitorRecipient, contract: PublishedContract): NewContractNotification {
  // Apelido ou nome em branco valem como ausentes (a API grava o apelido em branco como nulo, mas o banco aceita o resto).
  const who = recipient.nickname?.trim() || contract.supplierName?.trim() || formatCnpj(recipient.cnpj);
  return {
    accountId: recipient.accountId,
    userId: recipient.userId,
    type: 'CONTRATO_NOVO_CONCORRENTE',
    title: `Novo contrato de ${who}`,
    message: excerptOf(contract.contractObject),
    link: `/contratos/${encodeURIComponent(contract.controlNumber)}`,
    contractKey: contract.controlNumber,
    reference: contract.publishedOn,
  };
}

/**
 * CONTRATO_NOVO_CONCORRENTE do dia `today` (AAAA-MM-DD, Brasília): um aviso por contrato e por pessoa que monitora o
 * fornecedor com o aviso ligado, para os contratos publicados nos últimos 7 dias e no dia do `aviso_desde` ou depois
 * (religar o aviso recomeça o `aviso_desde`, então nada retroativo). Os CNPJs distintos de todas as contas vão ao armazém
 * em lotes; o índice único (conta, pessoa, tipo, contrato, referência) com ON CONFLICT DO NOTHING impede repetir numa
 * segunda execução. Só contas com acesso valendo recebem.
 */
export async function notifyCompetitorContracts(context: NotificationContext, today: string): Promise<CompetitorNoticeSummary> {
  const recipients = await readCompetitorRecipients(context.db);
  const cnpjs = [...new Set(recipients.map((recipient) => recipient.cnpj))];
  const summary: CompetitorNoticeSummary = { monitored: recipients.length, cnpjs: cnpjs.length, contractsFound: 0, created: 0 };
  if (recipients.length === 0) {
    return summary;
  }
  const windowStart = addCalendarDays(today, -COMPETITOR_WINDOW_DAYS);
  const firstDayOf = (recipient: CompetitorRecipient) => (recipient.noticeFrom > windowStart ? recipient.noticeFrom : windowStart);
  // O armazém devolve de uma vez o que a pessoa mais antiga precisa; cada pessoa recebe só o que vale para ela.
  const since = recipients.map(firstDayOf).reduce((earliest, day) => (day < earliest ? day : earliest));
  const recipientsByCnpj = new Map<string, CompetitorRecipient[]>();
  for (const recipient of recipients) {
    recipientsByCnpj.set(recipient.cnpj, [...(recipientsByCnpj.get(recipient.cnpj) ?? []), recipient]);
  }
  for (const chunk of chunksOf(cnpjs, COMPETITOR_CNPJS_PER_QUERY)) {
    const contracts = await context.contractStore.query((connection) => queryContractsPublishedSince(connection, chunk, since));
    summary.contractsFound += contracts.length;
    const notifications = contracts.flatMap((contract) =>
      (recipientsByCnpj.get(contract.supplierCnpj) ?? []).flatMap((recipient) =>
        contract.publishedOn >= firstDayOf(recipient) ? [competitorNotificationOf(recipient, contract)] : [],
      ),
    );
    summary.created += await insertNotifications(context.db, notifications);
  }
  return summary;
}

export interface SavedSearchTotalsSummary {
  searches: number;
  updated: number;
  /** Buscas que o armazém não pôde contar agora (consulta lenta demais): ficam com o total anterior. */
  failed: number;
}

/**
 * Atualiza o total "vigentes agora" de todas as buscas salvas de contas com
 * acesso, com a data da contagem (as inativas também: a lista mostra o total
 * delas). Busca que o armazém não consegue contar agora fica com o total
 * anterior e conta em `failed`.
 */
export async function updateSavedSearchTotals(context: NotificationContext): Promise<SavedSearchTotalsSummary> {
  const searches = await readSavedSearches(context.db, false);
  const summary: SavedSearchTotalsSummary = { searches: searches.length, updated: 0, failed: 0 };
  for (const search of searches) {
    try {
      const total = await countActiveMatches(context, contractSavedSearchCriteria(search.row));
      await saveSavedSearchTotal(context.db, search.id, total);
      summary.updated += 1;
    } catch (error) {
      if (!isContractStoreBusy(error)) {
        throw error;
      }
      summary.failed += 1;
      context.logger.warn('Total da busca salva de contratos não atualizado', { searchId: search.id, error });
    }
  }
  return summary;
}
