import { useQuery } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import { apiJson } from '../services/tendersApi';

const PLAN_STATUSES_WITH_ACCESS = ['trial', 'ativo'];

/**
 * A troca de módulo só aparece para quem usa mais de um (escopo, seção 9.3):
 * o app de finanças exige plano em teste ou ativo.
 */
export function useFinanceAccess(enabled: boolean): boolean {
  const planStatus = useQuery({
    queryKey: tendersQueryKeys.planStatus,
    queryFn: () => apiJson<{ status?: string }>('/planos/status'),
    enabled,
    retry: false,
    staleTime: 3 * 60 * 1000,
  });
  return PLAN_STATUSES_WITH_ACCESS.includes(planStatus.data?.status ?? '');
}
