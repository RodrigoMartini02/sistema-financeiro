type Tone = 'income' | 'expense' | 'slate' | 'warning';

interface MovementMetricCardProps {
  label: string;
  value: string;
  tone?: Tone;
  progressPct?: number; // 0-100
  note?: string;
}

const toneColors: Record<Tone, { value: string; bar: string }> = {
  income:  { value: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  expense: { value: 'text-rose-600 dark:text-rose-400',       bar: 'bg-rose-500' },
  slate:   { value: 'text-slate-900 dark:text-white',          bar: 'bg-slate-400' },
  warning: { value: 'text-amber-600 dark:text-amber-400',      bar: 'bg-amber-500' },
};

// Card compacto: a faixa fica fixa acima da tabela, entao cada pixel de altura
// aqui e um pixel a menos de despesa visivel.
export function MovementMetricCard({ label, value, tone = 'slate', progressPct, note }: MovementMetricCardProps) {
  const colors = toneColors[tone];
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={['text-base font-bold tracking-tight', colors.value].join(' ')}>{value}</span>
      <div className="h-[2px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={['h-full rounded-full', colors.bar].join(' ')}
          style={{ width: `${Math.max(0, Math.min(100, progressPct ?? 0))}%`, opacity: 0.7 }}
        />
      </div>
      {note && <span className="text-[10.5px] leading-tight text-slate-400">{note}</span>}
    </div>
  );
}
