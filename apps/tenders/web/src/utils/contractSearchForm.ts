import { z } from 'zod';
import type { ContractSavedSearch, ContractSearchBody, ContractSearchCriteriaBody, ParsedQuery } from '../types';
import type { ContractSearchState } from './contractFilters';
import { formatCnpj, listWithMore } from './labels';
import { decimalToReais, reaisToDecimal } from './money';
import {
  CRITERION_REQUIRED_MESSAGE,
  VALUE_RANGE_MESSAGE,
  normalizeTerm,
  sharedCriteriaLines,
  sharedSavedSearchFields,
  valueRangeLine,
  type SummaryLookups,
} from './savedSearchForm';

// Formulário da busca salva de contratos (plano .plans/licitacoes-contratos-a-vencer.md,
// Parte B): os mesmos campos da de editais, trocando modalidade e SRP por
// categoria e CNPJ do fornecedor, com as mesmas regras da API
// (validators.ts e contractSavedSearches.ts).

export const MAX_SUPPLIERS = 50;

export const contractSearchFormSchema = z
  .object({
    ...sharedSavedSearchFields,
    categories: z.array(z.number().int().positive('Categoria inválida')),
    supplierCnpjs: z.array(z.string().regex(/^\d{14}$/, 'CNPJ com 14 dígitos')).max(MAX_SUPPLIERS, `Até ${MAX_SUPPLIERS} fornecedores`),
  })
  .superRefine((values, context) => {
    if (!hasContractCriterion(values)) {
      context.addIssue({ code: 'custom', path: ['terms'], message: CRITERION_REQUIRED_MESSAGE });
    }
    if (values.minValue !== null && values.maxValue !== null && values.minValue > values.maxValue) {
      context.addIssue({ code: 'custom', path: ['maxValue'], message: VALUE_RANGE_MESSAGE });
    }
  });

export type ContractSearchFormValues = z.infer<typeof contractSearchFormSchema>;

type CriteriaValues = Omit<ContractSearchFormValues, 'name'>;

/** Ao menos um critério além do nome ("incluir sem valor" sozinho não conta, como na API). */
export function hasContractCriterion(values: CriteriaValues): boolean {
  return (
    values.terms.length > 0 ||
    values.excludedTerms.length > 0 ||
    values.states.length > 0 ||
    values.cityIbgeCodes.length > 0 ||
    values.agencyCnpjs.length > 0 ||
    values.categories.length > 0 ||
    values.supplierCnpjs.length > 0 ||
    (values.minValue ?? 0) > 0 ||
    (values.maxValue ?? 0) > 0
  );
}

export const EMPTY_CONTRACT_SEARCH_FORM: ContractSearchFormValues = {
  name: '',
  terms: [],
  termsMode: 'OU',
  excludedTerms: [],
  states: [],
  cityIbgeCodes: [],
  agencyCnpjs: [],
  categories: [],
  supplierCnpjs: [],
  minValue: null,
  maxValue: null,
  includeWithoutValue: false,
};

/** Critérios do formulário → corpo da API (prévia e gravação). */
export function contractFormToCriteria(values: CriteriaValues): ContractSearchCriteriaBody {
  const hasRange = (values.minValue ?? 0) > 0 || (values.maxValue ?? 0) > 0;
  return {
    terms: values.terms.map(normalizeTerm),
    termsMode: values.termsMode,
    excludedTerms: values.excludedTerms.map(normalizeTerm),
    states: values.states,
    cityIbgeCodes: values.cityIbgeCodes,
    agencyCnpjs: values.agencyCnpjs,
    categories: values.categories,
    supplierCnpjs: values.supplierCnpjs,
    minValue: reaisToDecimal(values.minValue),
    maxValue: reaisToDecimal(values.maxValue),
    includeWithoutValue: hasRange && values.includeWithoutValue,
  };
}

/** Sem `notify` e `active`: na criação valem os padrões da API, na alteração os gravados (interruptores do card). */
export function contractFormToBody(values: ContractSearchFormValues): ContractSearchBody {
  return { ...contractFormToCriteria(values), name: values.name.trim() };
}

/** Critérios para a prévia ao vivo, só quando a API os aceitaria; senão, null e a prévia não é pedida. */
export function contractPreviewCriteria(values: ContractSearchFormValues): ContractSearchCriteriaBody | null {
  const parsed = contractSearchFormSchema.safeParse({ ...values, name: values.name.trim() || 'prévia' });
  return parsed.success ? contractFormToCriteria(parsed.data) : null;
}

