import { useQuery } from '@tanstack/react-query';
import { fetchPlanStatus } from '../services/planosService';
import { queryKeys } from '../services/queryKeys';
import { hasPremiumFeatures } from '../utils/planFeatures';

interface UsePlanFeaturesOptions {
  enabled?: boolean;
}

/** Recursos do plano de quem está logado (para membro, o plano do titular). */
export function usePlanFeatures({ enabled = true }: UsePlanFeaturesOptions = {}) {
  const planQuery = useQuery({
    queryKey: queryKeys.planStatus,
    queryFn: fetchPlanStatus,
    enabled,
    staleTime: 3 * 60 * 1000,
  });

  return { premium: hasPremiumFeatures(planQuery.data) };
}
