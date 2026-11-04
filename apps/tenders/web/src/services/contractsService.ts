import type { ContractDetail, ContractFavoriteView, ContractSearchResult } from '../types';
import { tendersRequest } from './tendersApi';

// Contratos a vencer: busca, detalhe e favoritos da pessoa logada.

/** `apiQuery`: parâmetros da API já montados (utils/contractFilters → `toContractApiQuery`). */
export function fetchContracts(apiQuery: string): Promise<ContractSearchResult> {
  return tendersRequest<ContractSearchResult>(apiQuery ? `/contracts?${apiQuery}` : '/contracts');
}

/** `key`: a chave do contrato (número de controle do PNCP), com a barra codificada no caminho. */
export function fetchContract(key: string): Promise<ContractDetail> {
  return tendersRequest<ContractDetail>(`/contracts/${encodeURIComponent(key)}`);
}

/** Favorita para a pessoa logada; favoritar de novo não muda nada. */
export function addContractFavorite(key: string): Promise<ContractFavoriteView> {
  return tendersRequest<ContractFavoriteView>(`/contracts/${encodeURIComponent(key)}/favorite`, { method: 'PUT' });
}

export function removeContractFavorite(key: string): Promise<ContractFavoriteView> {
  return tendersRequest<ContractFavoriteView>(`/contracts/${encodeURIComponent(key)}/favorite`, { method: 'DELETE' });
}
