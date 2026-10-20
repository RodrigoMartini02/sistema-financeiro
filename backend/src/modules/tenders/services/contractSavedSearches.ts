import { and, asc, count, eq, sql } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import { brasiliaDate } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import { phraseContractCriteria } from '../contractStore/criteria';
import { countActiveContracts } from '../contractStore/queries';
import { isContractStoreBusy } from '../contractStore/reader';
import { postgresSearchPhrases } from '../contractStore/textSearch';
import { tenderContractSavedSearches } from '../db/schema';
import type { SearchTermsMode } from '../domains';
import { contractCriteriaOnlyFilters, searchContracts, type ContractContext, type ContractCriteria, type ContractListItem } from './contractSearch';
import { toBrasiliaIso } from './dates';
import { MAX_SAVED_SEARCHES_PER_USER, MAX_SAVED_SEARCH_NAME_LENGTH, PREVIEW_SIZE } from './savedSearches';

// Buscas salvas de contratos da pessoa na conta (planos
// .plans/licitacoes-contratos-a-vencer.md, Parte B, e
// .plans/licitacoes-contratos-no-r2.md, Parte R2), no modelo das de editais:
// pessoais (sempre filtradas por conta e por pessoa), com o mesmo limite de 50,
// contado à parte, e sem notificação retroativa. O total de vigentes que já
// batem (`activeCount`) é contado no armazém ao salvar e na rotina diária, e a
// lista mostra o total gravado e a data da contagem (`countedAt`): listar não
// consulta o armazém.

const NOT_FOUND_MESSAGE = 'Busca salva não encontrada';

export interface ContractSavedSearchInput extends ContractCriteria {
  name: string;
  /** Ausente: ligado na criação, mantido na alteração. */
  notify?: boolean;
  /** Ausente: ativa na criação, mantida na alteração. */
  active?: boolean;
}

export interface ContractSavedSearchView {
  id: number;
  name: string;
  terms: string[];
  termsMode: SearchTermsMode;
  excludedTerms: string[];
  states: string[];
  cityIbgeCodes: string[];
  agencyCnpjs: string[];
  categories: number[];
  supplierCnpjs: string[];
  minValue: number | null;
  maxValue: number | null;
  includeWithoutValue: boolean;
  notify: boolean;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** Contratos vigentes que batem com a busca na última contagem; null = ainda não contado. */
  activeCount: number | null;
  /** Quando o total foi contado (ISO, Brasília); null = ainda não contado. */
  countedAt: string | null;
}

type ContractSavedSearchRow = typeof tenderContractSavedSearches.$inferSelect;

interface Requester {
  accountId: number;
  userId: number;
}

/** Critérios gravados de uma busca salva de contratos, no formato da busca da tela. */
export function contractSavedSearchCriteria(row: ContractSavedSearchRow): ContractCriteria {
  return {
    terms: row.terms,
    termsMode: row.termsMode,
    excludedTerms: row.excludedTerms,
    states: row.states.map((state) => state.trim()),
    cityIbgeCodes: row.cityIbgeCodes,
    agencyCnpjs: row.agencyCnpjs,
    categories: row.categories,
    supplierCnpjs: row.supplierCnpjs,
    minValue: row.minValue,
    maxValue: row.maxValue,
    includeWithoutValue: row.includeWithoutValue,
  };
}

/** Ao menos um critério além do nome, e mínimo ≤ máximo. */
export function assertValidContractCriteria(criteria: ContractCriteria): void {
  const hasCriterion =
    criteria.terms.length > 0 ||
    criteria.excludedTerms.length > 0 ||
    criteria.states.length > 0 ||
    criteria.cityIbgeCodes.length > 0 ||
    criteria.agencyCnpjs.length > 0 ||
    criteria.categories.length > 0 ||
    criteria.supplierCnpjs.length > 0 ||
    criteria.minValue !== null ||
    criteria.maxValue !== null;
  if (!hasCriterion) {
    throw new RequestInputError('Informe ao menos um critério além do nome.');
  }
  if (criteria.minValue !== null && criteria.maxValue !== null && Number(criteria.minValue) > Number(criteria.maxValue)) {
    throw new RequestInputError('O valor mínimo não pode ser maior que o máximo.');
  }
}

