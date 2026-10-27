import type { DashboardView, DomainLists, ExpiringContractsView } from '../types';
import { tendersRequest } from './tendersApi';

// Painel do Início e listas de apoio (modalidades, UFs e municípios).

export function fetchDashboard(): Promise<DashboardView> {
  return tendersRequest<DashboardView>('/dashboard');
}

export function fetchDomainLists(): Promise<DomainLists> {
  return tendersRequest<DomainLists>('/domains');
}

/** Contratos que vencem em 30, 60 e 90 dias (lê o armazém de contratos, por isso fica fora do painel). */
export function fetchExpiringContracts(): Promise<ExpiringContractsView> {
  return tendersRequest<ExpiringContractsView>('/dashboard/contracts');
}
