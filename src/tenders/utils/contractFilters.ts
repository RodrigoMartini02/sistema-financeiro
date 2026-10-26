import { CONTRACT_SORTS, type ContractSort, type SearchTermsMode } from '../types';
import { onlyDigits } from '../../utils/brazilDocuments';
import { isCnpjFormat } from './cnpj';
import { addDaysToIsoDate } from './dates';
import { TERMS_MODE_LABELS, dateRangeLabel, formatCnpj, valueRangeLabel } from './labels';
import { decimalToReais } from './money';
import {
  MAX_PURCHASE_YEAR,
  MIN_PURCHASE_YEAR,
  MUNICIPALITY_PATTERN,
  STATE_PATTERN,
  dateParam,
  datePair,
  decimalParam,
  numberParam,
  positiveInt,
  uniqueValid,
} from './searchFilters';

// Estado da tela "Contratos a vencer" (plano .plans/licitacoes-contratos-a-vencer.md,
// Parte B), no modelo de Buscar (searchFilters.ts): mora na URL, para o link ser
// compartilhável e o voltar do navegador funcionar; os valores padrão ficam fora
// dela. Daqui saem também a query da API e os chips dos filtros ativos. O tipo
// de contrato e "Incluir encerrados" são da parte 2 do plano
// .plans/licitacoes-base-nacional.md: valem na tela, não na busca salva. A
// página não fica no estado nem na URL (rolagem infinita): quem pede cada
// página acrescenta `page` e `perPage` à query (`withPaging`).

/** Atalhos do vencimento: de hoje até hoje + N dias. */
export const EXPIRY_SHORTCUT_DAYS = [30, 90, 180, 365] as const;
/** Anos da lista "Ano do contrato": do próximo até tantos anos atrás (há contratos de 2021 ainda vigentes). */
const CONTRACT_YEARS_BACK = 6;

export interface ContractSearchState {
  q: string;
  termsMode: SearchTermsMode;
  states: string[];
  municipalityCodes: string[];
  agencyCnpjs: string[];
  categories: number[];
  supplierCnpjs: string[];
  /** Valor global em decimal com ponto, como a API recebe ("150000.50"); null = sem limite. */
  minValue: string | null;
  maxValue: string | null;
  /** Só vale com faixa de valor (regra do banco). */
  includeWithoutValue: boolean;
  publishedFrom: string | null;
  publishedTo: string | null;
  expiryFrom: string | null;
  expiryTo: string | null;
  /** Só os contratos que a pessoa favoritou, inclusive os vencidos. */
  favoritesOnly: boolean;
  /** Também os encerrados e os sem data de fim; sem ele, só os vigentes. */
  includeClosed: boolean;
  /** Tipos de contrato; vazio = todos. */
  contractTypes: number[];
  /** Número do contrato, processo ou controle PNCP, como digitado; vazio = sem filtro. */
  number: string;
  /** Ano do contrato; null = qualquer ano. */
  contractYear: number | null;
  /** Resultados de uma busca salva de contratos: os critérios vêm dela. */
  savedSearchId: number | null;
  sort: ContractSort;
}

export const DEFAULT_CONTRACT_SEARCH_STATE: ContractSearchState = {
  q: '',
  termsMode: 'E',
  states: [],
  municipalityCodes: [],
  agencyCnpjs: [],
  categories: [],
  supplierCnpjs: [],
  minValue: null,
  maxValue: null,
  includeWithoutValue: false,
  publishedFrom: null,
  publishedTo: null,
  expiryFrom: null,
  expiryTo: null,
  favoritesOnly: false,
  includeClosed: false,
  contractTypes: [],
  number: '',
  contractYear: null,
  savedSearchId: null,
  sort: 'expiryAsc',
};

/** Ordem padrão, como na API: o vencimento mais próximo; com os encerrados, a publicação mais recente. */
export function defaultContractSort(includeClosed: boolean): ContractSort {
  return includeClosed ? 'publishedDesc' : 'expiryAsc';
}

