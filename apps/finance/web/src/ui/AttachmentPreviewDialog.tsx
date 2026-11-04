import { useOpenAttachment } from '../hooks/useOpenAttachment';
import type { AttachmentSummary } from '../types/attachment';
import { AttachmentList } from './AttachmentsField';
import { Dialog } from './dialog';

interface Props {
  open: boolean;
  title: string;
  attachments: readonly AttachmentSummary[];
  onClose: () => void;
}

/** Os anexos de um lançamento, só para abrir (a edição é no diálogo do lançamento). */
export function AttachmentPreviewDialog({ open, title, attachments, onClose }: Props) {
  const { open: openFile, error } = useOpenAttachment();
  return (
    <Dialog open={open} title="Anexos" description={title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AttachmentList items={attachments} onOpen={openFile} error={error} />
      </div>
    </Dialog>
  );
}
