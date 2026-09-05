import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// Mesma escala de `fieldInputStyle` (dialogFormTokens): 32px, raio 10, 13px.
const inputBase = [
  'h-8 w-full rounded-[10px] border border-[#d8e0e8] bg-white px-2.5 text-[13px] font-medium text-[#0f172a]',
  'placeholder-[#9db0bb] transition-all',
  'focus:outline-none focus:ring-[3px] focus:ring-[rgba(8,145,178,0.12)] focus:border-[#0891b2]',
  'dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500',
  'dark:focus:border-brand-400',
].join(' ');

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={[inputBase, className].join(' ')} {...props} />
  )
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={[inputBase, 'appearance-none pr-9 cursor-pointer', className].join(' ')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  )
);
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      rows={3}
      className={[
        'w-full rounded-[10px] border border-[#d8e0e8] bg-white px-2.5 py-2 text-[13px] font-medium text-[#0f172a]',
        'placeholder-[#9db0bb] transition-all resize-none',
        'focus:outline-none focus:ring-[3px] focus:ring-[rgba(8,145,178,0.12)] focus:border-[#0891b2]',
        'dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500',
        className,
      ].join(' ')}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

interface FieldProps { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; }

export function Field({ label, error, hint, required, children }: FieldProps) {
  return (
    <div className="grid gap-[5px]">
      <label className="text-[11px] font-semibold text-[#64748b] dark:text-slate-400">
        {label}{required && <span className="ml-0.5 text-[#dc2626]">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-[#64748b] dark:text-slate-500">{hint}</p>}
      {error && <p className="text-[11px] font-medium text-[#dc2626]">{error}</p>}
    </div>
  );
}

/* ─── Card Selector ─── */
interface CardOption { value: string; label: string; description?: string; }
interface CardSelectorProps {
  value: string;
  options: CardOption[];
  onChange: (v: string) => void;
  columns?: 1 | 2 | 3 | 4;
  size?: 'sm' | 'md';
  allowDeselect?: boolean;
  className?: string;
}

export function CardSelector({
  value, options, onChange,
  columns = 2, size = 'md', allowDeselect = false, className = '',
}: CardSelectorProps) {
  const colClass = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns];
  const isSm = size === 'sm';

  return (
    <div className={['grid gap-2', colClass, className].join(' ')}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(allowDeselect && active ? '' : opt.value)}
            className={[
              'flex flex-col text-left transition-all border',
              isSm ? 'rounded-xl px-3 py-2.5 gap-0' : 'rounded-2xl px-5 py-4 gap-0.5',
              active
                ? 'border-brand-700 bg-brand-600 text-white shadow-md'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:border-brand-300 hover:shadow-sm dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:border-slate-500',
            ].join(' ')}
          >
            <span className={isSm ? 'text-xs font-bold' : 'text-sm font-semibold'}>{opt.label}</span>
            {opt.description && (
              <span className={[
                'leading-tight',
                isSm ? 'text-[10px]' : 'text-[11px]',
                active ? 'text-brand-200' : 'text-slate-400 dark:text-slate-500',
              ].join(' ')}>
                {opt.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Toggle Row (switch estilo iOS — linha clicável com label + switch) ─── */
interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}

export function ToggleRow({ label, description, checked, disabled = false, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="flex min-h-[38px] w-full items-center justify-between gap-4 rounded-xl border border-[#e9eef3] bg-white px-3 py-2 text-left transition-colors hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700/60"
    >
      <span>
        <span className="block text-[12.5px] font-semibold text-[#0f172a] dark:text-slate-200">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] font-medium text-[#64748b] dark:text-slate-400">{description}</span>
        )}
      </span>
      <span className={[
        'relative inline-flex h-[17px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-[#0891b2]' : 'bg-[#cbd5e1] dark:bg-slate-600',
      ].join(' ')}>
        <span className={[
          'inline-block h-[13px] w-[13px] transform rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[15px]' : 'translate-x-[2px]',
        ].join(' ')} />
      </span>
    </button>
  );
}

/* ─── Toggle Group (pill selector — múltiplas opções) ─── */
interface ToggleOption { value: string; label: string; icon?: ReactNode }
interface ToggleGroupProps {
  value: string;
  options: ToggleOption[];
  onChange: (v: string) => void;
  className?: string;
}
export function ToggleGroup({ value, options, onChange, className = '' }: ToggleGroupProps) {
  return (
    // Trilha única com as opções dentro, conforme a especificação (seção 4).
    <div className={['inline-flex gap-[3px] rounded-full bg-[#f1f5f9] p-[3px] dark:bg-slate-700', className].join(' ')}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border-0 px-[11px] h-[26px] text-[11.5px] font-semibold leading-none transition-all whitespace-nowrap',
              active
                ? 'bg-[#0891b2] text-white'
                : 'bg-transparent text-[#475569] hover:text-[#0f172a] dark:text-slate-300',
            ].join(' ')}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Checkbox ─── */
interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}
export function Checkbox({ label, checked, onChange, description }: CheckboxProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-slate-300 hover:bg-slate-50 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:hover:border-slate-500 dark:hover:bg-slate-600"
    >
      <span className={[
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
        checked ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-slate-600',
      ].join(' ')}>
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</span>
        {description && <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
    </button>
  );
}

/* ─── SectionDivider ─── */
export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 border-t border-slate-100 dark:border-slate-700" />
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <div className="flex-1 border-t border-slate-100 dark:border-slate-700" />
    </div>
  );
}
