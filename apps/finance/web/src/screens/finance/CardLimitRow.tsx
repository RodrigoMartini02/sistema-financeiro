import { formatCurrency } from './formatters';

interface CardLimitRowProps {
  nome: string;
  usado: number;
  limite: number;
  disponivel: number;
  /** Parte do usado em fatura já vencida e não paga no sistema. */
  vencido?: number;
  /** Com ele, o "Usado" abre a composição do valor (por fatura e por tipo). */
  onDetalhes?: () => void;
}

export function CardLimitRow({ nome, usado, limite, disponivel, vencido = 0, onDetalhes }: CardLimitRowProps) {
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-1.5 gap-y-1 text-[10.5px] leading-none">
        <span className="truncate font-medium text-slate-400 dark:text-slate-500">{nome}</span>
        <span className="ml-auto max-w-full tabular-nums text-slate-400 dark:text-slate-500">
          Limite: {formatCurrency(limite)}
          <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
          {onDetalhes ? (
            <button
              type="button"
              onClick={onDetalhes}
              title="Ver de que é feito o usado"
              className="tabular-nums underline decoration-dotted underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300"
            >
              Usado: {formatCurrency(usado)}
            </button>
          ) : (
            <>Usado: {formatCurrency(usado)}</>
          )}
          {vencido > 0 && (
            <span className="ml-1 font-semibold text-red-500 dark:text-red-400" title="Fatura com vencimento passado e sem pagamento no sistema">
              ({formatCurrency(vencido)} vencido)
            </span>
          )}
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
