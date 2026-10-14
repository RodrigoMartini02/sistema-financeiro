import { and, asc, count, eq, sql } from 'drizzle-orm';
import { RequestInputError } from '../../../utils/requestInput';
import type { TendersDb } from '../collector/database';
import { tenderContractSavedSearches } from '../db/schema';
import type { SearchTermsMode } from '../domains';
import { contractCriteriaOnlyFilters, searchContracts, type ContractCriteria, type ContractListItem } from './contractSearch';
import { toBrasiliaIso } from './dates';
import { MAX_SAVED_SEARCHES_PER_USER, MAX_SAVED_SEARCH_NAME_LENGTH, PREVIEW_SIZE } from './savedSearches';

// Buscas salvas de contratos da pessoa na conta (plano
// .plans/licitacoes-contratos-a-vencer.md, Parte B), no modelo das de editais:
// pessoais (sempre filtradas por conta e por pessoa), com o mesmo limite de 50,
// contado à parte, e sem notificação retroativa. O total de vigentes que já
// batem aparece em `activeCount`.

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
  /** Contratos vigentes que batem com a busca agora. */
  activeCount: number;
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

function toView(row: ContractSavedSearchRow, activeCount: number): ContractSavedSearchView {
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
    activeCount,
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

// Total de vigentes por busca. SQL escrito à mão pelo mesmo motivo de
// savedSearchMatches.ts: a consulta de texto de cada busca é calculada uma vez
// (CTE materializada), e a condição solta `busca_tsv @@ consulta` existe só para
// o banco usar o índice GIN. Quem decide se o contrato bate é sempre
// licitacoes.fn_contrato_atende_criterios + licitacoes.fn_contrato_vigente.
const MATCHES_SEARCH = sql`
  licitacoes.fn_contrato_atende_criterios(
    c, bs.consulta, bs.exclusao, bs.ufs, bs.municipios, bs.orgaos, bs.categorias, bs.fornecedores,
    bs.valor_min, bs.valor_max, bs.incluir_sem_valor)
  AND licitacoes.fn_contrato_vigente(c)`;

/** Contratos vigentes que batem com cada busca da pessoa, por id da busca (inclui as inativas). */
export async function countActiveMatchesBySearch(db: TendersDb, requester: Requester, searchIds?: number[]): Promise<Map<number, number>> {
  const onlyIds = searchIds ? sql`AND b.id = ANY (${sql.param(searchIds)}::bigint[])` : sql``;
  const result = await db.execute<{ id: string; active_count: string }>(sql`
    WITH buscas AS MATERIALIZED (
      SELECT b.id, b.ufs, b.municipios_ibge::text[] AS municipios, b.orgaos_cnpj::text[] AS orgaos, b.categorias,
             b.fornecedores_cnpj::text[] AS fornecedores, b.valor_min, b.valor_max, b.incluir_sem_valor,
             licitacoes.fn_tsquery_termos(b.termos, b.modo_termos) AS consulta,
             licitacoes.fn_tsquery_termos(b.termos_exclusao, 'OU') AS exclusao
        FROM licitacoes.busca_salva_contrato b
       WHERE b.conta_id = ${requester.accountId} AND b.usuario_id = ${requester.userId} ${onlyIds})
    SELECT bs.id,
           (SELECT count(*) FROM licitacoes.contrato c
             WHERE bs.consulta IS NOT NULL AND c.busca_tsv @@ bs.consulta AND ${MATCHES_SEARCH})
         + (SELECT count(*) FROM licitacoes.contrato c
             WHERE bs.consulta IS NULL AND ${MATCHES_SEARCH}) AS active_count
      FROM buscas bs`);
  return new Map(result.rows.map((row) => [Number(row.id), Number(row.active_count)]));
}

async function withActiveCount(db: TendersDb, requester: Requester, row: ContractSavedSearchRow): Promise<ContractSavedSearchView> {
  const counts = await countActiveMatchesBySearch(db, requester, [row.id]);
  return toView(row, counts.get(row.id) ?? 0);
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
  if (rows.length === 0) {
    return [];
  }
  const counts = await countActiveMatchesBySearch(db, requester);
  return rows.map((row) => toView(row, counts.get(row.id) ?? 0));
}

export async function createContractSavedSearch(
  db: TendersDb,
  requester: Requester,
  input: ContractSavedSearchInput,
): Promise<ContractSavedSearchView> {
  assertValidContractCriteria(input);
  await assertBelowLimit(db, requester);
  const [row] = await db
    .insert(tenderContractSavedSearches)
    .values({ ...storedValues(input), accountId: requester.accountId, userId: requester.userId })
    .returning();
  if (!row) {
    throw new Error('busca salva de contratos não criada');
  }
  return withActiveCount(db, requester, row);
}

export async function updateContractSavedSearch(
  db: TendersDb,
  requester: Requester,
  searchId: number,
  input: ContractSavedSearchInput,
): Promise<ContractSavedSearchView> {
  assertValidContractCriteria(input);
  const [row] = await db
    .update(tenderContractSavedSearches)
    .set({ ...storedValues(input), updatedAt: sql`now()` })
    .where(ownedBy(requester, searchId))
    .returning();
  if (!row) {
    throw new RequestInputError(NOT_FOUND_MESSAGE, 404);
  }
  return withActiveCount(db, requester, row);
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
  return withActiveCount(db, requester, row);
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
  return withActiveCount(db, requester, row);
}

/** Prévia do formulário: quantos vigentes batem e os 5 primeiros pelo vencimento. Não grava nada. */
export async function previewContractSavedSearch(
  db: TendersDb,
  requester: Requester,
  criteria: ContractCriteria,
): Promise<{ count: number; items: ContractListItem[] }> {
  assertValidContractCriteria(criteria);
  const result = await searchContracts(db, requester, contractCriteriaOnlyFilters(criteria, PREVIEW_SIZE));
  return { count: result.total, items: result.items };
}
