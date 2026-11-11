import { useConfirm } from '@ui/context/ConfirmContext';
import type { DocumentActions } from '../components/DocumentCard';
import type { DocumentTypeInfo, VaultDocument } from '../types';
import { documentTitle } from '../utils/vault';
import { useDeleteVaultDocument, useOpenVaultDocument } from './useVault';

/**
 * As ações de um documento do cofre que as duas abas repetem: abrir o arquivo (link de vida curta) e excluir (com
 * confirmação). Editar muda de tela para tela (o formulário é de quem chama), então chega pronto em `onEdit`. `error` é a
 * mensagem da última ação que falhou.
 */
export function useVaultDocumentActions({
  types,
  storageAvailable,
  onEdit,
}: {
  types: readonly DocumentTypeInfo[] | undefined;
  storageAvailable: boolean;
  onEdit: (document: VaultDocument) => void;
}): { actions: DocumentActions; error: string | null } {
  const confirm = useConfirm();
  const remove = useDeleteVaultDocument();
  const opener = useOpenVaultDocument();

  const handleRemove = async (document: VaultDocument) => {
    const confirmed = await confirm({
      title: 'Excluir documento',
      message: `"${documentTitle(document, types)}" (${document.fileName}) sai do cofre e o arquivo é apagado. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (confirmed) remove.mutate(document.id);
  };

  return {
    actions: {
      onOpen: (document) => opener.open(document.id),
      openingId: opener.openingId,
      onEdit,
      onRemove: (document) => void handleRemove(document),
      storageAvailable,
    },
    error: (remove.error ?? opener.error)?.message ?? null,
  };
}
