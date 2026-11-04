import type { SavedSearch, SavedSearchBody, SavedSearchCriteriaBody, SavedSearchPreview } from '../types';
import { tendersRequest } from './tendersApi';

// Buscas salvas do usuário na conta.

export function fetchSavedSearches(): Promise<SavedSearch[]> {
  return tendersRequest<SavedSearch[]>('/saved-searches');
}

export function createSavedSearch(body: SavedSearchBody): Promise<SavedSearch> {
  return tendersRequest<SavedSearch>('/saved-searches', { method: 'POST', body: JSON.stringify(body) });
}

/** Sem `notify` e `active` no corpo, a API mantém os gravados. */
export function updateSavedSearch(id: number, body: SavedSearchBody): Promise<SavedSearch> {
  return tendersRequest<SavedSearch>(`/saved-searches/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function patchSavedSearch(id: number, changes: { active?: boolean; notify?: boolean }): Promise<SavedSearch> {
  return tendersRequest<SavedSearch>(`/saved-searches/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
}

export function deleteSavedSearch(id: number): Promise<{ id: number }> {
  return tendersRequest<{ id: number }>(`/saved-searches/${id}`, { method: 'DELETE' });
}

export function duplicateSavedSearch(id: number): Promise<SavedSearch> {
  return tendersRequest<SavedSearch>(`/saved-searches/${id}/duplicate`, { method: 'POST' });
}

/** Prévia do formulário: quantos abertos batem e os 5 primeiros. Não grava nada. */
export function previewSavedSearch(criteria: SavedSearchCriteriaBody): Promise<SavedSearchPreview> {
  return tendersRequest<SavedSearchPreview>('/saved-searches/preview', { method: 'POST', body: JSON.stringify(criteria) });
}
