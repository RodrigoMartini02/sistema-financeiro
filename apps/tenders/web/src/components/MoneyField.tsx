import { inputBase } from '../../ui/form';
import { useMoneyInput } from '../../ui/dialogFormTokens';

interface MoneyFieldProps {
  id?: string;
  /** Nome do campo para leitores de tela. */
  label: string;
  /** Reais; vazio é null (o campo não mostra zero). */
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
}

/** Campo R$ com a digitação do sistema (useMoneyInput) e o desenho do Input. */
export function MoneyField({ id, label, value, onChange, onBlur, invalid = false, disabled = false }: MoneyFieldProps) {
  const { exibido, handleChange, handleBlur } = useMoneyInput(value ?? 0, (next) => onChange(next > 0 ? next : null));
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-400">
        R$
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={exibido}
        onChange={handleChange}
        onBlur={() => {
          handleBlur();
          onBlur?.();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        placeholder="0,00"
        className={`${inputBase} pl-8 tabular-nums disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? '!border-red-400' : ''}`}
      />
    </div>
  );
}
