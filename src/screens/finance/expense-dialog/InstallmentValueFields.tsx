import { C } from '../../../ui/dialogFormTokens';
import { MoneyCell } from '../entry-dialog/MoneyCell';
import { SEPARATOR } from '../entry-dialog/fieldStyles';
import type { DraftPatch, ExpenseDraft } from './draftState';

const VALUE_MODES = [
  { isTotal: false, label: 'Por parcela' },
  { isTotal: true, label: 'Total' },
] as const;

const labelStyle = { fontSize: 11, fontWeight: 600, color: C.chipOffText, whiteSpace: 'nowrap' } as const;

interface InstallmentValueFieldsProps {
  draft: ExpenseDraft;
  onUpdate: (patch: DraftPatch) => void;
}

/**
 * Parcelado: o que o valor da linha representa (cada parcela ou o total) e o valor à vista,
 * opcional. O que a soma das parcelas passa do à vista é gravado como juros, dividido entre
 * as parcelas, e entra em "juros e taxas" do painel.
 */
export function InstallmentValueFields({ draft, onUpdate }: InstallmentValueFieldsProps) {
  return (
    <div className="col-span-full" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 20px', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={labelStyle}>Valor informado</span>
        <div role="radiogroup" aria-label="Valor informado" style={{ display: 'flex', gap: 2, padding: 2, background: SEPARATOR, borderRadius: 8 }}>
          {VALUE_MODES.map(({ isTotal, label }) => {
            const active = draft.amountIsTotal === isTotal;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onUpdate({ amountIsTotal: isTotal })}
                style={{
                  height: 24, padding: '0 12px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: active ? '#fff' : 'transparent', color: active ? C.text : C.textSoft,
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)' : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Valor sem juros. O que a soma das parcelas passa dele é gravado como juros.">
        <span style={labelStyle}>
          À vista <span style={{ fontWeight: 400, color: C.textFaint }}>(opcional)</span>
        </span>
        <div style={{ width: 120 }}>
          <MoneyCell label="Valor à vista" valueCents={draft.cashPriceCents} onChange={(cents) => onUpdate({ cashPriceCents: cents })} />
        </div>
      </div>
    </div>
  );
}
