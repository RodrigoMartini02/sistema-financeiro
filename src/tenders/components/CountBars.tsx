interface CountBarsProps {
  label: string;
  items: Array<{ key: string; label: string; count: number }>;
}

/**
 * Barras horizontais de contagem (o BarrasHorizontais do painel financeiro só
 * formata reais). A maior barra ocupa a largura toda.
 */
export function CountBars({ label, items }: CountBarsProps) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul aria-label={label} className="grid grid-cols-1 gap-2">
      {items.map((item) => {
        const width = `${Math.max(2, Math.round((item.count / max) * 100))}%`;
        return (
          <li key={item.key} className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{item.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
              <span className="block h-full rounded-full bg-brand-500 dark:bg-brand-400" style={{ width }} />
            </span>
            <span className="text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">{item.count.toLocaleString('pt-BR')}</span>
          </li>
        );
      })}
    </ul>
  );
}
