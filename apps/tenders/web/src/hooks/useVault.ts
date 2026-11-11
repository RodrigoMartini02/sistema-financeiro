import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import {
  createVaultDocument,
  createVaultPerson,
  deleteVaultDocument,
  deleteVaultPerson,
  fetchVaultDocumentLink,
  fetchVaultDocuments,
  fetchVaultPeople,
  updateVaultDocument,
  updateVaultPerson,
} from '../services/vaultService';
import type {
  NewVaultDocument,
  NewVaultPerson,
  VaultDocument,
  VaultDocumentChanges,
  VaultDocumentLink,
  VaultDocumentList,
  VaultPerson,
  VaultPersonChanges,
  VaultPersonList,
} from '../types';

// Cofre de documentos. A lista de documentos e a de pessoas ficam sob o mesmo prefixo: guardar, alterar ou apagar um
// documento ou uma pessoa lê as duas de novo (a pessoa mostra quantos documentos tem, e apagá-la leva os documentos).

/** Os documentos que a pessoa pode ver: os da empresa e, só para o titular, os de pessoa. */
export function useVaultDocuments() {
  return useQuery<VaultDocumentList, TendersApiError>({ queryKey: tendersQueryKeys.vaultDocuments, queryFn: fetchVaultDocuments });
}

/** As pessoas do cofre; `enabled` fica falso para quem não é titular (a API as recusa). */
export function useVaultPeople(enabled: boolean) {
  return useQuery<VaultPersonList, TendersApiError>({ queryKey: tendersQueryKeys.vaultPeople, queryFn: fetchVaultPeople, enabled });
}

function useInvalidateVault() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.vault });
}

export function useCreateVaultDocument() {
  const invalidate = useInvalidateVault();
  return useMutation<VaultDocument, TendersApiError, NewVaultDocument>({ mutationFn: createVaultDocument, onSuccess: invalidate });
}

export function useUpdateVaultDocument() {
  const invalidate = useInvalidateVault();
  return useMutation<VaultDocument, TendersApiError, { id: number; changes: VaultDocumentChanges }>({
    mutationFn: ({ id, changes }) => updateVaultDocument(id, changes),
    onSuccess: invalidate,
  });
}

export function useDeleteVaultDocument() {
  const invalidate = useInvalidateVault();
  return useMutation<{ id: number }, TendersApiError, number>({ mutationFn: deleteVaultDocument, onSuccess: invalidate });
}

/**
 * Abrir o arquivo de um documento: pede o link de vida curta e o abre numa aba nova. A aba é aberta já no clique (antes de o
 * link chegar) para o navegador não a tratar como janela indesejada; se o pedido falhar, ela é fechada e o erro fica em `error`.
 */
export function useOpenVaultDocument() {
  const mutation = useMutation<VaultDocumentLink, TendersApiError, number>({ mutationFn: fetchVaultDocumentLink });
  const { mutate } = mutation;
  const open = (documentId: number) => {
    const tab = window.open('', '_blank');
    if (tab) {
      // A aba nova não precisa (nem deve) enxergar esta.
      tab.opener = null;
    }
    mutate(documentId, {
      onSuccess: (link) => {
        if (tab) {
          tab.location.href = link.url;
          return;
        }
        // Navegador bloqueou a aba nova: abre nesta mesma, o botão Voltar traz o cofre de volta.
        window.location.assign(link.url);
      },
      onError: () => tab?.close(),
    });
  };
  return { open, isOpening: mutation.isPending, openingId: mutation.isPending ? mutation.variables : null, error: mutation.error };
}

export function useCreateVaultPerson() {
  const invalidate = useInvalidateVault();
  return useMutation<VaultPerson, TendersApiError, NewVaultPerson>({ mutationFn: createVaultPerson, onSuccess: invalidate });
}

export function useUpdateVaultPerson() {
  const invalidate = useInvalidateVault();
  return useMutation<VaultPerson, TendersApiError, { id: number; changes: VaultPersonChanges }>({
    mutationFn: ({ id, changes }) => updateVaultPerson(id, changes),
    onSuccess: invalidate,
  });
}

export function useDeleteVaultPerson() {
  const invalidate = useInvalidateVault();
  return useMutation<{ id: number; removedDocuments: number }, TendersApiError, number>({
    mutationFn: deleteVaultPerson,
    onSuccess: invalidate,
  });
}
