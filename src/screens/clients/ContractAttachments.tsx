import { useQueryClient } from '@tanstack/react-query';
import { useAttachmentActions } from '../../hooks/useAttachmentActions';
import { invalidateIncomeQueries } from '../../services/queryKeys';
import type { AttachmentSummary } from '../../services/attachmentsService';
import { AttachmentsField } from '../../ui/AttachmentsField';

/** Anexos da ficha do contrato: enviar, abrir e remover. */
export function ContractAttachments({ contractId, attachments }: { contractId: number; attachments: AttachmentSummary[] }) {
  const qc = useQueryClient();
  const actions = useAttachmentActions({
    ownerType: 'contract',
    ownerId: contractId,
    onChanged: () => invalidateIncomeQueries(qc),
  });

  return (
    <AttachmentsField
      ownerType="contract"
      title="Anexos"
      items={attachments}
      onAddFiles={actions.addFiles}
      onRemove={actions.remove}
      onOpen={actions.open}
      isUploading={actions.isUploading}
      error={actions.error}
      inputLabel="Anexar arquivo ao contrato"
    />
  );
}
