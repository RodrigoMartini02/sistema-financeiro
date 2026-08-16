import { formatCurrency } from '../formatters';

interface CategoryBarChartProps {
  data: Array<{ name: string; value: number }>;
  colors: string[];
}

export function CategoryBarChart({ data, colors }: CategoryBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300" title={d.name}>{d.name}</span>
          <div className="relative h-6 flex-1 rounded bg-slate-50 dark:bg-slate-800">
            <div
              className="h-6 rounded"
              style={{ width: `${(d.value / max) * 100}%`, background: colors[i % colors.length] }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
