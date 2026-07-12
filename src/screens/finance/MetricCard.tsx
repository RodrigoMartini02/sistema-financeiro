import { ArrowDownRight, ArrowUpRight, DollarSign, AlertTriangle } from 'lucide-react';

type Tone = 'income' | 'expense' | 'slate' | 'warning';

interface MetricCardProps {
  label: string;
  value: string;
  tone?: Tone;
  delta?: number;
}

const tones = {
  income:  { bg: 'bg-green-50',  text: 'text-green-700',  icon: ArrowUpRight },
  expense: { bg: 'bg-red-50',    text: 'text-red-700',    icon: ArrowDownRight },
  slate:   { bg: 'bg-slate-100', text: 'text-slate-600',  icon: DollarSign },
  warning: { bg: 'bg-amber-50',  text: 'text-amber-600',  icon: AlertTriangle },
};

export function MetricCard({ label, value, tone = 'slate', delta }: MetricCardProps) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{value}</p>
        {delta !== undefined && (
          <p className={['text-xs font-medium mt-0.5', delta >= 0 ? 'text-green-600' : 'text-red-600'].join(' ')}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs mês ant.
          </p>
        )}
      </div>
      <div className={['flex h-10 w-10 items-center justify-center rounded-lg shrink-0', t.bg].join(' ')}>
        <Icon size={20} className={t.text} />
      </div>
    </div>
  );
}
