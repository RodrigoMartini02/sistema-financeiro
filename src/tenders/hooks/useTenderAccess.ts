import { useQuery } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import { tendersRequest } from '../services/tendersApi';
import type { TendersApiError } from '../services/tendersApiError';
import type { TendersPermissions } from '../utils/navigation';

export interface TenderAccount {
  id: number;
  name: string;
  type: 'pessoal' | 'empresa';
}

/** Resposta de GET /api/tenders/access. */
export interface TenderAccess {
  account: TenderAccount;
  role: 'TITULAR' | 'COLABORADOR';
  isPlatformAdmin: boolean;
  permissions: TendersPermissions;
  accounts: TenderAccount[];
}

/** Conta, papel e permissões no módulo. 404 (conta sem o módulo) e 403 (sem acesso) não repetem. */
export function useTenderAccess(enabled: boolean) {
  return useQuery<TenderAccess, TendersApiError>({
    queryKey: tendersQueryKeys.access,
    queryFn: () => tendersRequest<TenderAccess>('/access'),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
