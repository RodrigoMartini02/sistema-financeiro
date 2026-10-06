import { and, asc, count, eq, sql } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderSavedSearches } from '../db/schema';
import type { SearchTermsMode } from '../domains';
import { toBrasiliaIso } from './dates';
import { criteriaOnlyFilters, searchNotices, type NoticeCriteria, type NoticeListItem } from './noticeSearch';
import { countOpenMatchesBySearch } from './savedSearchMatches';

// Buscas salvas do usuário na conta (escopo, seção 8.2). Pessoais: sempre
// filtradas por conta e por usuário. Criar ou alterar não gera notificação
// retroativa; o total de abertos que já batem aparece em `openCount`.

export const MAX_SAVED_SEARCHES_PER_USER = 50;
export const MAX_SAVED_SEARCH_NAME_LENGTH = 120;
export const PREVIEW_SIZE = 5;

const NOT_FOUND_MESSAGE = 'Busca salva não encontrada';

export interface SavedSearchInput extends NoticeCriteria {
  name: string;
  /** Ausente: ligado na criação, mantido na alteração. */
  notify?: boolean;
  /** Ausente: ativa na criação, mantida na alteração. */
  active?: boolean;
}

export interface SavedSearchView {
  id: number;
  name: string;
  terms: string[];
  termsMode: SearchTermsMode;
  excludedTerms: string[];
  states: string[];
  cityIbgeCodes: string[];
  agencyCnpjs: string[];
  modalities: number[];
  minValue: number | null;
  maxValue: number | null;
  includeWithoutValue: boolean;
  priceRegistration: boolean | null;
  notify: boolean;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  openCount: number;
}

type SavedSearchRow = typeof tenderSavedSearches.$inferSelect;

interface Requester {
  accountId: number;
  userId: number;
}

/** Critérios gravados de uma busca salva, no formato da busca da tela. */
export function savedSearchCriteria(row: SavedSearchRow): NoticeCriteria {
  return {
    terms: row.terms,
    termsMode: row.termsMode,
    excludedTerms: row.excludedTerms,
    states: row.states.map((state) => state.trim()),
    cityIbgeCodes: row.cityIbgeCodes,
    agencyCnpjs: row.agencyCnpjs,
    modalities: row.modalities,
    minValue: row.minValue,
    maxValue: row.maxValue,
    includeWithoutValue: row.includeWithoutValue,
    priceRegistration: row.onlyPriceRegistration,
  };
}

/** Regras do escopo além do formato: ao menos um critério além do nome, e mínimo ≤ máximo. */
export function assertValidCriteria(criteria: NoticeCriteria): void {
  const hasCriterion =
    criteria.terms.length > 0 ||
    criteria.excludedTerms.length > 0 ||
    criteria.states.length > 0 ||
    criteria.cityIbgeCodes.length > 0 ||
    criteria.agencyCnpjs.length > 0 ||
    criteria.modalities.length > 0 ||
    criteria.minValue !== null ||
    criteria.maxValue !== null ||
    criteria.priceRegistration !== null;
  if (!hasCriterion) {
    throw new RequestInputError('Informe ao menos um critério além do nome.');
  }
  if (criteria.minValue !== null && criteria.maxValue !== null && Number(criteria.minValue) > Number(criteria.maxValue)) {
    throw new RequestInputError('O valor mínimo não pode ser maior que o máximo.');
  }
}

function toView(row: SavedSearchRow, openCount: number): SavedSearchView {
  return {
    id: row.id,
    name: row.name,
    terms: row.terms,
    termsMode: row.termsMode,
    excludedTerms: row.excludedTerms,
    states: row.states.map((state) => state.trim()),
    cityIbgeCodes: row.cityIbgeCodes,
    agencyCnpjs: row.agencyCnpjs,
    modalities: row.modalities,
    minValue: row.minValue === null ? null : Number(row.minValue),
    maxValue: row.maxValue === null ? null : Number(row.maxValue),
    includeWithoutValue: row.includeWithoutValue,
    priceRegistration: row.onlyPriceRegistration,
    notify: row.notify,
    active: row.active,
    createdAt: toBrasiliaIso(row.createdAt),
    updatedAt: toBrasiliaIso(row.updatedAt),
    openCount,
  };
}

