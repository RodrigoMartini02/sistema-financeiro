import { z } from 'zod';
import {
  SEARCH_TERMS_MODES,
  type ParsedQuery,
  type SavedSearch,
  type SavedSearchBody,
  type SavedSearchCriteriaBody,
} from '../types';
import { TERMS_MODE_LABELS, formatCnpj, listWithMore, valueRangeLabel } from './labels';
import { decimalToReais, reaisToDecimal } from './money';
import type { SearchState } from './searchFilters';

// Formulário da busca salva (escopo, seção 9.4), com as mesmas regras da API
// (validators.ts e savedSearches.ts da Fase 2): nome de 1 a 120; ao menos um
// critério além do nome; mínimo ≤ máximo; até 30 termos e 30 exclusões, de 2
// a 80 caracteres; UF, município (IBGE), órgão (CNPJ) e modalidade válidos.

export const MAX_SAVED_SEARCH_NAME_LENGTH = 120;
export const MAX_TERMS = 30;
export const MIN_TERM_LENGTH = 2;
export const MAX_TERM_LENGTH = 80;
export const MAX_MUNICIPALITIES = 100;
export const MAX_AGENCIES = 50;
/** numeric(18,2): até 16 dígitos inteiros. */
const MAX_MONEY_VALUE = 1e16;

export const CRITERION_REQUIRED_MESSAGE = 'Informe ao menos um critério além do nome.';
export const VALUE_RANGE_MESSAGE = 'O valor mínimo não pode ser maior que o máximo.';

/** SRP no formulário: indiferente, só registro de preços ou sem registro de preços. */
export const PRICE_REGISTRATION_CHOICES = ['any', 'yes', 'no'] as const;
export type PriceRegistrationChoice = (typeof PRICE_REGISTRATION_CHOICES)[number];

const termSchema = z
  .string()
  .trim()
  .min(MIN_TERM_LENGTH, `Cada termo precisa ter de ${MIN_TERM_LENGTH} a ${MAX_TERM_LENGTH} caracteres`)
  .max(MAX_TERM_LENGTH, `Cada termo precisa ter de ${MIN_TERM_LENGTH} a ${MAX_TERM_LENGTH} caracteres`);

const moneySchema = z.number().min(0, 'Valor inválido').lt(MAX_MONEY_VALUE, 'Valor muito alto').nullable();

export const savedSearchFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Informe o nome da busca')
      .max(MAX_SAVED_SEARCH_NAME_LENGTH, `Nome com até ${MAX_SAVED_SEARCH_NAME_LENGTH} caracteres`),
    terms: z.array(termSchema).max(MAX_TERMS, `Até ${MAX_TERMS} termos`),
    termsMode: z.enum(SEARCH_TERMS_MODES),
    excludedTerms: z.array(termSchema).max(MAX_TERMS, `Até ${MAX_TERMS} termos de exclusão`),
    states: z.array(z.string().regex(/^[A-Z]{2}$/, 'UF inválida')),
    cityIbgeCodes: z
      .array(z.string().regex(/^\d{7}$/, 'Município inválido'))
      .max(MAX_MUNICIPALITIES, `Até ${MAX_MUNICIPALITIES} municípios`),
    agencyCnpjs: z.array(z.string().regex(/^\d{14}$/, 'CNPJ com 14 dígitos')).max(MAX_AGENCIES, `Até ${MAX_AGENCIES} órgãos`),
    modalities: z.array(z.number().int().positive('Modalidade inválida')),
    minValue: moneySchema,
    maxValue: moneySchema,
    includeWithoutValue: z.boolean(),
    priceRegistration: z.enum(PRICE_REGISTRATION_CHOICES),
  })
  .superRefine((values, context) => {
    if (!hasCriterion(values)) {
      context.addIssue({ code: 'custom', path: ['terms'], message: CRITERION_REQUIRED_MESSAGE });
    }
    if (values.minValue !== null && values.maxValue !== null && values.minValue > values.maxValue) {
      context.addIssue({ code: 'custom', path: ['maxValue'], message: VALUE_RANGE_MESSAGE });
    }
  });

export type SavedSearchFormValues = z.infer<typeof savedSearchFormSchema>;

type CriteriaValues = Omit<SavedSearchFormValues, 'name'>;

