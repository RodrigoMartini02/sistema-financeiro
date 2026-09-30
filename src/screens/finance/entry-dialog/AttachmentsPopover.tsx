import { useRef, useState, type ReactNode } from 'react';
import type { Attachment } from '../../../types/finance';
import { AttachmentSection } from '../../../ui/AttachmentSection';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { INVALID_BORDER } from './fieldStyles';

interface AttachmentsPopoverProps {
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  /** Nome do botão e do painel ("Comprovantes", "Comprovantes e nota fiscal"). */
  label: string;
  /** Acende o botão além dos anexos (a despesa acende com a nota fiscal preenchida). */
  highlighted?: boolean;
  invalid?: boolean;
  /** Conteúdo abaixo dos anexos, como a nota fiscal da despesa na conta PJ. */
  children?: ReactNode;
}

/** Clipe da linha: lista de comprovantes e, quando houver, o conteúdo extra. */
export function AttachmentsPopover({ attachments, onChange, label, highlighted = false, invalid = false, children }: AttachmentsPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = attachments.length;
  const filled = count > 0 || highlighted;

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
        <AttachmentSection title="Comprovantes" value={attachments} onChange={onChange} />
        {children}
      </FloatingPanel>
    </>
  );
}
