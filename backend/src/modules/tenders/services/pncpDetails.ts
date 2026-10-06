import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { PncpClient, PncpRequestError, type PncpDetailList } from '../collector/pncpClient';
import { tenderDetailCache, tenderNotices } from '../db/schema';
import type { DetailCacheType } from '../domains';
import { toBrasiliaIso } from './dates';

// Itens e arquivos de um edital, buscados na API principal do PNCP quando a
// tela de detalhe pede, com cache de 24 h em licitacoes.cache_detalhe (global:
// dado público). Na hora do pedido não há espera longa: se o PNCP falhar, volta
// a cópia guardada (marcada como desatualizada) ou um erro claro.

export const PNCP_API_BASE_URL = 'https://pncp.gov.br/api/pncp';
export const DETAIL_PAGE_SIZE = 500;
/** Páginas por pedido da tela (até 1.000 itens); acima disso, `hasMore` e o link do PNCP. */
export const MAX_DETAIL_PAGES = 2;
const CACHE_HOURS = 24;

const PNCP_UNAVAILABLE = 'O PNCP não respondeu agora. Tente de novo em instantes.';

/** O que a API usa do cliente do PNCP (os testes trocam por um simulado). */
export type PncpDetailSource = Pick<PncpClient, 'fetchDetailList'>;

/** Cliente para o pedido da tela: 10 s por tentativa, uma repetição curta e sem pausa entre pedidos. */
export function createPncpDetailSource(): PncpDetailSource {
  return new PncpClient({
    baseUrl: PNCP_API_BASE_URL,
    pageSize: DETAIL_PAGE_SIZE,
    requestIntervalMs: 0,
    timeoutMs: 10_000,
    maxAttempts: 2,
    rateLimitBackoffMs: 1_000,
    maxRetryDelayMs: 2_000,
  });
}

const LIST_BY_CACHE_TYPE: Record<DetailCacheType, PncpDetailList> = { ITENS: 'itens', ARQUIVOS: 'arquivos' };

interface CachedDetail {
  records: unknown[];
  hasMore: boolean;
}

const cachedDetailSchema = z.object({ records: z.array(z.unknown()), hasMore: z.boolean() });

const flexibleNumber = z
  .union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/).transform(Number)])
  .nullish()
  .transform((value) => value ?? null);
const optionalText = z
  .string()
  .nullish()
  .transform((value) => (value?.trim() ? value.trim() : null));

const pncpItemSchema = z.object({
  numeroItem: z.number().int(),
  descricao: optionalText,
  materialOuServicoNome: optionalText,
  quantidade: flexibleNumber,
  unidadeMedida: optionalText,
  valorUnitarioEstimado: flexibleNumber,
  valorTotal: flexibleNumber,
  orcamentoSigiloso: z.boolean().nullish(),
  situacaoCompraItemNome: optionalText,
  criterioJulgamentoNome: optionalText,
});

const pncpFileSchema = z.object({
  sequencialDocumento: z.number().int(),
  titulo: optionalText,
  tipoDocumentoNome: optionalText,
  url: z.string().trim().min(1),
  dataPublicacaoPncp: optionalText,
  statusAtivo: z.boolean().nullish(),
});

export interface NoticeItem {
  number: number;
  description: string | null;
  kind: string | null;
  quantity: number | null;
  unit: string | null;
  estimatedUnitValue: number | null;
  estimatedTotalValue: number | null;
  confidentialBudget: boolean;
  situationName: string | null;
  judgmentCriterionName: string | null;
}

export interface NoticeFile {
  sequence: number;
  title: string | null;
  typeName: string | null;
  url: string;
  publishedAt: string | null;
}

export interface NoticeDetailList<T> {
  records: T[];
  /** O PNCP ainda não tem a compra (ex.: publicada há poucos minutos). */
  foundOnPncp: boolean;
  /** Há mais registros do que a tela traz; o resto fica no link do PNCP. */
  hasMore: boolean;
  /** Cópia guardada usada porque o PNCP não respondeu. */
  stale: boolean;
  fetchedAt: string | null;
  pncpLink: string | null;
}

function mapItems(records: unknown[]): NoticeItem[] {
  return records.flatMap((record) => {
    const parsed = pncpItemSchema.safeParse(record);
    if (!parsed.success) {
      return [];
    }
    const item = parsed.data;
    return [
      {
        number: item.numeroItem,
        description: item.descricao,
        kind: item.materialOuServicoNome,
        quantity: item.quantidade,
        unit: item.unidadeMedida,
        estimatedUnitValue: item.valorUnitarioEstimado,
        estimatedTotalValue: item.valorTotal,
        confidentialBudget: item.orcamentoSigiloso === true,
        situationName: item.situacaoCompraItemNome,
        judgmentCriterionName: item.criterioJulgamentoNome,
      },
    ];
  });
}

