import {
  NOTICE_SORTS,
  TRACKING_FILTER_NONE,
  TRACKING_FILTERS,
  type NoticeSort,
  type SearchTermsMode,
  type TrackingFilter,
} from '../types';
import { addDaysToIsoDate, isValidIsoDate } from './dates';
import {
  TERMS_MODE_LABELS,
  TRACKING_FILTER_LABELS,
  dateRangeLabel,
  formatCnpj,
  valueRangeLabel,
} from './labels';
import { decimalToReais, isDecimalValue } from './money';

// Estado da tela Buscar (escopo, seção 9.4). Mora na URL, para o link ser
// compartilhável e o voltar do navegador funcionar; os valores padrão ficam
// fora dela. Daqui saem também a query da API e os chips dos filtros ativos.

export const PER_PAGE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_PER_PAGE = 20;
export const CLOSING_SHORTCUT_DAYS = [7, 15, 30] as const;

/**
 * Prazo mínimo padrão de Buscar: só os editais que encerram a partir de hoje +
 * 3 dias, porque com menos não dá tempo de preparar a proposta. O filtro
 * "Incluir os que encerram em menos de 3 dias" traz os demais.
 */
export const MIN_DAYS_TO_CLOSE = 3;

export interface SearchState {
  q: string;
  termsMode: SearchTermsMode;
  states: string[];
  municipalityCodes: string[];
  agencyCnpjs: string[];
  modalities: number[];
  /** Decimal em texto, como a API recebe ("150000.50"); null = sem limite. */
  minValue: string | null;
  maxValue: string | null;
  /** Só vale com faixa de valor (regra do banco). */
  includeWithoutValue: boolean;
  publishedFrom: string | null;
  publishedTo: string | null;
  closingFrom: string | null;
  closingTo: string | null;
  openOnly: boolean;
  /** Inclui os que encerram antes do prazo mínimo (hoje + MIN_DAYS_TO_CLOSE). */
  includeClosingSoon: boolean;
  trackingStatuses: TrackingFilter[];
  hideDiscarded: boolean;
  /** Só os editais que a pessoa favoritou. */
  favoritesOnly: boolean;
  /** Resultados de uma busca salva: os critérios vêm dela, e os da tela ficam de fora. */
  savedSearchId: number | null;
  sort: NoticeSort;
  page: number;
  perPage: number;
}

export const DEFAULT_SEARCH_STATE: SearchState = {
  q: '',
  termsMode: 'E',
  states: [],
  municipalityCodes: [],
  agencyCnpjs: [],
  modalities: [],
  minValue: null,
  maxValue: null,
  includeWithoutValue: false,
  publishedFrom: null,
  publishedTo: null,
  closingFrom: null,
  closingTo: null,
  openOnly: true,
  includeClosingSoon: false,
  trackingStatuses: [],
  hideDiscarded: true,
  favoritesOnly: false,
  savedSearchId: null,
  sort: 'closingAsc',
  page: 1,
  perPage: DEFAULT_PER_PAGE,
};

/** Parâmetros da URL de Buscar, em português como o `?edital=`. */
export const SEARCH_URL_PARAMS = {
  q: 'q',
  termsMode: 'modo',
  state: 'uf',
  municipality: 'municipio',
  agency: 'orgao',
  modality: 'modalidade',
  minValue: 'valorMin',
  maxValue: 'valorMax',
  includeWithoutValue: 'semValor',
  publishedFrom: 'publicacaoDe',
  publishedTo: 'publicacaoAte',
  closingFrom: 'encerramentoDe',
  closingTo: 'encerramentoAte',
  openOnly: 'abertos',
  includeClosingSoon: 'prazoCurto',
  tracking: 'acompanhamento',
  showDiscarded: 'descartados',
  favoritesOnly: 'favoritos',
  savedSearch: 'busca',
  sort: 'ordem',
  page: 'pagina',
  perPage: 'porPagina',
} as const;

/** Edital aberto no painel lateral de Buscar. */
export const NOTICE_URL_PARAM = 'edital';

