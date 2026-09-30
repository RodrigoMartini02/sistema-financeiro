import { useRef, useState } from 'react';
import { AttachmentSection } from '../../../ui/AttachmentSection';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { DateCell } from './DateCell';
import type { DraftPatch, ExpenseDraft } from './draftState';
import { INVALID_BORDER, SEPARATOR, fieldStyle } from './fieldStyles';

interface AttachmentsPopoverProps {
  draft: ExpenseDraft;
  /** Conta PJ: a nota fiscal fica no mesmo painel. */
  isCompany: boolean;
  invalid: boolean;
  todayIso: string;
  onUpdate: (patch: DraftPatch) => void;
}

/** Clipe da linha: comprovantes e, na conta PJ, número e emissão da nota fiscal. */
export function AttachmentsPopover({ draft, isCompany, invalid, todayIso, onUpdate }: AttachmentsPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = draft.attachments.length;
  const filled = count > 0 || draft.invoiceNumber.trim() !== '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        title={isCompany ? 'Comprovantes e nota fiscal' : 'Comprovantes'}
        aria-label={isCompany ? 'Comprovantes e nota fiscal' : 'Comprovantes'}
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

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} label="Comprovantes" width={320} align="end">
        <AttachmentSection title="Comprovantes" value={draft.attachments} onChange={(attachments) => onUpdate({ attachments })} />

        {isCompany && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: `1px solid ${SEPARATOR}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
              Nota fiscal <span style={{ fontWeight: 400, color: C.textFaint }}>· opcional</span>
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px', gap: 6 }}>
              <input
                type="text"
                value={draft.invoiceNumber}
                onChange={(event) => onUpdate({ invoiceNumber: event.target.value.slice(0, 50) })}
                maxLength={50}
                placeholder="Número da NF"
                aria-label="Número da nota fiscal"
                style={fieldStyle()}
              />
              <DateCell
                label="Data de emissão da nota fiscal"
                value={draft.invoiceDate}
                onChange={(text) => onUpdate({ invoiceDate: text })}
                todayIso={todayIso}
                placeholder="emissão"
                invalid={invalid}
              />
            </div>
          </div>
        )}
      </FloatingPanel>
    </>
  );
}
