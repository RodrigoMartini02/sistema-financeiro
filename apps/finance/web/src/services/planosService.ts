import { apiRequest } from './apiClient';
import type { PlanTier } from '../utils/planFeatures';

/**
 * Resposta de GET /planos/status. Para membro ativo, é o plano do titular da
 * conta. `sem_teste`: cadastro feito por Licitações, que ainda não começou o
 * teste do FINGERENCE (startFinanceTrial).
 */
export interface PlanoStatus {
  status: 'trial' | 'ativo' | 'expirado' | 'sem_teste';
  plano_tipo: string | null;
  /** Nível do plano pago; nulo para o admin e para quem nunca assinou. */
  plano_nivel?: PlanTier | null;
  /** Recursos do Premium liberados (admin, teste grátis ou Premium ativo). */
  recursos_premium?: boolean;
  plano_expiracao: string | null;
  dias_restantes_trial: number | null;
  data_cadastro?: string;
  /** O plano é do titular: o membro não assina nem paga. */
  isAccountMember?: boolean;
}

export async function fetchPlanStatus(): Promise<PlanoStatus> {
  return apiRequest<PlanoStatus>('/planos/status');
}

/** Começa o teste de 15 dias do FINGERENCE (só a partir de `sem_teste`, uma vez). */
export async function startFinanceTrial(): Promise<void> {
  await apiRequest<unknown>('/planos/start-trial', { method: 'POST' });
}
