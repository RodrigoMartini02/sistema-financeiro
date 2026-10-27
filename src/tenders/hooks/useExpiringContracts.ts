import { useQuery } from '@tanstack/react-query';
import { fetchExpiringContracts } from '../services/overviewService';
import { tendersQueryKeys } from '../services/queryKeys';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { ExpiringContractsView } from '../types';

// Contratos que vencem, do Início. Leem o armazém do R2, então ficam fora do painel: o Início abre sem esperar por eles,
// e a consulta se repete só depois de alguns minutos. Com o armazém sendo atualizado não é falha: tenta de novo sozinho.

const EXPIRING_STALE_MS = 5 * 60 * 1000;
const STORE_UPDATING_RETRY_MS = 15_000;

export function useExpiringContracts() {
  return useQuery<ExpiringContractsView, TendersApiError>({
    queryKey: tendersQueryKeys.dashboardContracts,
    queryFn: fetchExpiringContracts,
    staleTime: EXPIRING_STALE_MS,
    refetchInterval: (query) => (isContractStoreUpdating(query.state.error) ? STORE_UPDATING_RETRY_MS : false),
  });
}
