import type { CnpjSummary, CnpjWinnerItem, Paginated } from '../types';
import { tendersRequest } from './tendersApi';

// Página do CNPJ: o resumo e as licitações vencidas. O CNPJ vai com os 14 dígitos, sem pontuação.

export function fetchCnpjSummary(cnpj: string): Promise<CnpjSummary> {
  return tendersRequest<CnpjSummary>(`/cnpj/${cnpj}`);
}

export function fetchCnpjWinners(cnpj: string, page: number, perPage: number): Promise<Paginated<CnpjWinnerItem>> {
  return tendersRequest<Paginated<CnpjWinnerItem>>(`/cnpj/${cnpj}/winners?page=${page}&perPage=${perPage}`);
}
