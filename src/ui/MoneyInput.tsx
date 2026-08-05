import { forwardRef } from 'react';

interface Props {
  value: number | undefined;
  onChange: (cents: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function digitsOnly(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Máscara de moeda pt-BR: digitação da direita para a esquerda
 * (centavos primeiro). O valor é sempre trabalhado em centavos.
 */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, placeholder = '0,00', autoFocus, id }, ref) => {
    const cents = value ? Math.round(value * 100) : 0;

    return (
      <div className="flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-600 dark:bg-slate-700">
        <span className="text-sm font-semibold text-slate-400">R$</span>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          autoFocus={autoFocus}
          value={cents > 0 ? formatCents(cents) : ''}
          onChange={(e) => onChange(digitsOnly(e.target.value) / 100)}
          placeholder={placeholder}
          className="w-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder-slate-400 dark:text-slate-100"
        />
      </div>
    );
  },
);
MoneyInput.displayName = 'MoneyInput';
