import { C, useMoneyInput } from '../../../ui/dialogFormTokens';
import { FOCUS_WITHIN_CLASS, fieldStyle } from './fieldStyles';

interface MoneyCellProps {
  valueCents: number | null;
  onChange: (cents: number | null) => void;
  /** Chamado depois do valor final, ao sair do campo. */
  onBlur?: () => void;
  label: string;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
  disabled?: boolean;
  adjusted?: boolean;
  height?: number;
  title?: string;
}

/** Valor em R$ da grade. O modal guarda centavos; o campo mostra e lê reais. */
export function MoneyCell({
  valueCents, onChange, onBlur, label, placeholder = '0,00', suffix, invalid, disabled, adjusted, height, title,
}: MoneyCellProps) {
  const { exibido, handleChange, handleBlur } = useMoneyInput(
    valueCents !== null ? valueCents / 100 : undefined,
    (reais) => {
      const cents = reais > 0 ? Math.round(reais * 100) : null;
      if (cents !== valueCents) onChange(cents);
    },
  );

  return (
    <div
      className={FOCUS_WITHIN_CLASS}
      title={title}
      style={{ ...fieldStyle({ invalid, disabled, adjusted, height }), display: 'flex', alignItems: 'center', gap: 4 }}
    >
      <span style={{ fontSize: 11, color: C.textFaint }}>R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={exibido}
        onChange={handleChange}
        onBlur={() => {
          handleBlur();
          onBlur?.();
        }}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        style={{
          flex: 1, minWidth: 0, width: '100%', padding: 0, border: 'none', background: 'transparent', outline: 'none',
          boxShadow: 'none', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.text,
          cursor: disabled ? 'not-allowed' : undefined,
        }}
      />
      {suffix && <span style={{ fontSize: 10.5, color: C.textFaint, whiteSpace: 'nowrap' }}>{suffix}</span>}
    </div>
  );
}