function toView(row: ContractSavedSearchRow): ContractSavedSearchView {
  return {
    id: row.id,
    name: row.name,
    ...contractSavedSearchCriteria(row),
    minValue: row.minValue === null ? null : Number(row.minValue),
    maxValue: row.maxValue === null ? null : Number(row.maxValue),
    notify: row.notify,
    active: row.active,
    createdAt: toBrasiliaIso(row.createdAt),
    updatedAt: toBrasiliaIso(row.updatedAt),
    activeCount: row.activeTotal,
    countedAt: toBrasiliaIso(row.activeTotalAt),
  };
}

function storedValues(input: ContractSavedSearchInput) {
  return {
    name: input.name,
    terms: input.terms,
    termsMode: input.termsMode,
    excludedTerms: input.excludedTerms,
    states: input.states,
    cityIbgeCodes: input.cityIbgeCodes,
    agencyCnpjs: input.agencyCnpjs,
    categories: input.categories,
    supplierCnpjs: input.supplierCnpjs,
    minValue: input.minValue,
    maxValue: input.maxValue,
    includeWithoutValue: input.includeWithoutValue,
    ...(input.notify !== undefined ? { notify: input.notify } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
}

function ownedBy(requester: Requester, searchId: number) {
  return and(
    eq(tenderContractSavedSearches.id, searchId),
    eq(tenderContractSavedSearches.accountId, requester.accountId),
    eq(tenderContractSavedSearches.userId, requester.userId),
  );
}

/** Vigentes que batem com os critérios agora, contados no armazém. */
export async function countActiveMatches(context: ContractContext, criteria: ContractCriteria): Promise<number> {
  const phrased = await phraseContractCriteria(postgresSearchPhrases(context.db), criteria);
  const today = brasiliaDate(context.now());
  return context.contractStore.query((connection) => countActiveContracts(connection, phrased, today));
}

/** Grava o total de vigentes da busca e a hora da contagem. */
export async function saveSavedSearchTotal(db: TendersDb, searchId: number, total: number): Promise<void> {
  await db
    .update(tenderContractSavedSearches)
    .set({ activeTotal: total, activeTotalAt: sql`now()` })
    .where(eq(tenderContractSavedSearches.id, searchId));
}

/**
 * Conta os vigentes da busca recém-salva e grava o total. O salvamento não
 * depende do armazém: com ele atualizando ou lento, a busca fica sem total até
 * a rotina diária contar.
 */
async function withFreshTotal(context: ContractContext, row: ContractSavedSearchRow): Promise<ContractSavedSearchRow> {
  let total: number;
  try {
    total = await countActiveMatches(context, contractSavedSearchCriteria(row));
  } catch (error) {
    if (isContractStoreBusy(error)) {
      console.warn('Tender contract saved search count postponed:', (error as Error).message);
      return row;
    }
    throw error;
  }
  await saveSavedSearchTotal(context.db, row.id, total);
  const [saved] = await context.db
    .select()
    .from(tenderContractSavedSearches)
    .where(eq(tenderContractSavedSearches.id, row.id))
    .limit(1);
  return saved ?? row;
}

async function assertBelowLimit(db: TendersDb, requester: Requester): Promise<void> {
  const [existing] = await db
    .select({ total: count() })
    .from(tenderContractSavedSearches)
    .where(and(eq(tenderContractSavedSearches.accountId, requester.accountId), eq(tenderContractSavedSearches.userId, requester.userId)));
  if ((existing?.total ?? 0) >= MAX_SAVED_SEARCHES_PER_USER) {
    throw new RequestInputError(
      `Você já tem ${MAX_SAVED_SEARCHES_PER_USER} buscas salvas de contratos nesta conta. Exclua alguma para criar outra.`,
    );
  }
}

/** Busca salva de contratos da própria pessoa na conta; de outra pessoa ou conta, "não encontrada". */
export async function findOwnContractSavedSearch(db: TendersDb, requester: Requester, searchId: number): Promise<ContractSavedSearchRow> {
  const [row] = await db.select().from(tenderContractSavedSearches).where(ownedBy(requester, searchId)).limit(1);
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return row;
}

export async function listContractSavedSearches(db: TendersDb, requester: Requester): Promise<ContractSavedSearchView[]> {
  const rows = await db
    .select()
    .from(tenderContractSavedSearches)
    .where(and(eq(tenderContractSavedSearches.accountId, requester.accountId), eq(tenderContractSavedSearches.userId, requester.userId)))
    .orderBy(asc(tenderContractSavedSearches.name), asc(tenderContractSavedSearches.id));
  return rows.map(toView);
}

export async function createContractSavedSearch(
  context: ContractContext,
  requester: Requester,
  input: ContractSavedSearchInput,
): Promise<ContractSavedSearchView> {
  assertValidContractCriteria(input);
  await assertBelowLimit(context.db, requester);
  const [row] = await context.db
    .insert(tenderContractSavedSearches)
    .values({ ...storedValues(input), accountId: requester.accountId, userId: requester.userId })
    .returning();
  if (!row) {
    throw new Error('busca salva de contratos não criada');
  }
  return toView(await withFreshTotal(context, row));
}

export async function updateContractSavedSearch(
  context: ContractContext,
  requester: Requester,
  searchId: number,
  input: ContractSavedSearchInput,
): Promise<ContractSavedSearchView> {
  assertValidContractCriteria(input);
  // Os critérios mudaram: o total antigo não vale mais, e fica sem total se a contagem nova não puder ser feita agora.
  const [row] = await context.db
    .update(tenderContractSavedSearches)
    .set({ ...storedValues(input), activeTotal: null, activeTotalAt: null, updatedAt: sql`now()` })
    .where(ownedBy(requester, searchId))
    .returning();
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return toView(await withFreshTotal(context, row));
}

export async function patchContractSavedSearch(
  db: TendersDb,
  requester: Requester,
  searchId: number,
  changes: { active?: boolean; notify?: boolean },
): Promise<ContractSavedSearchView> {
  const [row] = await db
    .update(tenderContractSavedSearches)
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
  return toView(row);
}

export async function deleteContractSavedSearch(db: TendersDb, requester: Requester, searchId: number): Promise<void> {
  const deleted = await db
    .delete(tenderContractSavedSearches)
    .where(ownedBy(requester, searchId))
    .returning({ id: tenderContractSavedSearches.id });
  if (deleted.length === 0) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
}

export async function duplicateContractSavedSearch(db: TendersDb, requester: Requester, searchId: number): Promise<ContractSavedSearchView> {
  const original = await findOwnContractSavedSearch(db, requester, searchId);
  await assertBelowLimit(db, requester);
  const name = `Cópia de ${original.name}`.slice(0, MAX_SAVED_SEARCH_NAME_LENGTH);
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = original;
  const [row] = await db.insert(tenderContractSavedSearches).values({ ...copy, name }).returning();
  if (!row) {
    throw new Error('cópia da busca salva de contratos não criada');
  }
  // Os critérios são os mesmos, então a cópia leva o total e a data da original.
  return toView(row);
}

/** Prévia do formulário: quantos vigentes batem e os 5 primeiros pelo vencimento. Não grava nada. */
export async function previewContractSavedSearch(
  context: ContractContext,
  requester: Requester,
  criteria: ContractCriteria,
): Promise<{ count: number; items: ContractListItem[] }> {
  assertValidContractCriteria(criteria);
  const result = await searchContracts(context, requester, contractCriteriaOnlyFilters(criteria, PREVIEW_SIZE));
  return { count: result.total, items: result.items };
}
