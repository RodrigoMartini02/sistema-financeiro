import { getLocalTodayIso } from '../../../utils/date';
import type { CalendarItem } from './types';
import { kindColors, statusColors } from './calendarStatus';

function formatDayLabel(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    day: String(d.getDate()),
  };
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface Props {
  itemsByDay: Map<string, CalendarItem[]>;
  onItemClick: (item: CalendarItem, anchor: HTMLElement) => void;
}

export function AgendaView({ itemsByDay, onItemClick }: Props) {
  const today = getLocalTodayIso();
  const days = Array.from(itemsByDay.keys())
    .filter((date) => date >= today && (itemsByDay.get(date)?.length ?? 0) > 0)
    .sort();

  if (days.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 dark:border-slate-700 dark:bg-slate-900">
        Nenhum lançamento ou compromisso futuro neste mês.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {days.map((date) => {
        const items = (itemsByDay.get(date) ?? []).slice().sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
        const net = items.reduce((s, i) => s + (i.kind === 'receita' ? (i.value ?? 0) : i.kind === 'despesa' ? -(i.value ?? 0) : 0), 0);
        const { weekday, day } = formatDayLabel(date);
        const isToday = date === today;

        return (
          <div key={date} className="grid grid-cols-[112px_1fr] border-b border-slate-200 last:border-b-0 dark:border-slate-700">
            <div
              className="flex flex-col gap-0.5 border-r border-slate-200 px-4 py-3 dark:border-slate-700"
              style={{ background: isToday ? 'rgba(56,189,248,.08)' : undefined }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{weekday}</span>
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{day}</span>
              {net !== 0 && (
                <span className={['text-[11.5px] font-semibold', net >= 0 ? 'text-emerald-600' : 'text-rose-600'].join(' ')}>
                  {net >= 0 ? '+' : ''}{brl(net)}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              {items.map((item) => {
                const color = item.status ? statusColors[item.status] : kindColors[item.kind];
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    onClick={(e) => onItemClick(item, e.currentTarget)}
                    className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color.fg }} />
                    <span className="w-11 shrink-0 text-[11.5px] text-slate-400">{item.time ? item.time.slice(0, 5) : ''}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-900 dark:text-white">{item.title}</span>
                    {item.value != null && (
                      <span className="shrink-0 text-[13.5px] font-bold" style={{ color: color.fg }}>{brl(item.value)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
