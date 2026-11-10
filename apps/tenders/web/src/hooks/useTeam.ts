import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import {
  createTeamUser,
  fetchTeam,
  removeTeamUserPhoto,
  updateTeamUser,
  uploadTeamUserPhoto,
} from '../services/settingsService';
import type { TendersApiError } from '../services/tendersApiError';
import type { NewTeamUser, TeamChange, TeamMember, TeamMemberChange, TeamUserUpdate } from '../types';

/** Colaboradores da conta (só o titular), com os dados de trabalho e o link da foto. */
export function useTeam() {
  return useQuery<TeamMember[], TendersApiError>({
    queryKey: tendersQueryKeys.team,
    queryFn: fetchTeam,
    // Os links das fotos duram pouco: a lista é buscada de novo sempre que o modal abre.
    staleTime: 0,
  });
}

/**
 * Cadastro, edição e foto dos colaboradores (só o titular). O cadastro mexe no valor da assinatura (mais um
 * usuário com acesso), então também atualiza a cobrança e o acesso; editar e trocar a foto só atualizam a lista.
 */
export function useTeamUserMutations() {
  const queryClient = useQueryClient();
  const refreshTeam = () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.team });

  const create = useMutation<TeamChange, TendersApiError, NewTeamUser>({
    mutationFn: createTeamUser,
    onSuccess: () => {
      void refreshTeam();
      void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.billingAll });
      void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.access });
    },
  });
  const update = useMutation<TeamMemberChange, TendersApiError, { userId: number; changes: TeamUserUpdate }>({
    mutationFn: ({ userId, changes }) => updateTeamUser(userId, changes),
    onSuccess: () => void refreshTeam(),
  });
  const uploadPhoto = useMutation<TeamMemberChange, TendersApiError, { userId: number; image: string }>({
    mutationFn: ({ userId, image }) => uploadTeamUserPhoto(userId, image),
    onSuccess: () => void refreshTeam(),
  });
  const removePhoto = useMutation<TeamMemberChange, TendersApiError, number>({
    mutationFn: removeTeamUserPhoto,
    onSuccess: () => void refreshTeam(),
  });

  return { create, update, uploadPhoto, removePhoto };
}