/** Ao menos um critério além do nome ("incluir sem valor" sozinho não conta, como na API). */
export function hasCriterion(values: CriteriaValues): boolean {
  return (
    values.terms.length > 0 ||
    values.excludedTerms.length > 0 ||
    values.states.length > 0 ||
    values.cityIbgeCodes.length > 0 ||
    values.agencyCnpjs.length > 0 ||
    values.modalities.length > 0 ||
    (values.minValue ?? 0) > 0 ||
    (values.maxValue ?? 0) > 0 ||
    values.priceRegistration !== 'any'
  );
}

export const EMPTY_SAVED_SEARCH_FORM: SavedSearchFormValues = {
  name: '',
  terms: [],
  termsMode: 'OU',
  excludedTerms: [],
  states: [],
  cityIbgeCodes: [],
  agencyCnpjs: [],
  modalities: [],
  minValue: null,
  maxValue: null,
  includeWithoutValue: false,
  priceRegistration: 'any',
};

function priceRegistrationOf(choice: PriceRegistrationChoice): boolean | null {
  return choice === 'any' ? null : choice === 'yes';
}

function choiceOf(priceRegistration: boolean | null): PriceRegistrationChoice {
  return priceRegistration === null ? 'any' : priceRegistration ? 'yes' : 'no';
}

/** Termo como a API grava: aparado e com espaços simples. */
export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ');
}

/** Critérios do formulário → corpo da API (prévia e gravação). */
export function formToCriteria(values: CriteriaValues): SavedSearchCriteriaBody {
  const hasRange = (values.minValue ?? 0) > 0 || (values.maxValue ?? 0) > 0;
  return {
    terms: values.terms.map(normalizeTerm),
    termsMode: values.termsMode,
    excludedTerms: values.excludedTerms.map(normalizeTerm),
    states: values.states,
    cityIbgeCodes: values.cityIbgeCodes,
    agencyCnpjs: values.agencyCnpjs,
    modalities: values.modalities,
    minValue: reaisToDecimal(values.minValue),
    maxValue: reaisToDecimal(values.maxValue),
    includeWithoutValue: hasRange && values.includeWithoutValue,
    priceRegistration: priceRegistrationOf(values.priceRegistration),
  };
}

/** Sem `notify` e `active`: na criação valem os padrões da API, na alteração os gravados (interruptores do card). */
export function formToBody(values: SavedSearchFormValues): SavedSearchBody {
  return { ...formToCriteria(values), name: values.name.trim() };
}

/**
 * Critérios para a prévia ao vivo, só quando a API os aceitaria (com ao menos
 * um critério e sem erro); senão, null e a prévia não é pedida.
 */
export function previewCriteria(values: SavedSearchFormValues): SavedSearchCriteriaBody | null {
  const parsed = savedSearchFormSchema.safeParse({ ...values, name: values.name.trim() || 'prévia' });
  return parsed.success ? formToCriteria(parsed.data) : null;
}

/** Busca salva gravada → formulário de edição. */
export function savedSearchToForm(search: SavedSearch): SavedSearchFormValues {
  return {
    name: search.name,
    terms: search.terms,
    termsMode: search.termsMode,
    excludedTerms: search.excludedTerms,
    states: search.states,
    cityIbgeCodes: search.cityIbgeCodes,
    agencyCnpjs: search.agencyCnpjs,
    modalities: search.modalities,
    minValue: search.minValue,
    maxValue: search.maxValue,
    includeWithoutValue: search.includeWithoutValue,
    priceRegistration: choiceOf(search.priceRegistration),
  };
}

/** O que a busca da tela tem e a busca salva não guarda. */
export const LEFT_OUT_LABELS = {
  published: 'período de publicação',
  closing: 'período de encerramento',
  closedNotices: 'editais encerrados',
  tracking: 'filtro de acompanhamento',
  favorites: 'só favoritos',
  number: 'número',
  purchaseYear: 'ano da compra',
} as const;

/**
 * "Salvar esta busca": os critérios que a API entendeu (`parsedQuery`) e os
 * filtros em comum; período, "só abertos" e acompanhamento ficam de fora, e
 * `leftOut` lista o que estava em uso para o formulário avisar.
 */
