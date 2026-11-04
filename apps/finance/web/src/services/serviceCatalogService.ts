// Catálogo de serviços da conta PJ (/api/service-catalog): lista informativa
// dos contratos, sem valor. Serviço não é excluído, só desativado.
import { apiRequest } from './apiClient';

export interface CatalogService {
  id: number;
  name: string;
  active: boolean;
  /** Contratos que listam o serviço. */
  contractCount: number;
}

export function fetchCatalogServices(accountId: number, includeInactive: boolean): Promise<CatalogService[]> {
  return apiRequest<CatalogService[]>(`/service-catalog?accountId=${accountId}${includeInactive ? '&includeInactive=true' : ''}`);
}

export function createCatalogService(accountId: number, name: string): Promise<CatalogService> {
  return apiRequest<CatalogService>('/service-catalog', { method: 'POST', body: JSON.stringify({ accountId, name }) });
}

export function renameCatalogService(id: number, name: string): Promise<CatalogService> {
  return apiRequest<CatalogService>(`/service-catalog/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
}

export function setCatalogServiceActive(id: number, active: boolean): Promise<CatalogService> {
  return apiRequest<CatalogService>(`/service-catalog/${id}/active`, { method: 'PUT', body: JSON.stringify({ active }) });
}
