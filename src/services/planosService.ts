import { apiRequest } from './apiClient';
import type { PlanTier } from '../utils/planFeatures';

/** Resposta de GET /planos/status. Para membro ativo, é o plano do titular da conta. */
export interface PlanoStatus {
  status: 'trial' | 'ativo' | 'expirado';
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
