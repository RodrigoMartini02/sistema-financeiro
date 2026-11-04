import { useRef, useState } from 'react';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { OptionRow } from '../entry-dialog/OptionRow';
import { RepeatEndField } from '../entry-dialog/RepeatEndField';
import { chevronStyle, ellipsisStyle, selectStyle } from '../entry-dialog/fieldStyles';
import { receiptDateIso } from './draftRules';
import type { IncomeDraft, IncomeDraftPatch } from './draftState';

interface RepeatPopoverProps {
  draft: IncomeDraft;
  todayIso: string;
  invalid: boolean;
  fixedOnly?: boolean;
  onUpdate: (patch: IncomeDraftPatch) => void;
}

/** A repetição pertence ao lançamento; o limite fica na própria opção Fixa. */
export function RepeatPopover({ draft, todayIso, invalid, fixedOnly = false, onUpdate }: RepeatPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const options = fixedOnly ? ['fixed'] as const : ['single', 'fixed'] as const;
  const label = draft.billingType === 'fixed' ? 'Fixa' : 'Não repete';
  const firstMonth = (receiptDateIso(draft, todayIso) || todayIso).slice(0, 7);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-label={`Repetir: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={selectStyle({ invalid })}
      >
        <span style={ellipsisStyle}>{label}</span>
        <span aria-hidden="true" style={chevronStyle}>▼</span>
      </button>
      <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} label="Repetir" width={320} padding={6}>
        <div role="radiogroup" aria-label="Repetir" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {options.map(type => (
            <OptionRow key={type} label={type === 'fixed' ? 'Fixa' : 'Não repete'} active={type === draft.billingType}
              onSelect={() => onUpdate({ billingType: type })}>
              {type === 'fixed' && (
                <RepeatEndField value={draft.endMonth} onChange={endMonth => onUpdate({ endMonth })}
                  min={draft.fixedIncomeId !== undefined ? '2000-01' : firstMonth} max="2100-12" invalid={invalid} />
              )}
            </OptionRow>
          ))}
        </div>
      </FloatingPanel>
    </>
  );
}