/** Parâmetros da URL de "Contratos a vencer", em português como os de Buscar. */
export const CONTRACT_URL_PARAMS = {
  q: 'q',
  termsMode: 'modo',
  state: 'uf',
  municipality: 'municipio',
  agency: 'orgao',
  category: 'categoria',
  supplier: 'fornecedor',
  minValue: 'valorMin',
  maxValue: 'valorMax',
  includeWithoutValue: 'semValor',
  publishedFrom: 'publicacaoDe',
  publishedTo: 'publicacaoAte',
  expiryFrom: 'vencimentoDe',
  expiryTo: 'vencimentoAte',
  favoritesOnly: 'favoritos',
  includeClosed: 'encerrados',
  contractType: 'tipo',
  number: 'numero',
  contractYear: 'ano',
  savedSearch: 'busca',
  sort: 'ordem',
} as const;

/** Contrato aberto no painel lateral da tela. */
export const CONTRACT_URL_PARAM = 'contrato';

const SORT_URL_VALUES: Record<ContractSort, string> = {
  expiryAsc: 'vencimento',
  publishedDesc: 'recentes',
  valueDesc: 'maior-valor',
  valueAsc: 'menor-valor',
  relevance: 'relevancia',
};

function contractYearParam(text: string | null): number | null {
  if (!text || !/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  return year >= MIN_PURCHASE_YEAR && year <= MAX_PURCHASE_YEAR ? year : null;
}

/** Busca sem texto não ordena por relevância (a API exige termos): vale a ordem padrão. */
function sortFor(sort: ContractSort, q: string, includeClosed: boolean): ContractSort {
  return sort === 'relevance' && !q.trim() ? defaultContractSort(includeClosed) : sort;
}

/** URL → estado. Valor inválido ou repetido fica de fora; os padrões preenchem o resto. */
export function parseContractSearchParams(params: URLSearchParams): ContractSearchState {
  const P = CONTRACT_URL_PARAMS;
  const savedSearchId = positiveInt(params.get(P.savedSearch));
  const [publishedFrom, publishedTo] = datePair(dateParam(params.get(P.publishedFrom)), dateParam(params.get(P.publishedTo)));
  const [expiryFrom, expiryTo] = datePair(dateParam(params.get(P.expiryFrom)), dateParam(params.get(P.expiryTo)));
  const includeClosed = params.get(P.includeClosed) === '1';
  const sortValue = params.get(P.sort);
  const sort = CONTRACT_SORTS.find((option) => SORT_URL_VALUES[option] === sortValue) ?? defaultContractSort(includeClosed);

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
          agencyCnpjs: uniqueValid(params.getAll(P.agency), onlyDigits, isCnpjFormat),
          categories: uniqueValid(params.getAll(P.category), (value) => value, (value) => positiveInt(value) !== null).map(Number),
          supplierCnpjs: uniqueValid(params.getAll(P.supplier), onlyDigits, isCnpjFormat),
          minValue,
          maxValue: minValue !== null && maxValue !== null && Number(minValue) > Number(maxValue) ? null : maxValue,
          includeWithoutValue: params.get(P.includeWithoutValue) === '1',
        };

  const state: ContractSearchState = {
    ...DEFAULT_CONTRACT_SEARCH_STATE,
    ...criteria,
    publishedFrom,
    publishedTo,
    expiryFrom,
    expiryTo,
    favoritesOnly: params.get(P.favoritesOnly) === '1',
    includeClosed,
    contractTypes: uniqueValid(params.getAll(P.contractType), (value) => value, (value) => positiveInt(value) !== null).map(Number),
    number: numberParam(params.get(P.number)),
    contractYear: contractYearParam(params.get(P.contractYear)),
    savedSearchId,
  };
  return { ...state, sort: sortFor(sort, state.q, includeClosed) };
}