function storedValues(input: SavedSearchInput) {
  return {
    name: input.name,
    terms: input.terms,
    termsMode: input.termsMode,
    excludedTerms: input.excludedTerms,
    states: input.states,
    cityIbgeCodes: input.cityIbgeCodes,
    agencyCnpjs: input.agencyCnpjs,
    modalities: input.modalities,
    minValue: input.minValue,
    maxValue: input.maxValue,
    includeWithoutValue: input.includeWithoutValue,
    onlyPriceRegistration: input.priceRegistration,
    ...(input.notify !== undefined ? { notify: input.notify } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
}

function ownedBy(requester: Requester, searchId: number) {
  return and(
    eq(tenderSavedSearches.id, searchId),
    eq(tenderSavedSearches.accountId, requester.accountId),
    eq(tenderSavedSearches.userId, requester.userId),
  );
}

async function withOpenCount(db: TendersDb, requester: Requester, row: SavedSearchRow): Promise<SavedSearchView> {
  const counts = await countOpenMatchesBySearch(db, requester.accountId, requester.userId, [row.id]);
  return toView(row, counts.get(row.id) ?? 0);
}

async function assertBelowLimit(db: TendersDb, requester: Requester): Promise<void> {
  const [existing] = await db
    .select({ total: count() })
    .from(tenderSavedSearches)
    .where(and(eq(tenderSavedSearches.accountId, requester.accountId), eq(tenderSavedSearches.userId, requester.userId)));
  if ((existing?.total ?? 0) >= MAX_SAVED_SEARCHES_PER_USER) {
    throw new RequestInputError(`Você já tem ${MAX_SAVED_SEARCHES_PER_USER} buscas salvas nesta conta. Exclua alguma para criar outra.`);
  }
}

/** Busca salva do próprio usuário na conta; de outra pessoa ou conta, "não encontrada". */
export async function findOwnSavedSearch(db: TendersDb, requester: Requester, searchId: number): Promise<SavedSearchRow> {
  const [row] = await db.select().from(tenderSavedSearches).where(ownedBy(requester, searchId)).limit(1);
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return row;
}

export async function listSavedSearches(db: TendersDb, requester: Requester): Promise<SavedSearchView[]> {
  const rows = await db
    .select()
    .from(tenderSavedSearches)
    .where(and(eq(tenderSavedSearches.accountId, requester.accountId), eq(tenderSavedSearches.userId, requester.userId)))
    .orderBy(asc(tenderSavedSearches.name), asc(tenderSavedSearches.id));
  if (rows.length === 0) {
    return [];
  }
  const counts = await countOpenMatchesBySearch(db, requester.accountId, requester.userId);
  return rows.map((row) => toView(row, counts.get(row.id) ?? 0));
}

export async function createSavedSearch(db: TendersDb, requester: Requester, input: SavedSearchInput): Promise<SavedSearchView> {
  assertValidCriteria(input);
  await assertBelowLimit(db, requester);
  const [row] = await db
    .insert(tenderSavedSearches)
    .values({ ...storedValues(input), accountId: requester.accountId, userId: requester.userId })
    .returning();
  if (!row) {
    throw new Error('busca salva não criada');
  }
  return withOpenCount(db, requester, row);
}

export async function updateSavedSearch(
  db: TendersDb,
  requester: Requester,
  searchId: number,
  input: SavedSearchInput,
): Promise<SavedSearchView> {
  assertValidCriteria(input);
  const [row] = await db
    .update(tenderSavedSearches)
    .set({ ...storedValues(input), updatedAt: sql`now()` })
    .where(ownedBy(requester, searchId))
    .returning();
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return withOpenCount(db, requester, row);
}

export async function patchSavedSearch(
  db: TendersDb,
  requester: Requester,
  searchId: number,
  changes: { active?: boolean; notify?: boolean },
): Promise<SavedSearchView> {
  const [row] = await db
    .update(tenderSavedSearches)
    .set({
      ...(changes.active !== undefined ? { active: changes.active } : {}),
      ...(changes.notify !== undefined ? { notify: changes.notify } : {}),
      updatedAt: sql`now()`,
    })
    .where(ownedBy(requester, searchId))
    .returning();
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return withOpenCount(db, requester, row);
}

export async function deleteSavedSearch(db: TendersDb, requester: Requester, searchId: number): Promise<void> {
  const deleted = await db
    .delete(tenderSavedSearches)
    .where(ownedBy(requester, searchId))
    .returning({ id: tenderSavedSearches.id });
  if (deleted.length === 0) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
}

export async function duplicateSavedSearch(db: TendersDb, requester: Requester, searchId: number): Promise<SavedSearchView> {
  const original = await findOwnSavedSearch(db, requester, searchId);
  await assertBelowLimit(db, requester);
  const name = `Cópia de ${original.name}`.slice(0, MAX_SAVED_SEARCH_NAME_LENGTH);
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = original;
  const [row] = await db.insert(tenderSavedSearches).values({ ...copy, name }).returning();
  if (!row) {
    throw new Error('cópia da busca salva não criada');
  }
  return withOpenCount(db, requester, row);
}

/** Prévia do formulário: quantos abertos batem e os 5 primeiros por prazo. Não grava nada. */
export async function previewSavedSearch(
  db: TendersDb,
  requester: Requester,
  criteria: NoticeCriteria,
): Promise<{ count: number; items: NoticeListItem[] }> {
  assertValidCriteria(criteria);
  const result = await searchNotices(db, requester, criteriaOnlyFilters(criteria, PREVIEW_SIZE));
  return { count: result.total, items: result.items };
}
