import { Banknote, Calendar, TrendingDown } from 'lucide-react';
import { getLocalTodayIso } from '../../../utils/date';
import type { CalendarItem } from './types';
import type { CalendarItemKind } from './calendarStatus';
import { kindColors, statusColors } from './calendarStatus';

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 46;

const CREATE_SHORTCUTS: { kind: CalendarItemKind; Icon: typeof TrendingDown; title: string }[] = [
  { kind: 'despesa', Icon: TrendingDown, title: 'Nova despesa' },
  { kind: 'receita', Icon: Banknote, title: 'Nova receita' },
  { kind: 'compromisso', Icon: Calendar, title: 'Novo compromisso' },
];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

interface Props {
  weekStart: Date; // domingo da semana ativa
  itemsByDay: Map<string, CalendarItem[]>;
  onCreateClick: (date: string, kind: CalendarItemKind) => void;
  onItemClick: (item: CalendarItem, anchor: HTMLElement) => void;
}

export function WeekGrid({ weekStart, itemsByDay, onCreateClick, onItemClick }: Props) {
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = getLocalTodayIso();
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Cabeçalho com dia/número + itens de dia inteiro (despesas/receitas) */}
      <div className="grid shrink-0 grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200 dark:border-slate-700">
        <div className="border-r border-slate-200 dark:border-slate-700" />
        {days.map((d) => {
          const iso = toIso(d);
          const isToday = iso === today;
          const dayItems = (itemsByDay.get(iso) ?? []).filter((i) => i.kind !== 'compromisso');
          return (
            <div key={iso} className="border-r border-slate-200 p-2 last:border-r-0 dark:border-slate-700">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{WEEKDAY_LABELS[d.getDay()]}</span>
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{ background: isToday ? '#0ea5e9' : 'transparent', color: isToday ? '#fff' : '#0f172a' }}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  {CREATE_SHORTCUTS.map(({ kind, Icon, title }) => (
                    <button
                      key={kind}
                      type="button"
                      title={title}
                      onClick={() => onCreateClick(iso, kind)}
                      className="flex h-5 w-5 items-center justify-center rounded text-slate-300 hover:text-slate-600 dark:hover:text-slate-300"
                      style={{ color: kindColors[kind].fg }}
                    >
                      <Icon size={11} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {dayItems.map((item) => {
                  const color = item.status ? statusColors[item.status] : kindColors[item.kind];
                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      onClick={(e) => onItemClick(item, e.currentTarget)}
                      title={item.title}
                      className="flex h-[20px] cursor-pointer items-center truncate rounded-md border px-1.5 text-[10.5px] font-medium"
                      style={{ color: color.fg, background: color.bg, borderColor: color.border }}
                    >
                      <span className="truncate">{item.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grade de horários — compromissos */}
      <div className="grid min-h-0 flex-1 grid-cols-[56px_repeat(7,1fr)] overflow-y-auto pt-2">
        <div className="border-r border-slate-200 dark:border-slate-700">
          {hours.map((h) => (
            <div key={h} className="-translate-y-1.5 px-2 text-right text-[10px] text-slate-400" style={{ height: HOUR_HEIGHT }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
          const iso = toIso(d);
          const appointments = (itemsByDay.get(iso) ?? []).filter((i) => i.kind === 'compromisso' && i.time);
          return (
            <div key={iso} className="relative border-r border-slate-200 last:border-r-0 dark:border-slate-700">
              {hours.map((h) => (
                <div key={h} className="border-b border-slate-100 dark:border-slate-800" style={{ height: HOUR_HEIGHT }} />
              ))}
              {appointments.map((item) => {
                const minutes = timeToMinutes(item.time!.slice(0, 5));
                const top = ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    onClick={(e) => onItemClick(item, e.currentTarget)}
                    title={item.title}
                    className="absolute left-1 right-1 cursor-pointer rounded-md border-l-2 px-1.5 py-0.5 text-[10.5px] font-medium"
                    style={{ top, minHeight: 24, color: kindColors.compromisso.fg, background: kindColors.compromisso.bg, borderColor: kindColors.compromisso.fg }}
                  >
                    <div className="truncate">{item.title}</div>
                    <div className="text-[9px] opacity-80">{item.time!.slice(0, 5)}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
