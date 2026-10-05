// Clientes da conta PJ (/api/clients). Os campos seguem a API em inglês; os
// valores de tipo e esfera são os do banco, como os status das receitas.
import { apiRequest } from './apiClient';
import type { ClientType, GovernmentSphere } from '../utils/contractDisplay';

export type ClientListStatus = 'active' | 'inactive';

export interface Client {
  id: number;
  accountId: number;
  type: ClientType;
  name: string;
  /** Só dígitos: CPF ou CNPJ. */
  document: string;
  sphere: GovernmentSphere | null;
  agency: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  active: boolean;
}

/** Nulo para quem não tem a permissão de contratos. */
export interface ClientContractsSummary {
  activeContracts: number;
  monthlyAmount: number;
  expiringSoon: boolean;
  overdue: boolean;
  readjustmentAvailable: boolean;
}

export interface ClientListItem extends Client {
  contracts: ClientContractsSummary | null;
}

export interface ClientsSummary {
  monthlyRecurring: number;
  expiringContracts: number;
  overdueCount: number;
  overdueAmount: number;
}

export interface ClientIncome {
  id: number;
  description: string;
  amount: number;
  grossAmount: number | null;
  receiptDate: string;
  status: string;
  contractId: number | null;
  classificationName: string | null;
}

/** Corpo do cadastro: textos como digitados; o servidor apara e confere. */
export interface ClientFormValues {
  type: ClientType;
  name: string;
  document: string;
  sphere: GovernmentSphere | null;
  agency: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

export interface ClientFilters {
  search: string;
  type: ClientType | null;
  status: ClientListStatus;
}

/** Mensagem do servidor para documento repetido na conta: a tela marca o campo. */
export const DUPLICATE_DOCUMENT_MESSAGE = 'Já existe um cliente com este documento';

export function fetchClients(accountId: number, filters: ClientFilters): Promise<ClientListItem[]> {
  const params = new URLSearchParams({ accountId: String(accountId), status: filters.status });
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.type) params.set('type', filters.type);
  return apiRequest<ClientListItem[]>(`/clients?${params.toString()}`);
}

export function fetchClientsSummary(accountId: number): Promise<ClientsSummary> {
  return apiRequest<ClientsSummary>(`/clients/summary?accountId=${accountId}`);
}

export function fetchClient(id: number): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}`);
}

export function createClient(accountId: number, values: ClientFormValues): Promise<Client> {
  return apiRequest<Client>('/clients', { method: 'POST', body: JSON.stringify({ ...values, accountId }) });
}

export function updateClient(id: number, values: ClientFormValues): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(values) });
}

export function setClientActive(id: number, active: boolean): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}/active`, { method: 'PUT', body: JSON.stringify({ active }) });
}

export function deleteClient(id: number): Promise<void> {
  return apiRequest<void>(`/clients/${id}`, { method: 'DELETE' });
}

export function fetchClientIncomes(id: number): Promise<ClientIncome[]> {
  return apiRequest<ClientIncome[]>(`/clients/${id}/incomes`);
}
