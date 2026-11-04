import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { C } from '../../../ui/dialogFormTokens';

const stepperButtonStyle: CSSProperties = {
  width: 28, height: '100%', border: 'none', background: '#f1f5f9', color: C.textSoft, fontSize: 14, cursor: 'pointer',
};

interface InstallmentCountFieldProps {
  /** Nome do campo para leitores de tela. */
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (count: number) => void;
}

/** Nº de parcelas na edição: botões "−" e "+" ou o número digitado (aplicado ao sair do campo ou no Enter, entre `min` e `max`). */
export function InstallmentCountField({ label, value, min, max, disabled = false, onChange }: InstallmentCountFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const clamp = (count: number) => Math.min(max, Math.max(min, count));

  const commit = () => {
    if (text === null) return;
    setText(null);
    const typed = Number.parseInt(text, 10);
    if (Number.isFinite(typed) && clamp(typed) !== value) onChange(clamp(typed));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commit();
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', height: 30, border: `1px solid ${C.borderInput}`, borderRadius: 8, overflow: 'hidden',
        opacity: disabled ? 0.6 : 1, background: '#fff',
      }}
    >
      <button
        type="button"
        aria-label="Menos uma parcela"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        style={{ ...stepperButtonStyle, cursor: disabled || value <= min ? 'not-allowed' : 'pointer' }}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={text ?? String(value)}
        disabled={disabled}
        onChange={(event) => setText(event.target.value.replace(/\D/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        aria-label={label}
        style={{
          width: 44, height: '100%', border: 'none', boxShadow: 'none', textAlign: 'center', fontSize: 13, outline: 'none',
          fontVariantNumeric: 'tabular-nums', color: C.text, background: 'transparent',
        }}
      />
      <button
        type="button"
        aria-label="Mais uma parcela"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        style={{ ...stepperButtonStyle, cursor: disabled || value >= max ? 'not-allowed' : 'pointer' }}
      >
        +
      </button>
    </div>
  );
}
