import { useRef, useState } from 'react';
import { MONTH_NAMES } from '../../../types/finance';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { SEPARATOR, chevronStyle, ellipsisStyle, fieldStyle, selectStyle } from '../entry-dialog/fieldStyles';
import { MAX_REPLICAS, defaultRepeatUntil, monthLabel, receiptDateIso, replicaCount } from './draftRules';
import type { IncomeDraft, IncomeDraftPatch } from './draftState';

interface RepeatPopoverProps {
  draft: IncomeDraft;
  todayIso: string;
  invalid: boolean;
  onUpdate: (patch: IncomeDraftPatch) => void;
}

/** "Repetir": não repete, ou uma receita por mês até o mês escolhido (gravadas juntas pelo servidor). */
export function RepeatPopover({ draft, todayIso, invalid, onUpdate }: RepeatPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const repeatUntil = draft.repeatUntil;
  const replicas = replicaCount(draft, todayIso);
  const label = repeatUntil ? `Até ${monthLabel(repeatUntil.month, repeatUntil.year)}` : 'Não repete';
  const receiptYear = Number((receiptDateIso(draft, todayIso) || todayIso).slice(0, 4));
  const years = [0, 1, 2, 3].map((offset) => receiptYear + offset);

  const options = [
    { active: !repeatUntil, label: 'Não repete', choose: () => onUpdate({ repeatUntil: null }) },
    {
      active: !!repeatUntil,
      label: 'Todo mês até',
      choose: () => onUpdate((current) => ({ repeatUntil: current.repeatUntil ?? defaultRepeatUntil(current, todayIso) })),
    },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Repetir: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={selectStyle({ invalid })}
      >
        <span style={ellipsisStyle}>{label}</span>
        <span aria-hidden="true" style={chevronStyle}>▼</span>
      </button>

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} label="Repetir" width={290} padding={6}>
        <div role="radiogroup" aria-label="Repetir" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={option.active}
              onClick={option.choose}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, height: 28, padding: '0 8px', border: 'none', borderRadius: 8,
                background: option.active ? C.panelBg : 'transparent', color: C.text, fontSize: 12, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 13, height: 13, flex: 'none', borderRadius: 7, boxShadow: 'inset 0 0 0 2px #fff',
                  border: `1.5px solid ${option.active ? C.primary : '#cbd5e1'}`, background: option.active ? C.primary : '#fff',
                }}
              />
              {option.label}
            </button>
          ))}
        </div>

        {repeatUntil && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 8px 6px', marginTop: 4, borderTop: `1px solid ${SEPARATOR}`, fontSize: 12, color: C.textSoft }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={repeatUntil.month}
                onChange={(event) => onUpdate({ repeatUntil: { month: Number(event.target.value), year: repeatUntil.year } })}
                aria-label="Mês final"
                style={{ ...fieldStyle(), flex: 1 }}
              >
                {MONTH_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
              <select
                value={repeatUntil.year}
                onChange={(event) => onUpdate({ repeatUntil: { month: repeatUntil.month, year: Number(event.target.value) } })}
                aria-label="Ano final"
                style={{ ...fieldStyle(), width: 80 }}
              >
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <span style={{ color: replicas >= 1 && replicas <= MAX_REPLICAS ? C.textSoft : C.danger }}>
              {replicas < 1
                ? 'Escolha um mês depois do da receita.'
                : replicas > MAX_REPLICAS
                  ? `No máximo ${MAX_REPLICAS} meses depois da receita.`
                  : `${replicas + 1} lançamentos, um por mês no mesmo dia (ou no último dia dos meses mais curtos).`}
            </span>
          </div>
        )}
      </FloatingPanel>
    </>
  );
}
