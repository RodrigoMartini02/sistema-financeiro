import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import { setTeamMemberAccess } from '../services/settingsService';
import type { TendersApiError } from '../services/tendersApiError';
import type { TeamMember } from '../types';

export interface TeamAccessVariables {
  userId: number;
  hasAccess: boolean;
}

/** Libera ou retira o acesso de um colaborador ao módulo (só o titular). */
export function useTeamAccess() {
  const queryClient = useQueryClient();
  return useMutation<TeamMember, TendersApiError, TeamAccessVariables>({
    mutationFn: ({ userId, hasAccess }) => setTeamMemberAccess(userId, hasAccess),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.team }),
  });
}
