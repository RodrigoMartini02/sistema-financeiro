import type { CnpjCoverage, CnpjSummary } from '../types';
import { DEFAULT_CONTRACT_SEARCH_STATE, toContractApiQuery, toContractSearchParams, type ContractSearchState } from './contractFilters';
import { formatIsoDate } from './dates';
import { withPaging } from './infiniteList';
import { DEFAULT_SEARCH_STATE, toApiQuery, toSearchParams, type SearchState } from './searchFilters';

// A página do CNPJ (plano .plans/licitacoes-pagina-cnpj.md): a aba, as buscas curtas das listas (as mesmas buscas das
// telas Contratos a vencer e Buscar, já filtradas pelo CNPJ), os links "Ver todos" e a nota de cobertura dos dados.

/** Quantos itens de cada lista a página mostra; o resto fica no "Ver todos". */
export const CNPJ_LIST_SIZE = 10;

export const CNPJ_TAB_PARAM = 'aba';
export const CNPJ_TABS = ['fornecedor', 'orgao'] as const;
export type CnpjTab = (typeof CNPJ_TABS)[number];

export const CNPJ_TAB_LABELS: Record<CnpjTab, string> = {
  fornecedor: 'Como fornecedor',
  orgao: 'Como órgão',
};

/** A aba da página: a da URL, quando é uma das duas; senão a que tem dado (o fornecedor primeiro). */
export function cnpjTabFor(requested: string | null, summary: Pick<CnpjSummary, 'supplier' | 'agency'>): CnpjTab {
  const asked = CNPJ_TABS.find((tab) => tab === requested);
  if (asked) return asked;
  return summary.supplier === null && summary.agency !== null ? 'orgao' : 'fornecedor';
}

/** Os contratos do CNPJ no papel da aba: todos, inclusive os encerrados, o mais recente primeiro. */
function contractsState(tab: CnpjTab, cnpj: string): ContractSearchState {
  return {
    ...DEFAULT_CONTRACT_SEARCH_STATE,
    ...(tab === 'fornecedor' ? { supplierCnpjs: [cnpj] } : { agencyCnpjs: [cnpj] }),
    includeClosed: true,
    sort: 'publishedDesc',
  };
}

/** Busca da lista curta de contratos (`GET /contracts`). */
export function cnpjContractsApiQuery(tab: CnpjTab, cnpj: string): string {
  return withPaging(toContractApiQuery(contractsState(tab, cnpj)), { page: 1, perPage: CNPJ_LIST_SIZE });
}

/** "Ver todos" os contratos: a tela Contratos a vencer já filtrada pelo CNPJ, com os encerrados. */
export function cnpjContractsPath(tab: CnpjTab, cnpj: string): string {
  return `/contratos?${toContractSearchParams(contractsState(tab, cnpj)).toString()}`;
}

/** Os editais abertos do órgão, inclusive os que encerram em breve (a contagem da página também os conta). */
function noticesState(cnpj: string): SearchState {
  return { ...DEFAULT_SEARCH_STATE, agencyCnpjs: [cnpj], openOnly: true, includeClosingSoon: true, hideDiscarded: false, sort: 'publishedDesc' };
}

/** Busca da lista curta de editais (`GET /notices`). */
export function cnpjNoticesApiQuery(cnpj: string): string {
  return withPaging(toApiQuery(noticesState(cnpj)), { page: 1, perPage: CNPJ_LIST_SIZE });
}

/** "Ver todos" os editais abertos: a tela Buscar já filtrada pelo órgão. */
export function cnpjNoticesPath(cnpj: string): string {
  return `/buscar?${toSearchParams(noticesState(cnpj)).toString()}`;
}

/** A nota da página sobre até onde os dados vão (sem citar a fonte). */
export function cnpjCoverageNotes(coverage: CnpjCoverage): string[] {
  const notes: string[] = [];
  if (coverage.contractsFrom) {
    notes.push(`Contratos publicados desde ${formatIsoDate(coverage.contractsFrom)}.`);
  }
  if (coverage.winnersFrom && coverage.winnersTo) {
    notes.push(`Resultados de licitações de ${formatIsoDate(coverage.winnersFrom)} a ${formatIsoDate(coverage.winnersTo)}.`);
  } else {
    notes.push('Resultados de licitações ainda não disponíveis.');
  }
  return notes;
}

const PURCHASE_CONTROL = /^\d{14}-\d+-0*(\d+)\/(\d{4})$/;

/** "216/2026" a partir do número de controle da compra; de outro formato, o número como veio. */
export function purchaseLabel(controlNumber: string): string {
  const match = PURCHASE_CONTROL.exec(controlNumber);
  return match ? `${match[1]}/${match[2]}` : controlNumber;
}

/** O dia do resultado ("29/09/2026") ou, quando os itens saíram em dias diferentes, o período ("27/09/2026 a 29/09/2026"). */
export function resultPeriodLabel(first: string, last: string): string {
  return first === last ? formatIsoDate(last) : `${formatIsoDate(first)} a ${formatIsoDate(last)}`;
}
