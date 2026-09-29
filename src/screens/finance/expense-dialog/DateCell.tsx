import { completeBrDate, maskBrDate } from '../../../utils/date';
import { fieldStyle } from './fieldStyles';

interface DateCellProps {
  /** dd/mm/aaaa. */
  value: string;
  onChange: (text: string) => void;
  todayIso: string;
  label: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Ao sair do campo vazio, volta para esta data (dd/mm/aaaa). */
  emptyFallback?: string;
  height?: number;
}

/**
 * Data digitada como dd/mm/aaaa, com máscara. Ao sair, completa o que faltar
 * com o mês e o ano de hoje ("5" vira 05/mês/ano).
 */
export function DateCell({
  value, onChange, todayIso, label, placeholder = 'dd/mm/aaaa', title, disabled, invalid, emptyFallback = '', height,
}: DateCellProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(event) => onChange(maskBrDate(event.target.value))}
      onBlur={() => {
        const completed = completeBrDate(value, todayIso) || emptyFallback;
        if (completed !== value) onChange(completed);
      }}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      aria-label={label}
      style={{ ...fieldStyle({ invalid, disabled, height }), padding: '0 6px', cursor: disabled ? 'not-allowed' : undefined }}
    />
  );
}
