import { Banknote, Calendar, TrendingDown } from 'lucide-react';
import type { CalendarItem } from './types';
import type { CalendarItemKind } from './calendarStatus';
import { kindColors, statusColors } from './calendarStatus';

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 52;

const CREATE_SHORTCUTS: { kind: CalendarItemKind; Icon: typeof TrendingDown; label: string }[] = [
  { kind: 'despesa', Icon: TrendingDown, label: 'Despesa' },
  { kind: 'receita', Icon: Banknote, label: 'Receita' },
  { kind: 'compromisso', Icon: Calendar, label: 'Compromisso' },
];

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatDateLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface Props {
  date: string;
  items: CalendarItem[];
  onCreateClick: (date: string, kind: CalendarItemKind) => void;
  onItemClick: (item: CalendarItem, anchor: HTMLElement) => void;
}

export function DayView({ date, items, onCreateClick, onItemClick }: Props) {
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const appointments = items.filter((i) => i.kind === 'compromisso' && i.time);
  const financial = items.filter((i) => i.kind !== 'compromisso');
  const toReceive = financial.filter((i) => i.kind === 'receita').reduce((s, i) => s + (i.value ?? 0), 0);
  const toPay = financial.filter((i) => i.kind === 'despesa').reduce((s, i) => s + (i.value ?? 0), 0);
  const net = toReceive - toPay;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800">
          <span className="text-[13.5px] font-semibold capitalize text-slate-900 dark:text-white">{formatDateLabel(date)}</span>
          <div className="flex items-center gap-1">
            {CREATE_SHORTCUTS.map(({ kind, Icon, label }) => (
              <button
                key={kind}
                type="button"
                title={`Novo(a) ${label.toLowerCase()}`}
                onClick={() => onCreateClick(date, kind)}
                className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white dark:hover:bg-slate-700"
                style={{ color: kindColors[kind].fg }}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[56px_1fr] overflow-y-auto pt-2">
          <div>
            {hours.map((h) => (
              <div key={h} className="-translate-y-1.5 px-2 text-right text-[10.5px] text-slate-400" style={{ height: HOUR_HEIGHT }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          <div className="relative">
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
                  className="absolute left-2 right-3 cursor-pointer rounded-lg border-l-[3px] px-2.5 py-1.5"
                  style={{ top, minHeight: 32, color: kindColors.compromisso.fg, background: kindColors.compromisso.bg, borderColor: kindColors.compromisso.fg }}
                >
                  <div className="truncate text-[13px] font-semibold">{item.title}</div>
                  <div className="text-[11px] opacity-80">{item.time!.slice(0, 5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="shrink-0 flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Resumo do dia</span>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-slate-500 dark:text-slate-400">A receber</span>
            <span className="text-[14.5px] font-bold text-emerald-600">{brl(toReceive)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-slate-500 dark:text-slate-400">A pagar</span>
            <span className="text-[14.5px] font-bold text-rose-600">{brl(toPay)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
            <span className="text-[13px] text-slate-500 dark:text-slate-400">Líquido do dia</span>
            <span className={['text-[14.5px] font-bold', net >= 0 ? 'text-emerald-600' : 'text-rose-600'].join(' ')}>{brl(net)}</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Financeiro do dia</span>
            <span className="text-[11.5px] text-slate-400">{financial.length} item(ns)</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {financial.length === 0 && (
              <div className="p-4 text-center text-[12.5px] text-slate-400">Nenhum lançamento neste dia.</div>
            )}
            {financial.map((item) => {
              const color = item.status ? statusColors[item.status] : kindColors[item.kind];
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  onClick={(e) => onItemClick(item, e.currentTarget)}
                  className="flex cursor-pointer items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <span className="h-6 w-0.5 rounded-full" style={{ background: color.fg }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-900 dark:text-white">{item.title}</span>
                  <span className="text-[13px] font-bold" style={{ color: color.fg }}>{item.value != null ? brl(item.value) : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
