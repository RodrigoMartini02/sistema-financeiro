export type CalendarSubView = 'mes' | 'semana' | 'dia' | 'agenda';

const LABELS: Record<CalendarSubView, string> = {
  mes: 'Mês', semana: 'Semana', dia: 'Dia', agenda: 'Agenda',
};

interface Props {
  value: CalendarSubView;
  onChange: (view: CalendarSubView) => void;
}

export function CalendarSubViewToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
      {(Object.keys(LABELS) as CalendarSubView[]).map((view) => {
        const active = value === view;
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            className={[
              'rounded-md px-2.5 py-1 text-xs font-semibold transition',
              active ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            ].join(' ')}
          >
            {LABELS[view]}
          </button>
        );
      })}
    </div>
  );
}
