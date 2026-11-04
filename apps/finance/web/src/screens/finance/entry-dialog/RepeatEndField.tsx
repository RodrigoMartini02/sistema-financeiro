import { useEffect, useState } from 'react';
import { C } from '@ui/components/dialogFormTokens';
import { MONTH_NAMES } from '@ui/utils/calendarGrid';
import { fieldStyle } from './fieldStyles';

interface RepeatEndFieldProps {
  value: string;
  onChange: (month: string) => void;
  min?: string;
  max?: string;
  invalid?: boolean;
  disabled?: boolean;
}

/** Limite mensal usado nas opções Fixa de despesas e receitas. */
export function RepeatEndField({ value, onChange, min = '2000-01', max = '2100-12', invalid = false, disabled = false }: RepeatEndFieldProps) {
  const [parts, setParts] = useState(() => value.split('-'));
  useEffect(() => setParts(value.split('-')), [value]);
  const [year = '', month = ''] = parts;
  const firstYear = Number(min.slice(0, 4));
  const lastYear = Number(max.slice(0, 4));
  const update = (nextYear: string, nextMonth: string) => {
    setParts([nextYear, nextMonth]);
    if (nextYear && nextMonth) onChange(`${nextYear}-${nextMonth}`);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: C.textSoft }}>Até</span>
      <select aria-label="Mês final" value={month} disabled={disabled} aria-invalid={invalid || undefined}
        onChange={(event) => update(year, event.target.value)}
        style={{ ...fieldStyle({ invalid, disabled }), width: 90, padding: '0 4px' }}>
        <option value="" disabled>Mês</option>
        {MONTH_NAMES.map((name, index) => {
          const number = String(index + 1).padStart(2, '0');
          const candidate = `${year}-${number}`;
          return <option key={number} value={number} disabled={!!year && (candidate < min || candidate > max)}>{name}</option>;
        })}
      </select>
      <select aria-label="Ano final" value={year} disabled={disabled} aria-invalid={invalid || undefined}
        onChange={(event) => update(event.target.value, month)}
        style={{ ...fieldStyle({ invalid, disabled }), width: 70, padding: '0 4px' }}>
        <option value="" disabled>Ano</option>
        {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index)
          .map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}