/** Estado → URL, sem os valores padrão. */
export function toContractSearchParams(state: ContractSearchState): URLSearchParams {
  const P = CONTRACT_URL_PARAMS;
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set(P.q, q);
  if (state.termsMode !== 'E') params.set(P.termsMode, state.termsMode.toLowerCase());
  state.states.forEach((value) => params.append(P.state, value));
  state.municipalityCodes.forEach((value) => params.append(P.municipality, value));
  state.agencyCnpjs.forEach((value) => params.append(P.agency, value));
  state.categories.forEach((value) => params.append(P.category, String(value)));
  state.supplierCnpjs.forEach((value) => params.append(P.supplier, value));
  if (state.minValue !== null) params.set(P.minValue, state.minValue);
  if (state.maxValue !== null) params.set(P.maxValue, state.maxValue);
  if (state.includeWithoutValue) params.set(P.includeWithoutValue, '1');
  if (state.publishedFrom) params.set(P.publishedFrom, state.publishedFrom);
  if (state.publishedTo) params.set(P.publishedTo, state.publishedTo);
  if (state.expiryFrom) params.set(P.expiryFrom, state.expiryFrom);
  if (state.expiryTo) params.set(P.expiryTo, state.expiryTo);
  if (state.favoritesOnly) params.set(P.favoritesOnly, '1');
  if (state.includeClosed) params.set(P.includeClosed, '1');
  state.contractTypes.forEach((value) => params.append(P.contractType, String(value)));
  if (state.number) params.set(P.number, state.number);
  if (state.contractYear !== null) params.set(P.contractYear, String(state.contractYear));
  if (state.savedSearchId !== null) params.set(P.savedSearch, String(state.savedSearchId));
  if (state.sort !== defaultContractSort(state.includeClosed)) params.set(P.sort, SORT_URL_VALUES[state.sort]);
  return params;
}

/** Estado → query de `GET /api/tenders/contracts`, sem a página (`withPaging`). Com busca salva, os critérios vêm dela. */
export function toContractApiQuery(state: ContractSearchState): string {
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
    state.categories.forEach((value) => params.append('category', String(value)));
    state.supplierCnpjs.forEach((value) => params.append('supplierCnpj', value));
    if (state.minValue !== null) params.set('minValue', state.minValue);
    if (state.maxValue !== null) params.set('maxValue', state.maxValue);
    if (state.includeWithoutValue && (state.minValue !== null || state.maxValue !== null)) {
      params.set('includeWithoutValue', 'true');
    }
  }
  if (state.publishedFrom) params.set('publishedFrom', state.publishedFrom);
  if (state.publishedTo) params.set('publishedTo', state.publishedTo);
  if (state.expiryFrom) params.set('expiryFrom', state.expiryFrom);
  if (state.expiryTo) params.set('expiryTo', state.expiryTo);
  if (state.favoritesOnly) params.set('favoritesOnly', 'true');
  if (state.includeClosed) params.set('includeClosed', 'true');
  state.contractTypes.forEach((value) => params.append('contractType', String(value)));
  if (state.number) params.set('number', state.number);
  if (state.contractYear !== null) params.set('contractYear', String(state.contractYear));
  params.set('sort', state.sort);
  return params.toString();
}

/** Query da aba Contratos de Favoritos: todos os favoritos da pessoa, inclusive os vencidos, pelo vencimento. */
export function contractFavoritesApiQuery(): string {
  return toContractApiQuery({ ...DEFAULT_CONTRACT_SEARCH_STATE, favoritesOnly: true });
}

/**
 * Muda filtros; a relevância sai se a busca ficou sem texto. Ao ligar ou
 * desligar "Incluir encerrados" com a ordem padrão, a ordem passa a ser o
 * padrão do outro modo; uma ordem escolhida fica.
 */
export function withContractFilters(state: ContractSearchState, changes: Partial<ContractSearchState>): ContractSearchState {
  const next = { ...state, ...changes };
  const followsDefault = changes.sort === undefined && state.sort === defaultContractSort(state.includeClosed);
  if (next.includeClosed !== state.includeClosed && followsDefault) {
    next.sort = defaultContractSort(next.includeClosed);
  }
  return { ...next, sort: sortFor(next.sort, next.q, next.includeClosed) };
}

/** "Limpar tudo": filtros e busca salva saem; a ordenação fica. */
export function clearAllContractFilters(state: ContractSearchState): ContractSearchState {
  return withContractFilters(DEFAULT_CONTRACT_SEARCH_STATE, { sort: state.sort });
}

/** Atalho "vence em até N dias": de hoje até hoje + N. */
export function expiryWithinDays(days: number, todayIso: string): Pick<ContractSearchState, 'expiryFrom' | 'expiryTo'> {
  return { expiryFrom: todayIso, expiryTo: addDaysToIsoDate(todayIso, days) };
}

