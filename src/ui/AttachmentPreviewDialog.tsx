import { Dialog } from './dialog';
import { AttachmentSection } from './AttachmentSection';
import type { Attachment } from '../types/finance';

interface Props {
  open: boolean;
  title: string;
  anexos: Attachment[];
  onClose: () => void;
}

export function AttachmentPreviewDialog({ open, title, anexos, onClose }: Props) {
  return (
    <Dialog open={open} title="Anexos" description={title} onClose={onClose} size="sm">
      <AttachmentSection value={anexos} readonly />
    </Dialog>
  );
}
