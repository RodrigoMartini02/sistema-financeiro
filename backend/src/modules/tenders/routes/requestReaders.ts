import { RequestInputError } from '../../../utils/requestInput';
import type { NoticeSort, SearchTermsMode, TenderNotificationType, TrackingFilter } from '../domains';
import { numberGroupsOf, type NoticeCriteria, type NoticeSearchFilters } from '../services/noticeSearch';
import type { SavedSearchInput } from '../services/savedSearches';
import { parseSearchText } from '../services/searchText';
import { DEFAULT_PER_PAGE } from './validators';

// Leitura dos pedidos já validados (formato) em objetos tipados, com as
// conferências que envolvem mais de um campo (mínimo ≤ máximo, início ≤ fim).

type RequestValues = Record<string, unknown>;

function stringList(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map((item) => String(item).trim()).filter((item) => item.length > 0);
}

function uniqueList(values: string[]): string[] {
  return [...new Set(values)];
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value === true || value === 'true' || value === '1';
}

function readPositiveInt(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/** Valor em reais como texto decimal (o que a coluna numeric recebe). */
function moneyOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return typeof value === 'number' ? value.toFixed(2) : String(value).trim();
}

/** Termos aparados, com espaços simples e sem repetição (sem diferenciar maiúsculas). */
function normalizeTerms(value: unknown): string[] {
  const terms: string[] = [];
  for (const raw of stringList(value)) {
    const term = raw.replace(/\s+/g, ' ');
    if (!terms.some((existing) => existing.toLocaleLowerCase('pt-BR') === term.toLocaleLowerCase('pt-BR'))) {
      terms.push(term);
    }
  }
  return terms;
}

function assertValueRange(minValue: string | null, maxValue: string | null): void {
  if (minValue !== null && maxValue !== null && Number(minValue) > Number(maxValue)) {
    throw new RequestInputError('O valor mínimo não pode ser maior que o máximo.');
  }
}

function assertDateRange(from: string | null, to: string | null, label: string): void {
  if (from !== null && to !== null && from > to) {
    throw new RequestInputError(`Período de ${label}: a data inicial não pode ser depois da final.`);
  }
}

export function readPagination(query: RequestValues): { page: number; perPage: number } {
  return {
    page: readPositiveInt(query['page'], 1),
    perPage: readPositiveInt(query['perPage'], DEFAULT_PER_PAGE),
  };
}

export interface NoticeSearchRequest {
  filters: NoticeSearchFilters;
  savedSearchId: number | null;
}

/** `GET /notices`: `q` vira termos, frases e exclusões (modo E por padrão), como na busca salva. */
export function readNoticeSearchRequest(query: RequestValues): NoticeSearchRequest {
  const text = typeof query['q'] === 'string' ? query['q'] : '';
  const { terms, excludedTerms } = parseSearchText(text);
  const termsMode: SearchTermsMode = query['termsMode'] === 'OU' ? 'OU' : 'E';
  const minValue = moneyOrNull(query['minValue']);
  const maxValue = moneyOrNull(query['maxValue']);
  assertValueRange(minValue, maxValue);

  const date = (field: string) => (typeof query[field] === 'string' && query[field] !== '' ? (query[field] as string) : null);
  const publishedFrom = date('publishedFrom');
  const publishedTo = date('publishedTo');
  const closingFrom = date('closingFrom');
  const closingTo = date('closingTo');
  assertDateRange(publishedFrom, publishedTo, 'publicação');
  assertDateRange(closingFrom, closingTo, 'encerramento');

  const criteria: NoticeCriteria = {
    terms,
    termsMode,
    excludedTerms,
    states: uniqueList(stringList(query['state']).map((state) => state.toUpperCase())),
    cityIbgeCodes: uniqueList(stringList(query['municipalityCode'])),
    agencyCnpjs: uniqueList(stringList(query['agencyCnpj']).map((cnpj) => cnpj.replace(/\D/g, ''))),
    modalities: uniqueList(stringList(query['modality'])).map(Number),
    minValue,
    maxValue,
    includeWithoutValue: readBoolean(query['includeWithoutValue'], false),
    priceRegistration: null,
  };

  return {
    filters: {
      criteria,
      publishedFrom,
      publishedTo,
      closingFrom,
      closingTo,
      openOnly: readBoolean(query['openOnly'], true),
      trackingStatuses: uniqueList(stringList(query['trackingStatus']).map((status) => status.toUpperCase())) as TrackingFilter[],
      hideDiscarded: readBoolean(query['hideDiscarded'], true),
      favoritesOnly: readBoolean(query['favoritesOnly'], false),
      numberGroups: typeof query['number'] === 'string' ? numberGroupsOf(query['number']) : [],
      purchaseYear: query['purchaseYear'] === undefined ? null : Number(query['purchaseYear']),
      sort: (typeof query['sort'] === 'string' ? query['sort'] : 'closingAsc') as NoticeSort,
      ...readPagination(query),
    },
    savedSearchId: query['savedSearchId'] === undefined ? null : Number(query['savedSearchId']),
  };
}

/** Critérios de uma busca salva (corpo do pedido); o modo padrão da busca salva é OU. */
export function readSavedSearchCriteria(body: RequestValues): NoticeCriteria {
  const minValue = moneyOrNull(body['minValue']);
  const maxValue = moneyOrNull(body['maxValue']);
  return {
    terms: normalizeTerms(body['terms']),
    termsMode: body['termsMode'] === 'E' ? 'E' : 'OU',
    excludedTerms: normalizeTerms(body['excludedTerms']),
    states: uniqueList(stringList(body['states']).map((state) => state.toUpperCase())),
    cityIbgeCodes: uniqueList(stringList(body['cityIbgeCodes'])),
    agencyCnpjs: uniqueList(stringList(body['agencyCnpjs'])),
    modalities: uniqueList(stringList(body['modalities'])).map(Number),
    minValue,
    maxValue,
    includeWithoutValue: body['includeWithoutValue'] === true,
    priceRegistration: typeof body['priceRegistration'] === 'boolean' ? body['priceRegistration'] : null,
  };
}

/** Corpo de criar e alterar busca salva. `notify` e `active` ausentes: padrão na criação, mantidos na alteração. */
export function readSavedSearchInput(body: RequestValues): SavedSearchInput {
  return {
    ...readSavedSearchCriteria(body),
    name: String(body['name'] ?? '').trim(),
    ...(typeof body['notify'] === 'boolean' ? { notify: body['notify'] } : {}),
    ...(typeof body['active'] === 'boolean' ? { active: body['active'] } : {}),
  };
}

export function readNotificationFilters(query: RequestValues): {
  unreadOnly: boolean;
  type: TenderNotificationType | null;
  page: number;
  perPage: number;
} {
  return {
    unreadOnly: readBoolean(query['unreadOnly'], false),
    type: typeof query['type'] === 'string' && query['type'] !== '' ? (query['type'] as TenderNotificationType) : null,
    ...readPagination(query),
  };
}
