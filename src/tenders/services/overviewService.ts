import type { DashboardView, DomainLists } from '../types';
import { tendersRequest } from './tendersApi';

// Painel do Início e listas de apoio (modalidades, UFs e municípios).

export function fetchDashboard(): Promise<DashboardView> {
  return tendersRequest<DashboardView>('/dashboard');
}

export function fetchDomainLists(): Promise<DomainLists> {
  return tendersRequest<DomainLists>('/domains');
}
