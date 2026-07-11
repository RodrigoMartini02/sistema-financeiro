import { ArrowDownRight, ArrowUpRight, DollarSign } from 'lucide-react';

type Tone = 'income' | 'expense' | 'slate';

interface MetricCardProps { label: string; value: string; tone?: Tone; }

const tones = {
  income: { bg: 'bg-green-50', text: 'text-green-700', icon: ArrowUpRight },
  expense: { bg: 'bg-red-50', text: 'text-red-700', icon: ArrowDownRight },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', icon: DollarSign },
};

export function MetricCard({ label, value, tone = 'slate' }: MetricCardProps) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
      </div>
      <div className={['flex h-10 w-10 items-center justify-center rounded-lg', t.bg].join(' ')}>
        <Icon size={20} className={t.text} />
      </div>
    </div>
  );
}
