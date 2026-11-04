import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useConfirm } from '@ui/context/ConfirmContext';
import { deleteAttachment, openAttachment, uploadAttachment } from '../services/attachmentsService';
import type { AttachmentOwnerType } from '../utils/attachmentRules';

interface Options {
  ownerType: AttachmentOwnerType;
  /** Id do dono, que já existe quando o anexo é de contrato ou produto. */
  ownerId: number | string;
  /** Depois de enviar ou apagar: quem mostra a lista de anexos busca de novo. */
  onChanged: () => void;
}

/** Enviar, abrir e remover os anexos de um dono que já existe (contrato ou produto), com o aviso de erro. */
export function useAttachmentActions({ ownerType, ownerId, onChanged }: Options) {
  const confirm = useConfirm();
  const [error, setError] = useState('');

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        await uploadAttachment(ownerType, file, ownerId);
      }
    },
    onSuccess: onChanged,
    // Os arquivos anteriores à falha já foram enviados: a lista se atualiza mesmo assim.
    onError: (failure: Error) => {
      setError(failure.message);
      onChanged();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => deleteAttachment(attachmentId),
    onSuccess: onChanged,
    onError: (failure: Error) => setError(failure.message),
  });

  return {
    error,
    isUploading: uploadMutation.isPending,
    addFiles: (files: File[]) => {
      setError('');
      uploadMutation.mutate(files);
    },
    open: (attachment: { id: string }) => {
      setError('');
      openAttachment(attachment.id).catch((failure: Error) => setError(failure.message));
    },
    remove: async (attachment: { id: string; name: string }) => {
      const confirmed = await confirm({ title: 'Remover anexo', message: `Remover "${attachment.name}"?`, confirmLabel: 'Remover' });
      if (confirmed) {
        setError('');
        deleteMutation.mutate(attachment.id);
      }
    },
  };
}