/** Atalho em uso no vencimento, para destacar o botão; nenhum, null. */
export function activeExpiryShortcut(state: ContractSearchState, todayIso: string): number | null {
  return (
    EXPIRY_SHORTCUT_DAYS.find((days) => {
      const range = expiryWithinDays(days, todayIso);
      return state.expiryFrom === range.expiryFrom && state.expiryTo === range.expiryTo;
    }) ?? null
  );
}

/**
 * Anos da lista "Ano do contrato": do próximo até 6 anos atrás, do mais novo ao
 * mais antigo. Um ano escolhido fora da faixa (veio pela URL) entra na lista.
 */
export function contractYearOptions(todayIso: string, selected: number | null = null): number[] {
  const currentYear = Number(todayIso.slice(0, 4));
  const years = Array.from({ length: CONTRACT_YEARS_BACK + 2 }, (_, index) => currentYear + 1 - index);
  return selected !== null && !years.includes(selected) ? [...years, selected].sort((a, b) => b - a) : years;
}

/** Dias de hoje até o vencimento (AAAA-MM-DD, dias de calendário); negativo = vencido. */
export function daysUntilExpiry(expiresOn: string, todayIso: string): number {
  return Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000);
}

/** "Vence hoje", "Vence amanhã", "Vence em 45 dias", "Vencido" ou, sem vencimento, "Sem data de fim". */
export function expiryLabel(expiresOn: string | null, todayIso: string): string {
  if (expiresOn === null) return 'Sem data de fim';
  const days = daysUntilExpiry(expiresOn, todayIso);
  if (days < 0) return 'Vencido';
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  return `Vence em ${days.toLocaleString('pt-BR')} dias`;
}

export interface ContractFilterChip {
  key: string;
  label: string;
  /** Estado sem este filtro. */
  without: ContractSearchState;
}

/** Nomes para os chips; sem o nome, o chip mostra o código. */
export interface ContractChipLookups {
  municipalityName?: (code: string) => string | undefined;
  categoryName?: (id: number) => string | undefined;
  contractTypeName?: (id: number) => string | undefined;
  savedSearchName?: (id: number) => string | undefined;
}

/** Filtros ativos como chips removíveis; vazio quando a busca está no padrão. */
export function contractFilterChips(state: ContractSearchState, lookups: ContractChipLookups = {}): ContractFilterChip[] {
  const chips: ContractFilterChip[] = [];
  const add = (key: string, label: string, changes: Partial<ContractSearchState>) =>
    chips.push({ key, label, without: withContractFilters(state, changes) });

  if (state.savedSearchId !== null) {
    const name = lookups.savedSearchName?.(state.savedSearchId) ?? `nº ${state.savedSearchId}`;
    add('savedSearch', `Busca salva: ${name}`, { savedSearchId: null });
  }
  const q = state.q.trim();
  if (q) {
    const mode = state.termsMode === 'OU' ? ` (${TERMS_MODE_LABELS.OU.toLowerCase()})` : '';
    add('q', `Busca: "${q}"${mode}`, { q: '', termsMode: 'E' });
  }
  if (state.number) {
    add('number', `Número: ${state.number}`, { number: '' });
  }
  if (state.contractYear !== null) {
    add('contractYear', `Ano: ${state.contractYear}`, { contractYear: null });
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
  state.categories.forEach((id) =>
    add(`category:${id}`, `Categoria: ${lookups.categoryName?.(id) ?? id}`, {
      categories: state.categories.filter((item) => item !== id),
    }),
  );
  state.supplierCnpjs.forEach((cnpj) =>
    add(`supplier:${cnpj}`, `Fornecedor: ${formatCnpj(cnpj)}`, { supplierCnpjs: state.supplierCnpjs.filter((item) => item !== cnpj) }),
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
  const expiry = dateRangeLabel(state.expiryFrom, state.expiryTo);
  if (expiry) {
    add('expiry', `Vencimento: ${expiry}`, { expiryFrom: null, expiryTo: null });
  }
  if (state.favoritesOnly) {
    add('favoritesOnly', 'Só favoritos', { favoritesOnly: false });
  }
  state.contractTypes.forEach((id) =>
    add(`contractType:${id}`, `Tipo: ${lookups.contractTypeName?.(id) ?? id}`, {
      contractTypes: state.contractTypes.filter((item) => item !== id),
    }),
  );
  if (state.includeClosed) {
    add('includeClosed', 'Com encerrados', { includeClosed: false });
  }
  return chips;
}
