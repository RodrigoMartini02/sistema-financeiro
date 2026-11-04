import { useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useOpenAttachment } from '../../../hooks/useOpenAttachment';
import { uploadAttachment } from '../../../services/attachmentsService';
import type { AttachmentSummary } from '../../../types/attachment';
import { AttachmentsField } from '../../../ui/AttachmentsField';
import { C } from '@ui/components/dialogFormTokens';
import { FloatingPanel } from '@ui/components/FloatingPanel';
import { INVALID_BORDER } from './fieldStyles';

interface AttachmentsPopoverProps {
  ownerType: 'expense' | 'income';
  /** Os comprovantes do lançamento: os que ele já tinha e os que acabaram de subir (a lista que será salva). */
  attachments: AttachmentSummary[];
  onChange: (attachments: AttachmentSummary[]) => void;
  /** Nome do botão e do painel ("Comprovantes", "Comprovantes e nota fiscal"). */
  label: string;
  /** Acende o botão além dos anexos (a despesa acende com a nota fiscal preenchida). */
  highlighted?: boolean;
  invalid?: boolean;
  /** Conteúdo abaixo dos anexos, como a nota fiscal da despesa na conta PJ. */
  children?: ReactNode;
}

/**
 * Clipe da linha: lista de comprovantes e, quando houver, o conteúdo extra. O arquivo sobe ao ser escolhido e fica
 * pendente no servidor até o lançamento ser salvo; tirar da lista não apaga nada até lá.
 */
export function AttachmentsPopover({ ownerType, attachments, onChange, label, highlighted = false, invalid = false, children }: AttachmentsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { open: openFile, error: openError } = useOpenAttachment();
  const count = attachments.length;
  const filled = count > 0 || highlighted;

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      // Cada arquivo entra na lista assim que sobe; se um falhar, os anteriores ficam.
      let current = attachments;
      for (const file of files) {
        current = [...current, await uploadAttachment(ownerType, file)];
        onChange(current);
      }
    },
    onError: (failure: Error) => setUploadError(failure.message),
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, width: 28, height: 28, padding: 0,
          border: `1px solid ${invalid ? INVALID_BORDER : filled ? C.primarySoftBorder : C.borderInput}`, borderRadius: 8,
          background: filled ? C.primarySoft : '#fff', color: filled ? C.primaryDark : C.textSoft,
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        {count > 0 && count}
      </button>

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} label={label} width={320} align="end">
        <AttachmentsField
          ownerType={ownerType}
          title="Comprovantes"
          items={attachments}
          inputLabel="Anexar comprovante"
          isUploading={upload.isPending}
          error={uploadError || openError}
          onAddFiles={(files) => {
            setUploadError('');
            upload.mutate(files);
          }}
          // Durante o envio a lista está sendo montada: remover agora desfaria o envio que está chegando.
          onRemove={(item) => {
            if (!upload.isPending) onChange(attachments.filter((attachment) => attachment.id !== item.id));
          }}
          onOpen={openFile}
        />
        {children}
      </FloatingPanel>
    </>
  );
}
