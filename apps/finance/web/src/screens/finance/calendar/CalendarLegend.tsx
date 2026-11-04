import { kindColors, statusColors } from './calendarStatus';

const ITEMS = [
  { label: 'Despesas', bg: kindColors.despesa.bg, border: kindColors.despesa.border },
  { label: 'Receitas', bg: kindColors.receita.bg, border: kindColors.receita.border },
  { label: 'Compromissos', bg: kindColors.compromisso.bg, border: kindColors.compromisso.border },
  { label: 'Em atraso', bg: statusColors.atrasado.bg, border: statusColors.atrasado.border },
];

export function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="h-2.5 w-2.5 rounded-[3px] border" style={{ background: item.bg, borderColor: item.border }} />
          {item.label}
        </div>
      ))}
      <span className="ml-auto text-xs text-slate-400">
        Clique em um dia vazio para criar · clique em um item para editar
      </span>
    </div>
  );
}