const SORT_URL_VALUES: Record<NoticeSort, string> = {
  closingAsc: 'prazo',
  publishedDesc: 'recentes',
  valueDesc: 'maior-valor',
  valueAsc: 'menor-valor',
  relevance: 'relevancia',
};

const STATE_PATTERN = /^[A-Z]{2}$/;
const MUNICIPALITY_PATTERN = /^\d{7}$/;
const CNPJ_PATTERN = /^\d{14}$/;

/** CNPJ só com os dígitos; válido com 14. */
export function normalizeCnpj(text: string): string {
  return text.replace(/\D/g, '');
}

export function isValidCnpj(digits: string): boolean {
  return CNPJ_PATTERN.test(digits);
}

function uniqueValid(values: string[], normalize: (value: string) => string, isValid: (value: string) => boolean): string[] {
  const result: string[] = [];
  for (const raw of values) {
    const value = normalize(raw.trim());
    if (isValid(value) && !result.includes(value)) {
      result.push(value);
    }
  }
  return result;
}

function positiveInt(text: string | null): number | null {
  if (!text || !/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function dateParam(text: string | null): string | null {
  return text && isValidIsoDate(text) ? text : null;
}

/** Período com o início depois do fim: fica só o início. */
function datePair(from: string | null, to: string | null): [string | null, string | null] {
  return from && to && from > to ? [from, null] : [from, to];
}

function decimalParam(text: string | null): string | null {
  return text && isDecimalValue(text) ? text : null;
}

/** Busca sem texto não ordena por relevância (a API exige termos). */
function sortFor(sort: NoticeSort, q: string): NoticeSort {
  return sort === 'relevance' && !q.trim() ? 'closingAsc' : sort;
}

/** URL → estado. Valor inválido ou repetido fica de fora; os padrões preenchem o resto. */
export function parseSearchParams(params: URLSearchParams): SearchState {
  const P = SEARCH_URL_PARAMS;
  const savedSearchId = positiveInt(params.get(P.savedSearch));
  const [publishedFrom, publishedTo] = datePair(dateParam(params.get(P.publishedFrom)), dateParam(params.get(P.publishedTo)));
  const [closingFrom, closingTo] = datePair(dateParam(params.get(P.closingFrom)), dateParam(params.get(P.closingTo)));
  const sortValue = params.get(P.sort);
  const sort = NOTICE_SORTS.find((option) => SORT_URL_VALUES[option] === sortValue) ?? DEFAULT_SEARCH_STATE.sort;
  const perPage = PER_PAGE_OPTIONS.find((option) => String(option) === params.get(P.perPage)) ?? DEFAULT_PER_PAGE;

  const minValue = decimalParam(params.get(P.minValue));
  const maxValue = decimalParam(params.get(P.maxValue));
  const criteria =
    savedSearchId !== null
      ? {}
      : {
          q: (params.get(P.q) ?? '').trim(),
          termsMode: params.get(P.termsMode)?.toUpperCase() === 'OU' ? ('OU' as const) : ('E' as const),
          states: uniqueValid(params.getAll(P.state), (value) => value.toUpperCase(), (value) => STATE_PATTERN.test(value)),
          municipalityCodes: uniqueValid(params.getAll(P.municipality), (value) => value, (value) => MUNICIPALITY_PATTERN.test(value)),
          agencyCnpjs: uniqueValid(params.getAll(P.agency), normalizeCnpj, isValidCnpj),
          modalities: uniqueValid(params.getAll(P.modality), (value) => value, (value) => positiveInt(value) !== null).map(Number),
          minValue,
          maxValue: minValue !== null && maxValue !== null && Number(minValue) > Number(maxValue) ? null : maxValue,
          includeWithoutValue: params.get(P.includeWithoutValue) === '1',
        };

  const state: SearchState = {
    ...DEFAULT_SEARCH_STATE,
    ...criteria,
    publishedFrom,
    publishedTo,
    closingFrom,
    closingTo,
    openOnly: params.get(P.openOnly) !== '0',
    includeClosingSoon: params.get(P.includeClosingSoon) === '1',
    trackingStatuses: uniqueValid(
      params.getAll(P.tracking),
      (value) => value.toUpperCase(),
      (value) => (TRACKING_FILTERS as readonly string[]).includes(value),
    ) as TrackingFilter[],
    hideDiscarded: params.get(P.showDiscarded) !== '1',
    favoritesOnly: params.get(P.favoritesOnly) === '1',
    savedSearchId,
    page: positiveInt(params.get(P.page)) ?? 1,
    perPage,
  };
  return { ...state, sort: sortFor(sort, state.q) };
}

/** Estado → URL, sem os valores padrão. */
export function toSearchParams(state: SearchState): URLSearchParams {
  const P = SEARCH_URL_PARAMS;
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set(P.q, q);
  if (state.termsMode !== 'E') params.set(P.termsMode, state.termsMode.toLowerCase());
  state.states.forEach((value) => params.append(P.state, value));
  state.municipalityCodes.forEach((value) => params.append(P.municipality, value));
  state.agencyCnpjs.forEach((value) => params.append(P.agency, value));
  state.modalities.forEach((value) => params.append(P.modality, String(value)));
  if (state.minValue !== null) params.set(P.minValue, state.minValue);
  if (state.maxValue !== null) params.set(P.maxValue, state.maxValue);
  if (state.includeWithoutValue) params.set(P.includeWithoutValue, '1');
  if (state.publishedFrom) params.set(P.publishedFrom, state.publishedFrom);
  if (state.publishedTo) params.set(P.publishedTo, state.publishedTo);
  if (state.closingFrom) params.set(P.closingFrom, state.closingFrom);
  if (state.closingTo) params.set(P.closingTo, state.closingTo);
  if (!state.openOnly) params.set(P.openOnly, '0');
  if (state.includeClosingSoon) params.set(P.includeClosingSoon, '1');
  state.trackingStatuses.forEach((value) => params.append(P.tracking, value.toLowerCase()));
  if (!state.hideDiscarded) params.set(P.showDiscarded, '1');
  if (state.favoritesOnly) params.set(P.favoritesOnly, '1');
  if (state.savedSearchId !== null) params.set(P.savedSearch, String(state.savedSearchId));
  if (state.sort !== DEFAULT_SEARCH_STATE.sort) params.set(P.sort, SORT_URL_VALUES[state.sort]);
  if (state.page > 1) params.set(P.page, String(state.page));
  if (state.perPage !== DEFAULT_PER_PAGE) params.set(P.perPage, String(state.perPage));
  return params;
}

/** Estado → query de `GET /api/tenders/notices`. Com busca salva, os critérios vêm dela. */
export function toApiQuery(state: SearchState): string {
  const params = new URLSearchParams();
  if (state.savedSearchId !== null) {
    params.set('savedSearchId', String(state.savedSearchId));
  } else {
    const q = state.q.trim();
    if (q) {
      params.set('q', q);
      params.set('termsMode', state.termsMode);
    }
    state.states.forEach((value) => params.append('state', value));
    state.municipalityCodes.forEach((value) => params.append('municipalityCode', value));
    state.agencyCnpjs.forEach((value) => params.append('agencyCnpj', value));
    state.modalities.forEach((value) => params.append('modality', String(value)));
    if (state.minValue !== null) params.set('minValue', state.minValue);
    if (state.maxValue !== null) params.set('maxValue', state.maxValue);
    if (state.includeWithoutValue && (state.minValue !== null || state.maxValue !== null)) {
      params.set('includeWithoutValue', 'true');
    }
  }
  if (state.publishedFrom) params.set('publishedFrom', state.publishedFrom);
  if (state.publishedTo) params.set('publishedTo', state.publishedTo);
  if (state.closingFrom) params.set('closingFrom', state.closingFrom);
  if (state.closingTo) params.set('closingTo', state.closingTo);
  params.set('openOnly', String(state.openOnly));
  state.trackingStatuses.forEach((value) => params.append('trackingStatus', value));
  params.set('hideDiscarded', String(state.hideDiscarded));
  if (state.favoritesOnly) params.set('favoritesOnly', 'true');
  params.set('sort', state.sort);
  params.set('page', String(state.page));
  params.set('perPage', String(state.perPage));
  return params.toString();
}

/**
 * Query da tela Favoritos: todos os favoritos da pessoa, inclusive os
 * encerrados e os descartados, pelo prazo de encerramento.
 */
export function favoritesApiQuery(page: number, perPage: number): string {
  return toApiQuery({ ...DEFAULT_SEARCH_STATE, openOnly: false, hideDiscarded: false, favoritesOnly: true, page, perPage });
}

/** Muda filtros: a página volta para a 1, e a relevância sai se a busca ficou sem texto. */
export function withFilters(state: SearchState, changes: Partial<Omit<SearchState, 'page'>>): SearchState {
  const next = { ...state, ...changes, page: 1 };
  return { ...next, sort: sortFor(next.sort, next.q) };
}

/** "Limpar tudo": filtros e busca salva saem; ordenação e itens por página ficam. */
export function clearAllFilters(state: SearchState): SearchState {
  return withFilters(DEFAULT_SEARCH_STATE, { sort: state.sort, perPage: state.perPage });
}

/** Primeiro dia de encerramento que aparece por padrão: hoje + MIN_DAYS_TO_CLOSE (AAAA-MM-DD). */
export function minimumClosingDate(todayIso: string): string {
  return addDaysToIsoDate(todayIso, MIN_DAYS_TO_CLOSE);
}

/**
 * O prazo mínimo vale na busca de editais abertos com o filtro desligado. Não
 * vale com filtro de acompanhados (Analisar, Vou participar ou Descartado) nem
 * com "Só favoritos": aí a pessoa quer ver os seus, inclusive os urgentes.
 * Também não vale com um período de encerramento que termina antes do mínimo
 * (aí vale o período escolhido).
 */
export function appliesMinimumDeadline(state: SearchState, todayIso: string): boolean {
  if (!state.openOnly || state.includeClosingSoon || state.favoritesOnly) {
    return false;
  }
  if (state.trackingStatuses.some((status) => status !== TRACKING_FILTER_NONE)) {
    return false;
  }
  return state.closingTo === null || state.closingTo >= minimumClosingDate(todayIso);
}

/** Estado enviado à API: com o prazo mínimo, o início do encerramento sobe para hoje + 3 dias. */
export function withMinimumDeadline(state: SearchState, todayIso: string): SearchState {
  if (!appliesMinimumDeadline(state, todayIso)) {
    return state;
  }
  const minimum = minimumClosingDate(todayIso);
  return state.closingFrom !== null && state.closingFrom >= minimum ? state : { ...state, closingFrom: minimum };
}

/**
 * Query da contagem dos editais que o prazo mínimo esconde: os que encerram
 * antes de hoje + 3 dias, dentro dos outros filtros, com uma linha por página.
 * null quando o prazo mínimo não vale ou não esconde nada.
 */
export function closingSoonCountQuery(state: SearchState, todayIso: string): string | null {
  if (!appliesMinimumDeadline(state, todayIso)) {
    return null;
  }
  const minimum = minimumClosingDate(todayIso);
  if (state.closingFrom !== null && state.closingFrom >= minimum) {
    return null;
  }
  return toApiQuery({ ...state, closingTo: addDaysToIsoDate(minimum, -1), page: 1, perPage: 1 });
}

/** Atalho "próximos N dias" do encerramento: de hoje até hoje + N. */
export function closingWithinDays(days: number, todayIso: string): Pick<SearchState, 'closingFrom' | 'closingTo'> {
  return { closingFrom: todayIso, closingTo: addDaysToIsoDate(todayIso, days) };
}

/** Atalho em uso no encerramento, para destacar o botão; nenhum, null. */
export function activeClosingShortcut(state: SearchState, todayIso: string): number | null {
  return (
    CLOSING_SHORTCUT_DAYS.find((days) => {
      const range = closingWithinDays(days, todayIso);
      return state.closingFrom === range.closingFrom && state.closingTo === range.closingTo;
    }) ?? null
  );
}

export interface FilterChip {
  key: string;
  label: string;
  /** Estado sem este filtro (de volta à página 1). */
  without: SearchState;
}

/** Nomes para os chips; sem o nome, o chip mostra o código. */
export interface ChipLookups {
  municipalityName?: (code: string) => string | undefined;
  modalityName?: (id: number) => string | undefined;
  savedSearchName?: (id: number) => string | undefined;
}

/** Filtros ativos como chips removíveis; vazio quando a busca está no padrão. */
export function filterChips(state: SearchState, lookups: ChipLookups = {}): FilterChip[] {
  const chips: FilterChip[] = [];
  const add = (key: string, label: string, changes: Partial<Omit<SearchState, 'page'>>) =>
    chips.push({ key, label, without: withFilters(state, changes) });

  if (state.savedSearchId !== null) {
    const name = lookups.savedSearchName?.(state.savedSearchId) ?? `nº ${state.savedSearchId}`;
    add('savedSearch', `Busca salva: ${name}`, { savedSearchId: null });
  }
  const q = state.q.trim();
  if (q) {
    const mode = state.termsMode === 'OU' ? ` (${TERMS_MODE_LABELS.OU.toLowerCase()})` : '';
    add('q', `Busca: "${q}"${mode}`, { q: '', termsMode: 'E' });
  }
  state.states.forEach((value) =>
    add(`state:${value}`, `UF: ${value}`, { states: state.states.filter((item) => item !== value) }),
  );
  state.municipalityCodes.forEach((code) =>
    add(`municipality:${code}`, `Município: ${lookups.municipalityName?.(code) ?? code}`, {
      municipalityCodes: state.municipalityCodes.filter((item) => item !== code),
    }),
  );
  state.agencyCnpjs.forEach((cnpj) =>
    add(`agency:${cnpj}`, `Órgão: ${formatCnpj(cnpj)}`, { agencyCnpjs: state.agencyCnpjs.filter((item) => item !== cnpj) }),
  );
  state.modalities.forEach((id) =>
    add(`modality:${id}`, `Modalidade: ${lookups.modalityName?.(id) ?? id}`, {
      modalities: state.modalities.filter((item) => item !== id),
    }),
  );
  const valueRange = valueRangeLabel(decimalToReais(state.minValue), decimalToReais(state.maxValue));
  if (valueRange) {
    const withoutValue = state.includeWithoutValue ? ', inclui sem valor' : '';
    add('value', `Valor: ${valueRange}${withoutValue}`, { minValue: null, maxValue: null, includeWithoutValue: false });
  }
  const published = dateRangeLabel(state.publishedFrom, state.publishedTo);
  if (published) {
    add('published', `Publicação: ${published}`, { publishedFrom: null, publishedTo: null });
  }
  const closing = dateRangeLabel(state.closingFrom, state.closingTo);
  if (closing) {
    add('closing', `Encerramento: ${closing}`, { closingFrom: null, closingTo: null });
  }
  if (!state.openOnly) {
    add('openOnly', 'Inclui encerrados', { openOnly: true });
  }
  if (state.includeClosingSoon) {
    add('includeClosingSoon', `Inclui os que encerram em menos de ${MIN_DAYS_TO_CLOSE} dias`, { includeClosingSoon: false });
  }
  state.trackingStatuses.forEach((status) =>
    add(`tracking:${status}`, `Acompanhamento: ${TRACKING_FILTER_LABELS[status]}`, {
      trackingStatuses: state.trackingStatuses.filter((item) => item !== status),
    }),
  );
  if (!state.hideDiscarded) {
    add('showDiscarded', 'Mostra descartados', { hideDiscarded: true });
  }
  if (state.favoritesOnly) {
    add('favoritesOnly', 'Só favoritos', { favoritesOnly: false });
  }
  return chips;
}
