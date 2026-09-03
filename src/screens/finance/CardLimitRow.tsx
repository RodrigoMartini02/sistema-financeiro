import { formatCurrency } from './formatters';

interface CardLimitRowProps {
  nome: string;
  usado: number;
  limite: number;
}

export function CardLimitRow({ nome, usado, limite }: CardLimitRowProps) {
  const pct = limite > 0 ? Math.max(0, Math.min(100, (usado / limite) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate font-medium text-slate-500 dark:text-slate-400">{nome}</span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatCurrency(usado)}</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%`, opacity: 0.8 }} />
      </div>
    </div>
  );
}
