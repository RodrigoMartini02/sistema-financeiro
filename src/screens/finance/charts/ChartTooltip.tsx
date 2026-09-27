import { formatCurrency } from '../formatters';
import { useCoresGrafico } from '../painel/coresGrafico';

interface TooltipEntry {
  name?: string;
  dataKey?: string | number;
  value?: number;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  /**
   * Rótulos legíveis por dataKey — as séries usam chaves internas
   * ("receitas", "despesas"), que não servem para exibição.
   */
  labels?: Record<string, string>;
  /** Formato do valor de cada linha; padrão: moeda. */
  formatarValor?: (valor: number) => string;
}

/** Tooltip compartilhado dos gráficos do Painel. */
export function ChartTooltip({ active, payload, label, labels, formatarValor = formatCurrency }: ChartTooltipProps) {
  const cores = useCoresGrafico();
  if (!active || !payload?.length) return null;

  // Séries sem valor no ponto não devem virar linha vazia no tooltip.
  const entries = payload.filter((entry) => entry.value !== undefined && entry.value !== null);
  if (entries.length === 0) return null;

  return (
    <div className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {label && <p className="m-0 mb-1.5 text-xs font-semibold text-slate-900 dark:text-white">{label}</p>}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {entries.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? '');
          return (
            <li key={key} className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color ?? cores.neutro }} />
              <span className="flex-1 text-slate-500 dark:text-slate-400">{labels?.[key] ?? entry.name ?? key}</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{formatarValor(entry.value ?? 0)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