/** Busca salva gravada → formulário de edição. */
export function contractSavedSearchToForm(search: ContractSavedSearch): ContractSearchFormValues {
  return {
    name: search.name,
    terms: search.terms,
    termsMode: search.termsMode,
    excludedTerms: search.excludedTerms,
    states: search.states,
    cityIbgeCodes: search.cityIbgeCodes,
    agencyCnpjs: search.agencyCnpjs,
    categories: search.categories,
    supplierCnpjs: search.supplierCnpjs,
    minValue: search.minValue,
    maxValue: search.maxValue,
    includeWithoutValue: search.includeWithoutValue,
  };
}

/** O que a busca da tela tem e a busca salva de contratos não guarda. */
export const CONTRACT_LEFT_OUT_LABELS = {
  published: 'período de publicação',
  expiry: 'período de vencimento',
  favorites: 'só favoritos',
  number: 'número',
  contractYear: 'ano do contrato',
} as const;

/**
 * "Salvar esta busca": os critérios que a API entendeu (`parsedQuery`) e os
 * filtros em comum; períodos, número, ano e "só favoritos" ficam de fora, e
 * `leftOut` lista o que estava em uso para o formulário avisar.
 */
export function contractStateToForm(
  state: ContractSearchState,
  parsedQuery: ParsedQuery,
): { values: ContractSearchFormValues; leftOut: string[] } {
  const values: ContractSearchFormValues = {
    ...EMPTY_CONTRACT_SEARCH_FORM,
    terms: parsedQuery.terms,
    termsMode: parsedQuery.termsMode,
    excludedTerms: parsedQuery.excludedTerms,
    states: state.states,
    cityIbgeCodes: state.municipalityCodes,
    agencyCnpjs: state.agencyCnpjs,
    categories: state.categories,
    supplierCnpjs: state.supplierCnpjs,
    minValue: decimalToReais(state.minValue),
    maxValue: decimalToReais(state.maxValue),
    includeWithoutValue: state.includeWithoutValue && (state.minValue !== null || state.maxValue !== null),
  };
  const leftOut: string[] = [];
  if (state.publishedFrom || state.publishedTo) leftOut.push(CONTRACT_LEFT_OUT_LABELS.published);
  if (state.expiryFrom || state.expiryTo) leftOut.push(CONTRACT_LEFT_OUT_LABELS.expiry);
  if (state.favoritesOnly) leftOut.push(CONTRACT_LEFT_OUT_LABELS.favorites);
  if (state.number) leftOut.push(CONTRACT_LEFT_OUT_LABELS.number);
  if (state.contractYear !== null) leftOut.push(CONTRACT_LEFT_OUT_LABELS.contractYear);
  return { values, leftOut };
}

/** Nomes para o resumo; sem o nome, o código. */
export interface ContractSummaryLookups extends SummaryLookups {
  categoryName?: (id: number) => string | undefined;
}

type SummarySource = Pick<
  ContractSavedSearch,
  | 'terms'
  | 'termsMode'
  | 'excludedTerms'
  | 'states'
  | 'cityIbgeCodes'
  | 'agencyCnpjs'
  | 'categories'
  | 'supplierCnpjs'
  | 'minValue'
  | 'maxValue'
  | 'includeWithoutValue'
>;

/** Resumo dos critérios para o card, uma linha por critério em uso. */
export function contractCriteriaSummary(search: SummarySource, lookups: ContractSummaryLookups = {}): string[] {
  const lines = sharedCriteriaLines(search, lookups);
  if (search.categories.length > 0) {
    const names = search.categories.map((id) => lookups.categoryName?.(id) ?? String(id));
    lines.push(`${search.categories.length > 1 ? 'Categorias' : 'Categoria'}: ${listWithMore(names)}`);
  }
  if (search.supplierCnpjs.length > 0) {
    lines.push(`${search.supplierCnpjs.length > 1 ? 'Fornecedores' : 'Fornecedor'}: ${listWithMore(search.supplierCnpjs.map(formatCnpj), 2)}`);
  }
  const valueLine = valueRangeLine(search);
  if (valueLine) {
    lines.push(valueLine);
  }
  return lines;
}
