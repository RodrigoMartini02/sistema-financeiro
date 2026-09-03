import type { ReactNode } from 'react';

type Tone = 'income' | 'expense' | 'slate' | 'warning';

interface MovementMetricCardProps {
  label: string;
  value: string;
  tone?: Tone;
  progressPct?: number; // 0-100
  note?: string;
  children?: ReactNode;
}

const toneColors: Record<Tone, { value: string; bar: string }> = {
  income:  { value: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  expense: { value: 'text-rose-600 dark:text-rose-400',       bar: 'bg-rose-500' },
  slate:   { value: 'text-slate-900 dark:text-white',          bar: 'bg-slate-400' },
  warning: { value: 'text-amber-600 dark:text-amber-400',      bar: 'bg-amber-500' },
};

export function MovementMetricCard({ label, value, tone = 'slate', progressPct, note, children }: MovementMetricCardProps) {
  const colors = toneColors[tone];
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={['text-xl font-bold tracking-tight', colors.value].join(' ')}>{value}</span>
      <div className="h-[3px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={['h-full rounded-full', colors.bar].join(' ')}
          style={{ width: `${Math.max(0, Math.min(100, progressPct ?? 0))}%`, opacity: 0.7 }}
        />
      </div>
      {note && <span className="text-[11.5px] text-slate-400">{note}</span>}
      {children}
    </div>
  );
}
