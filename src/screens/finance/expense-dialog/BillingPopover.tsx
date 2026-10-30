import { useRef, useState, type KeyboardEvent } from 'react';
import type { ExpenseBillingType } from '../../../types/finance';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import type { DraftPatch, ExpenseDraft } from './draftState';
import { SEPARATOR, chevronStyle, ellipsisStyle, selectStyle } from '../entry-dialog/fieldStyles';

const BILLING_OPTIONS: ReadonlyArray<{ type: ExpenseBillingType; label: string }> = [
  { type: 'single', label: 'Não repete' },
  { type: 'installments', label: 'Parcelado' },
  { type: 'monthly', label: 'Recorrente' },
  { type: 'fixed', label: 'Fixa' },
];

export function billingLabel(draft: ExpenseDraft): string {
  if (draft.billingType === 'installments') return `${draft.installmentCount}x`;
  if (draft.billingType === 'fixed') return 'Fixa';
  return draft.billingType === 'monthly' ? 'Mensal' : 'Não repete';
}

const sectionStyle = {
  display: 'flex', flexDirection: 'column' as const, gap: 10, padding: '10px 8px 6px', marginTop: 4,
  borderTop: `1px solid ${SEPARATOR}`, fontSize: 12, color: C.textSoft,
};

const stepperButtonStyle = {
  width: 24, height: '100%', border: 'none', background: '#f1f5f9', color: C.textSoft, fontSize: 14, cursor: 'pointer',
};

interface BillingPopoverProps {
  draft: ExpenseDraft;
  /** "Recorrente" só no Crédito, com cartão de crédito cadastrado (canBeRecurring). */
  recurringAvailable: boolean;
  /** Nº de parcelas esperando confirmação, porque apagaria ajustes ou pagamentos. */
  pendingInstallmentCount: number | null;
  onUpdate: (patch: DraftPatch) => void;
  onSetInstallmentCount: (count: number, force: boolean) => void;
  onCancelInstallmentCount: () => void;
}

/**
 * Cobrança: não repete, parcelado (nº de parcelas) ou recorrente (só no crédito). O valor
 * do parcelado (cada parcela ou o total) e o valor à vista ficam na linha, em InstallmentValueFields.
 */
export function BillingPopover({
  draft, recurringAvailable, pendingInstallmentCount, onUpdate, onSetInstallmentCount, onCancelInstallmentCount,
}: BillingPopoverProps) {
  const [open, setOpen] = useState(false);
  const [countText, setCountText] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const options = BILLING_OPTIONS.filter((option) => option.type !== 'monthly' || recurringAvailable);

  const commitCount = () => {
    if (countText === null) return;
    setCountText(null);
    const count = Number.parseInt(countText, 10);
    if (Number.isFinite(count) && count !== draft.installmentCount) onSetInstallmentCount(count, false);
  };

  const handleCountKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitCount();
  };

  const cancelPending = () => {
    setCountText(null);
    onCancelInstallmentCount();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Cobrança: ${billingLabel(draft)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={selectStyle()}
      >
        <span style={ellipsisStyle}>{billingLabel(draft)}</span>
        <span aria-hidden="true" style={chevronStyle}>▼</span>
      </button>

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => { commitCount(); setOpen(false); }} label="Cobrança" width={300} padding={6}>
        <div role="radiogroup" aria-label="Cobrança" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {options.map((option) => {
            const active = option.type === draft.billingType;
            return (
              <button
                key={option.type}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onUpdate({ billingType: option.type })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, height: 28, padding: '0 8px', border: 'none', borderRadius: 8,
                  background: active ? C.panelBg : 'transparent', color: C.text, fontSize: 12, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 13, height: 13, flex: 'none', borderRadius: 7, boxShadow: 'inset 0 0 0 2px #fff',
                    border: `1.5px solid ${active ? C.primary : '#cbd5e1'}`, background: active ? C.primary : '#fff',
                  }}
                />
                {option.label}
              </button>
            );
          })}
        </div>

        {draft.billingType === 'installments' && (
          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', height: 28, border: `1px solid ${C.borderInput}`, borderRadius: 8, overflow: 'hidden' }}>
                <button type="button" aria-label="Menos uma parcela" onClick={() => onSetInstallmentCount(draft.installmentCount - 1, false)} style={stepperButtonStyle}>−</button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={countText ?? String(draft.installmentCount)}
                  onChange={(event) => setCountText(event.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={commitCount}
                  onKeyDown={handleCountKeyDown}
                  aria-label="Número de parcelas"
                  style={{ width: 38, height: '100%', border: 'none', boxShadow: 'none', textAlign: 'center', fontSize: 12, outline: 'none', fontVariantNumeric: 'tabular-nums', color: C.text }}
                />
                <button type="button" aria-label="Mais uma parcela" onClick={() => onSetInstallmentCount(draft.installmentCount + 1, false)} style={stepperButtonStyle}>+</button>
              </div>
              <span>parcelas</span>
            </div>

            {pendingInstallmentCount !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', border: `1px solid ${C.warnBorder}`, borderRadius: 8, background: C.warnBg, color: C.warn }}>
                <span>Isso apaga ajustes e pagamentos marcados das parcelas acima da {pendingInstallmentCount}ª.</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => { setCountText(null); onSetInstallmentCount(pendingInstallmentCount, true); }}
                    style={{ height: 26, padding: '0 10px', border: 'none', borderRadius: 13, background: C.primary, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={cancelPending}
                    style={{ height: 26, padding: '0 10px', border: 'none', borderRadius: 13, background: 'transparent', color: C.textSoft, fontSize: 12, cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {draft.billingType === 'monthly' && (
          <span style={sectionStyle}>A recorrência segue a fatura do cartão, até dezembro.</span>
        )}
        {draft.billingType === 'fixed' && (
          <span style={sectionStyle}>Gera previsões mensais até dezembro. Você confirma o valor de cada conta quando recebê-la.</span>
        )}
      </FloatingPanel>
    </>
  );
}
