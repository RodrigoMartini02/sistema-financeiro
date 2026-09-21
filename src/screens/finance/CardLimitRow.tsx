import { formatCurrency } from './formatters';

interface CardLimitRowProps {
  nome: string;
  usado: number;
  limite: number;
  disponivel: number;
}

export function CardLimitRow({ nome, usado, limite, disponivel }: CardLimitRowProps) {
  const pct = limite > 0 ? Math.max(0, Math.min(100, (usado / limite) * 100)) : 0;

  // Cor só muda quando há algo a comunicar: comprometimento alto. Abaixo disso
  // a barra fica neutra para não competir com o resto da tela.
  const barColor = pct >= 90
    ? 'bg-red-400'
    : pct >= 70
      ? 'bg-amber-400'
      : 'bg-slate-300 dark:bg-slate-600';

  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <div className="flex items-baseline justify-between gap-1.5 text-[10.5px] leading-none">
        <span className="truncate font-medium text-slate-400 dark:text-slate-500">{nome}</span>
        <span className="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">
          Limite: {formatCurrency(limite)}
          <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
          Usado: {formatCurrency(usado)}
          <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
          <span className="font-semibold text-slate-500 dark:text-slate-400">
            Disponível: {formatCurrency(disponivel)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-[26px] shrink-0 text-right text-[10px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
