import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addCompetitor, fetchCompetitorSummaries, fetchCompetitors, patchCompetitor, removeCompetitor } from '../services/competitorsService';
import { tendersQueryKeys } from '../services/queryKeys';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { Competitor, CompetitorList, CompetitorSummaryList } from '../types';

// Concorrentes monitorados da pessoa. A lista é só do Postgres e nunca espera o armazém; os números de cada concorrente
// (contratos, vigentes, novos em 30 dias, nome) vêm do armazém e repetem a cada 15 s enquanto ele estiver atualizando,
// como na página do CNPJ. Depois de mudar um concorrente, a lista e os números são lidos de novo.

const SUMMARY_STALE_MS = 5 * 60_000;
const UPDATING_RETRY_MS = 15_000;

export function useCompetitors() {
  return useQuery<CompetitorList, TendersApiError>({ queryKey: tendersQueryKeys.competitorList, queryFn: fetchCompetitors });
}

/** Os números do armazém; `enabled` fica falso sem concorrentes, para não consultar à toa. */
export function useCompetitorSummaries(enabled: boolean) {
  return useQuery<CompetitorSummaryList, TendersApiError>({
    queryKey: tendersQueryKeys.competitorSummary,
    queryFn: fetchCompetitorSummaries,
    enabled,
    staleTime: SUMMARY_STALE_MS,
    refetchInterval: (query) => (isContractStoreUpdating(query.state.error) ? UPDATING_RETRY_MS : false),
  });
}

function useInvalidateCompetitors() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.competitors });
}

/** Acompanhar um CNPJ (com apelido opcional). */
export function useAddCompetitor() {
  const invalidate = useInvalidateCompetitors();
  return useMutation<Competitor, TendersApiError, { cnpj: string; nickname?: string }>({
    mutationFn: addCompetitor,
    onSuccess: invalidate,
  });
}

export interface PatchCompetitorVariables {
  cnpj: string;
  changes: { nickname?: string | null; notify?: boolean };
}

/** Apelido e/ou aviso de contrato novo. */
export function usePatchCompetitor() {
  const invalidate = useInvalidateCompetitors();
  return useMutation<Competitor, TendersApiError, PatchCompetitorVariables>({
    mutationFn: ({ cnpj, changes }) => patchCompetitor(cnpj, changes),
    onSettled: invalidate,
  });
}

/** Deixar de acompanhar. */
export function useRemoveCompetitor() {
  const invalidate = useInvalidateCompetitors();
  return useMutation<{ cnpj: string }, TendersApiError, string>({
    mutationFn: removeCompetitor,
    onSuccess: invalidate,
  });
}
