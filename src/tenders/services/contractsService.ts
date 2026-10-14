import type { ContractDetail, ContractFavoriteView, ContractSearchResult } from '../types';
import { tendersRequest } from './tendersApi';

// Contratos a vencer: busca, detalhe e favoritos da pessoa logada.

/** `apiQuery`: parâmetros da API já montados (utils/contractFilters → `toContractApiQuery`). */
export function fetchContracts(apiQuery: string): Promise<ContractSearchResult> {
  return tendersRequest<ContractSearchResult>(apiQuery ? `/contracts?${apiQuery}` : '/contracts');
}

export function fetchContract(id: number): Promise<ContractDetail> {
  return tendersRequest<ContractDetail>(`/contracts/${id}`);
}

/** Favorita para a pessoa logada; favoritar de novo não muda nada. */
export function addContractFavorite(id: number): Promise<ContractFavoriteView> {
  return tendersRequest<ContractFavoriteView>(`/contracts/${id}/favorite`, { method: 'PUT' });
}

export function removeContractFavorite(id: number): Promise<ContractFavoriteView> {
  return tendersRequest<ContractFavoriteView>(`/contracts/${id}/favorite`, { method: 'DELETE' });
}