function mapFiles(records: unknown[]): NoticeFile[] {
  return records.flatMap((record) => {
    const parsed = pncpFileSchema.safeParse(record);
    if (!parsed.success || parsed.data.statusAtivo === false) {
      return [];
    }
    const file = parsed.data;
    return [
      {
        sequence: file.sequencialDocumento,
        title: file.titulo,
        typeName: file.tipoDocumentoNome,
        url: file.url,
        publishedAt: toBrasiliaIso(file.dataPublicacaoPncp),
      },
    ];
  });
}

/** Todas as páginas até o limite: página cheia (500) indica que pode haver mais. */
async function fetchFromPncp(
  source: PncpDetailSource,
  list: PncpDetailList,
  purchase: { agencyCnpj: string; year: number; sequence: number },
): Promise<CachedDetail | null> {
  const records: unknown[] = [];
  for (let page = 1; page <= MAX_DETAIL_PAGES; page += 1) {
    const pageRecords = await source.fetchDetailList(list, purchase, page);
    if (pageRecords === null) {
      return page === 1 ? null : { records, hasMore: false };
    }
    records.push(...pageRecords);
    if (pageRecords.length < DETAIL_PAGE_SIZE) {
      return { records, hasMore: false };
    }
  }
  return { records, hasMore: true };
}

async function readNoticeDetailList(
  db: TendersDb,
  source: PncpDetailSource,
  noticeId: number,
  type: DetailCacheType,
): Promise<NoticeDetailList<unknown>> {
  const [notice] = await db
    .select({
      agencyCnpj: tenderNotices.agencyCnpj,
      year: tenderNotices.purchaseYear,
      sequence: tenderNotices.purchaseSequence,
      pncpLink: tenderNotices.pncpLink,
    })
    .from(tenderNotices)
    .where(eq(tenderNotices.id, noticeId))
    .limit(1);
  if (!notice) {
    throw new RequestInputError('Edital não encontrado', 404);
  }

  const empty = { records: [], foundOnPncp: false, hasMore: false, stale: false, fetchedAt: null, pncpLink: notice.pncpLink };
  if (!notice.agencyCnpj || notice.year === null || notice.sequence === null) {
    return empty;
  }

  const cacheKey = and(eq(tenderDetailCache.noticeId, noticeId), eq(tenderDetailCache.type, type));
  const [cached] = await db
    .select({
      content: tenderDetailCache.content,
      fetchedAt: tenderDetailCache.fetchedAt,
      fresh: sql<boolean>`${tenderDetailCache.fetchedAt} > now() - make_interval(hours => ${CACHE_HOURS})`,
    })
    .from(tenderDetailCache)
    .where(cacheKey)
    .limit(1);
  const cachedContent = cached ? cachedDetailSchema.safeParse(cached.content) : null;
  const fromCache = (stale: boolean): NoticeDetailList<unknown> | null =>
    cached && cachedContent?.success
      ? {
          records: cachedContent.data.records,
          foundOnPncp: true,
          hasMore: cachedContent.data.hasMore,
          stale,
          fetchedAt: toBrasiliaIso(cached.fetchedAt),
          pncpLink: notice.pncpLink,
        }
      : null;

  if (cached?.fresh) {
    const fresh = fromCache(false);
    if (fresh) {
      return fresh;
    }
  }

  let fetched: CachedDetail | null;
  try {
    fetched = await fetchFromPncp(source, LIST_BY_CACHE_TYPE[type], {
      agencyCnpj: notice.agencyCnpj,
      year: notice.year,
      sequence: notice.sequence,
    });
  } catch (error) {
    if (!(error instanceof PncpRequestError)) {
      throw error;
    }
    console.warn('PNCP detail request failed:', { noticeId, type, error: error.message });
    const stale = fromCache(true);
    if (stale) {
      return stale;
    }
    throw new RequestInputError(PNCP_UNAVAILABLE, 503);
  }

  // Compra que o PNCP ainda não conhece: não guarda, para aparecer assim que ele tiver.
  if (fetched === null) {
    return empty;
  }

  const [stored] = await db
    .insert(tenderDetailCache)
    .values({ noticeId, type, content: fetched })
    .onConflictDoUpdate({
      target: [tenderDetailCache.noticeId, tenderDetailCache.type],
      set: { content: fetched, fetchedAt: sql`now()` },
    })
    .returning({ fetchedAt: tenderDetailCache.fetchedAt });
  return {
    records: fetched.records,
    foundOnPncp: true,
    hasMore: fetched.hasMore,
    stale: false,
    fetchedAt: toBrasiliaIso(stored?.fetchedAt),
    pncpLink: notice.pncpLink,
  };
}

export async function getNoticeItems(db: TendersDb, source: PncpDetailSource, noticeId: number): Promise<NoticeDetailList<NoticeItem>> {
  const detail = await readNoticeDetailList(db, source, noticeId, 'ITENS');
  return { ...detail, records: mapItems(detail.records) };
}

export async function getNoticeFiles(db: TendersDb, source: PncpDetailSource, noticeId: number): Promise<NoticeDetailList<NoticeFile>> {
  const detail = await readNoticeDetailList(db, source, noticeId, 'ARQUIVOS');
  return { ...detail, records: mapFiles(detail.records) };
}
