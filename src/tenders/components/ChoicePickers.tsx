// Escolhas múltiplas dos filtros e do formulário: UFs em grade de botões e
// listas de opções com caixa de seleção (modalidade, acompanhamento).

interface StatePickerProps {
  label: string;
  states: readonly string[];
  selected: string[];
  onChange: (states: string[]) => void;
  disabled?: boolean;
}

export function StatePicker({ label, states, selected, onChange, disabled = false }: StatePickerProps) {
  const toggle = (state: string) =>
    onChange(selected.includes(state) ? selected.filter((item) => item !== state) : [...selected, state]);
  return (
    <div role="group" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
      {states.map((state) => {
        const active = selected.includes(state);
        return (
          <button
            key={state}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => toggle(state)}
            className={[
              'h-8 rounded-lg border text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-500/60',
            ].join(' ')}
          >
            {state}
          </button>
        );
      })}
    </div>
  );
}

interface CheckOption<T extends string | number> {
  value: T;
  label: string;
}

interface CheckListProps<T extends string | number> {
  label: string;
  options: Array<CheckOption<T>>;
  selected: T[];
  onChange: (values: T[]) => void;
  disabled?: boolean;
}

export function CheckList<T extends string | number>({ label, options, selected, onChange, disabled = false }: CheckListProps<T>) {
  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  return (
    <fieldset disabled={disabled} className="grid grid-cols-1 gap-0.5 disabled:opacity-50">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-[13px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
        >
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            onChange={() => toggle(option.value)}
            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0891b2] dark:[color-scheme:dark]"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
