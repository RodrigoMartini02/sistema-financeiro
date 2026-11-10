import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import {
  fetchOwnerProfile,
  removeOwnerPhoto,
  updateOwnerProfile,
  uploadOwnerPhoto,
} from '../services/settingsService';
import type { TendersApiError } from '../services/tendersApiError';
import type { OwnerProfileChange, OwnerProfileUpdate } from '../types';
import { rememberLoggedUserName } from '../utils/loggedUser';

/** Perfil do titular (nome, telefone e foto). Só ele o lê: com `enabled` falso, nada é pedido. */
export function useOwnerProfile(enabled: boolean) {
  return useQuery<OwnerProfileChange, TendersApiError>({
    queryKey: tendersQueryKeys.ownerProfile,
    queryFn: fetchOwnerProfile,
    enabled,
    // Os links das fotos duram pouco: o perfil é buscado de novo sempre que o modal abre.
    staleTime: 0,
  });
}

/** Edição do perfil e da foto do titular. O nome novo vai também para a sessão, que alimenta a barra superior. */
export function useOwnerProfileMutations() {
  const queryClient = useQueryClient();
  const store = (change: OwnerProfileChange) => queryClient.setQueryData(tendersQueryKeys.ownerProfile, change);

  const update = useMutation<OwnerProfileChange, TendersApiError, OwnerProfileUpdate>({
    mutationFn: updateOwnerProfile,
    onSuccess: (change) => {
      store(change);
      rememberLoggedUserName(change.profile.name, change.profile.lastName);
    },
  });
  const uploadPhoto = useMutation<OwnerProfileChange, TendersApiError, string>({
    mutationFn: uploadOwnerPhoto,
    onSuccess: store,
  });
  const removePhoto = useMutation<OwnerProfileChange, TendersApiError, void>({
    mutationFn: removeOwnerPhoto,
    onSuccess: store,
  });

  return { update, uploadPhoto, removePhoto };
}
