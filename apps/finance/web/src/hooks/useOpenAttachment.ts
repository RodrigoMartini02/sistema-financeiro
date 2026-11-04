import { useState } from 'react';
import { openAttachment } from '../services/attachmentsService';

/** Abre o arquivo de um anexo numa aba nova e guarda o aviso se não der (para listas só de leitura ou de lançamentos). */
export function useOpenAttachment() {
  const [error, setError] = useState('');
  return {
    error,
    open: (attachment: { id: string }) => {
      setError('');
      openAttachment(attachment.id).catch((failure: Error) => setError(failure.message));
    },
  };
}