export function searchStateToForm(
  state: SearchState,
  parsedQuery: ParsedQuery,
): { values: SavedSearchFormValues; leftOut: string[] } {
  const values: SavedSearchFormValues = {
    ...EMPTY_SAVED_SEARCH_FORM,
    terms: parsedQuery.terms,
    termsMode: parsedQuery.termsMode,
    excludedTerms: parsedQuery.excludedTerms,
    states: state.states,
    cityIbgeCodes: state.municipalityCodes,
    agencyCnpjs: state.agencyCnpjs,
    modalities: state.modalities,
    minValue: decimalToReais(state.minValue),
    maxValue: decimalToReais(state.maxValue),
    includeWithoutValue: state.includeWithoutValue && (state.minValue !== null || state.maxValue !== null),
  };
  const leftOut: string[] = [];
  if (state.publishedFrom || state.publishedTo) leftOut.push(LEFT_OUT_LABELS.published);
  if (state.closingFrom || state.closingTo) leftOut.push(LEFT_OUT_LABELS.closing);
  if (!state.openOnly) leftOut.push(LEFT_OUT_LABELS.closedNotices);
  if (state.trackingStatuses.length > 0 || !state.hideDiscarded) leftOut.push(LEFT_OUT_LABELS.tracking);
  if (state.favoritesOnly) leftOut.push(LEFT_OUT_LABELS.favorites);
  if (state.number) leftOut.push(LEFT_OUT_LABELS.number);
  if (state.purchaseYear !== null) leftOut.push(LEFT_OUT_LABELS.purchaseYear);
  return { values, leftOut };
}

/** Nomes para o resumo; sem o nome, o código. */
export interface SummaryLookups {
  municipalityName?: (code: string) => string | undefined;
  modalityName?: (id: number) => string | undefined;
}

type SummarySource = Pick<
  SavedSearch,
  | 'terms'
  | 'termsMode'
  | 'excludedTerms'
  | 'states'
  | 'cityIbgeCodes'
  | 'agencyCnpjs'
  | 'modalities'
  | 'minValue'
  | 'maxValue'
  | 'includeWithoutValue'
  | 'priceRegistration'
>;

const quoted = (term: string) => `"${term}"`;

/** Resumo dos critérios para o card, uma linha por critério em uso. */
export function criteriaSummary(search: SummarySource, lookups: SummaryLookups = {}): string[] {
  const lines: string[] = [];
  if (search.terms.length > 0) {
    const mode = search.terms.length > 1 ? ` (${TERMS_MODE_LABELS[search.termsMode].toLowerCase()})` : '';
    lines.push(`Termos: ${listWithMore(search.terms.map(quoted), 5)}${mode}`);
  }
  if (search.excludedTerms.length > 0) {
    lines.push(`Exceto: ${listWithMore(search.excludedTerms.map(quoted), 5)}`);
  }
  if (search.states.length > 0) {
    lines.push(`UF: ${listWithMore(search.states, 8)}`);
  }
  if (search.cityIbgeCodes.length > 0) {
    const names = search.cityIbgeCodes.map((code) => lookups.municipalityName?.(code) ?? code);
    lines.push(`${search.cityIbgeCodes.length > 1 ? 'Municípios' : 'Município'}: ${listWithMore(names)}`);
  }
  if (search.agencyCnpjs.length > 0) {
    lines.push(`${search.agencyCnpjs.length > 1 ? 'Órgãos' : 'Órgão'}: ${listWithMore(search.agencyCnpjs.map(formatCnpj), 2)}`);
  }
  if (search.modalities.length > 0) {
    const names = search.modalities.map((id) => lookups.modalityName?.(id) ?? String(id));
    lines.push(`${search.modalities.length > 1 ? 'Modalidades' : 'Modalidade'}: ${listWithMore(names)}`);
  }
  const valueRange = valueRangeLabel(search.minValue, search.maxValue);
  if (valueRange) {
    lines.push(`Valor: ${valueRange}${search.includeWithoutValue ? ', inclui sem valor' : ''}`);
  }
  if (search.priceRegistration !== null) {
    lines.push(search.priceRegistration ? 'Só registro de preços (SRP)' : 'Sem registro de preços (SRP)');
  }
  return lines;
}
