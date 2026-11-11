import type { Competitor, CompetitorList, CompetitorSummaryList } from '../types';
import { tendersRequest } from './tendersApi';

// Concorrentes monitorados da pessoa na conta (plano .plans/licitacoes-4-concorrentes-monitorados.md). A lista é só do
// Postgres; os números de cada concorrente vêm do armazém de contratos e podem responder "atualizando" (503).

export function fetchCompetitors(): Promise<CompetitorList> {
  return tendersRequest<CompetitorList>('/competitors');
}

export function fetchCompetitorSummaries(): Promise<CompetitorSummaryList> {
  return tendersRequest<CompetitorSummaryList>('/competitors/summary');
}

/** Idempotente: quem já acompanha o CNPJ continua como está. */
export function addCompetitor(body: { cnpj: string; nickname?: string }): Promise<Competitor> {
  return tendersRequest<Competitor>('/competitors', { method: 'POST', body: JSON.stringify(body) });
}

/** Campo ausente mantém; apelido vazio limpa. */
export function patchCompetitor(cnpj: string, changes: { nickname?: string | null; notify?: boolean }): Promise<Competitor> {
  return tendersRequest<Competitor>(`/competitors/${cnpj}`, { method: 'PATCH', body: JSON.stringify(changes) });
}

export function removeCompetitor(cnpj: string): Promise<{ cnpj: string }> {
  return tendersRequest<{ cnpj: string }>(`/competitors/${cnpj}`, { method: 'DELETE' });
}
