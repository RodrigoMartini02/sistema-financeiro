import type { ContractSavedSearch, ContractSearchBody, ContractSearchCriteriaBody, ContractSearchPreview } from '../types';
import { tendersRequest } from './tendersApi';

// Buscas salvas de contratos da pessoa na conta.

export function fetchContractSavedSearches(): Promise<ContractSavedSearch[]> {
  return tendersRequest<ContractSavedSearch[]>('/contract-searches');
}

export function createContractSavedSearch(body: ContractSearchBody): Promise<ContractSavedSearch> {
  return tendersRequest<ContractSavedSearch>('/contract-searches', { method: 'POST', body: JSON.stringify(body) });
}

/** Sem `notify` e `active` no corpo, a API mantém os gravados. */
export function updateContractSavedSearch(id: number, body: ContractSearchBody): Promise<ContractSavedSearch> {
  return tendersRequest<ContractSavedSearch>(`/contract-searches/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function patchContractSavedSearch(id: number, changes: { active?: boolean; notify?: boolean }): Promise<ContractSavedSearch> {
  return tendersRequest<ContractSavedSearch>(`/contract-searches/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
}

export function deleteContractSavedSearch(id: number): Promise<{ id: number }> {
  return tendersRequest<{ id: number }>(`/contract-searches/${id}`, { method: 'DELETE' });
}

export function duplicateContractSavedSearch(id: number): Promise<ContractSavedSearch> {
  return tendersRequest<ContractSavedSearch>(`/contract-searches/${id}/duplicate`, { method: 'POST' });
}

/** Prévia do formulário: quantos vigentes batem e os 5 primeiros. Não grava nada. */
export function previewContractSavedSearch(criteria: ContractSearchCriteriaBody): Promise<ContractSearchPreview> {
  return tendersRequest<ContractSearchPreview>('/contract-searches/preview', { method: 'POST', body: JSON.stringify(criteria) });
}
