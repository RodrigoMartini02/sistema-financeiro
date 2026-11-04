import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import { setTeamMemberAccess } from '../services/settingsService';
import type { TendersApiError } from '../services/tendersApiError';
import type { TeamChange } from '../types';

export interface TeamAccessVariables {
  userId: number;
  hasAccess: boolean;
}

/** Libera ou retira o acesso de um colaborador ao módulo (só o titular); o valor da assinatura acompanha. */
export function useTeamAccess() {
  const queryClient = useQueryClient();
  return useMutation<TeamChange, TendersApiError, TeamAccessVariables>({
    mutationFn: ({ userId, hasAccess }) => setTeamMemberAccess(userId, hasAccess),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.team });
      void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.billingAll });
      void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.access });
    },
  });
}
