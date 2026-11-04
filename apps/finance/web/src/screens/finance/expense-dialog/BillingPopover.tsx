import { useRef, useState } from 'react';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { OptionRow } from '../entry-dialog/OptionRow';
import { RepeatEndField } from '../entry-dialog/RepeatEndField';
import { SEPARATOR, chevronStyle, ellipsisStyle, selectStyle } from '../entry-dialog/fieldStyles';
import { BILLING_LABELS, type BillingMenu } from './billingMenu';
import { MAX_INSTALLMENTS } from './draftState';
import { InstallmentCountField } from './InstallmentCountField';

interface BillingPopoverProps {
  menu: BillingMenu;
}

/**
 * Cobrança: não repete, parcelado, recorrente (só no crédito) ou fixa. O controle de cada opção fica na linha dela,
 * dentro do menu: a quantidade ao lado de "Parcelado" e o limite ao lado de "Fixa". O valor do parcelado (cada parcela
 * ou o total) e o valor à vista ficam na linha da despesa, em InstallmentValueFields.
 */
export function BillingPopover({ menu }: BillingPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const { installments, fixedEnd, pendingCount } = menu;

  // O número digitado vale ao sair do campo: tira o foco de dentro do painel antes de ele sair da tela.
  const close = () => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && panelContentRef.current?.contains(focused)) focused.blur();
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={`Cobrança: ${menu.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={selectStyle({ invalid: menu.invalid })}
      >
        <span style={ellipsisStyle}>{menu.label}</span>
        <span aria-hidden="true" style={chevronStyle}>▼</span>
      </button>

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={close} label="Cobrança" width={320} padding={6}>
        <div ref={panelContentRef}>
          <div role="radiogroup" aria-label="Cobrança" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {menu.options.map((type) => (
              <OptionRow key={type} label={BILLING_LABELS[type]} active={type === menu.value} onSelect={() => menu.onSelect(type)}>
                {type === 'installments' && installments && (
                  <InstallmentCountField
                    label="Número de parcelas"
                    value={installments.value}
                    min={installments.min}
                    max={MAX_INSTALLMENTS}
                    disabled={installments.disabled}
                    onChange={installments.onChange}
                  />
                )}
                {type === 'fixed' && fixedEnd && (
                  <RepeatEndField value={fixedEnd.value} onChange={fixedEnd.onChange} min={fixedEnd.min} invalid={fixedEnd.invalid} />
                )}
              </OptionRow>
            ))}
          </div>

          {menu.value === 'installments' && installments?.hint && (
            <p style={{ margin: '4px 8px 2px', fontSize: 11.5, color: C.textFaint }}>{installments.hint}</p>
          )}

          {pendingCount && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 8px 4px', padding: '8px 10px', border: `1px solid ${C.warnBorder}`, borderRadius: 8, background: C.warnBg, color: C.warn, fontSize: 12 }}>
              <span>Isso apaga ajustes e pagamentos marcados das parcelas acima da {pendingCount.count}ª.</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={pendingCount.onConfirm}
                  style={{ height: 26, padding: '0 10px', border: 'none', borderRadius: 13, background: C.primary, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={pendingCount.onCancel}
                  style={{ height: 26, padding: '0 10px', border: 'none', borderRadius: 13, background: 'transparent', color: C.textSoft, fontSize: 12, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {menu.value === 'monthly' && (
            <span style={{ display: 'block', padding: '10px 8px 6px', marginTop: 4, borderTop: `1px solid ${SEPARATOR}`, fontSize: 12, color: C.textSoft }}>
              A recorrência segue a fatura do cartão, até dezembro.
            </span>
          )}
        </div>
      </FloatingPanel>
    </>
  );
}
