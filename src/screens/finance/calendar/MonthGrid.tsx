import { Banknote, Calendar, TrendingDown } from 'lucide-react';
import { getLocalTodayIso } from '../../../utils/date';
import type { CalendarItem } from './types';
import type { CalendarItemKind } from './calendarStatus';
import { kindColors, statusColors } from './calendarStatus';

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MAX_CHIPS_PER_DAY = 3;

const CREATE_SHORTCUTS: { kind: CalendarItemKind; Icon: typeof TrendingDown; title: string }[] = [
  { kind: 'despesa', Icon: TrendingDown, title: 'Nova despesa' },
  { kind: 'receita', Icon: Banknote, title: 'Nova receita' },
  { kind: 'compromisso', Icon: Calendar, title: 'Novo compromisso' },
];

function toIso(year: number, month: number, day: number): string {
  const d = new Date(year, month, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


interface Props {
  month: number; // 0-11
  year: number;
  itemsByDay: Map<string, CalendarItem[]>;
  onCreateClick: (date: string, kind: CalendarItemKind) => void;
  onItemClick: (item: CalendarItem, anchor: HTMLElement) => void;
}

export function MonthGrid({ month, year, itemsByDay, onCreateClick, onItemClick }: Props) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = domingo
  const gridStart = new Date(year, month, 1 - startOffset);

  const weeks: string[][] = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const days: string[] = [];
    for (let d = 0; d < 7; d++) {
      days.push(toIso(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }

  const today = getLocalTodayIso();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="grid shrink-0 grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid min-h-0 flex-1 grid-cols-7 border-t border-slate-200 first:border-t-0 dark:border-slate-700">
          {week.map((date) => {
            const dayItems = (itemsByDay.get(date) ?? []).slice().sort((a, b) => {
              if (a.kind === 'compromisso' && b.kind !== 'compromisso') return -1;
              if (a.kind !== 'compromisso' && b.kind === 'compromisso') return 1;
              return (b.value ?? 0) - (a.value ?? 0);
            });
            const visible = dayItems.slice(0, MAX_CHIPS_PER_DAY);
            const extra = dayItems.length - visible.length;
            const isCurrentMonth = new Date(`${date}T00:00:00`).getMonth() === month;
            const isToday = date === today;
            const hasOverdue = dayItems.some((i) => i.status === 'atrasado');
            const dayNumber = Number(date.slice(8, 10));

            return (
              <div
                key={date}
                className="group flex min-h-0 flex-col gap-1 overflow-hidden border-r border-slate-200 p-1.5 last:border-r-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
                style={{ background: !isCurrentMonth ? 'rgba(148,163,184,.06)' : isToday ? 'rgba(56,189,248,.08)' : undefined }}
              >
                <div className="flex items-center justify-between px-0.5">
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold"
                    style={{
                      color: !isCurrentMonth ? '#94a3b8' : isToday ? '#fff' : '#0f172a',
                      background: isToday ? '#0ea5e9' : 'transparent',
                    }}
                  >
                    {dayNumber}
                  </span>
                  <div className="flex items-center gap-1">
                    {hasOverdue && (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-rose-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                      </span>
                    )}
                    <div className="hidden items-center gap-0.5 group-hover:flex">
                      {CREATE_SHORTCUTS.map(({ kind, Icon, title }) => (
                        <button
                          key={kind}
                          type="button"
                          title={title}
                          onClick={() => onCreateClick(date, kind)}
                          className="flex h-5 w-5 items-center justify-center rounded"
                          style={{ color: kindColors[kind].fg }}
                        >
                          <Icon size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {visible.map((item) => {
                  const color = item.kind === 'compromisso' ? kindColors.compromisso : (item.status ? statusColors[item.status] : kindColors[item.kind]);
                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      onClick={(e) => { e.stopPropagation(); onItemClick(item, e.currentTarget); }}
                      title={item.title}
                      className="flex h-[21px] cursor-pointer items-center gap-1 truncate rounded-md border px-1.5 text-[11px] font-medium"
                      style={{ color: color.fg, background: color.bg, borderColor: color.border, opacity: item.status === 'pago' ? 0.7 : 1 }}
                    >
                      {item.time && <span className="text-[10px] font-bold opacity-80">{item.time.slice(0, 5)}</span>}
                      <span className="truncate">{item.title}</span>
                    </div>
                  );
                })}
                {extra > 0 && (
                  <span className="self-start px-0.5 text-[11px] font-semibold text-slate-400">
                    +{extra} mais
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
