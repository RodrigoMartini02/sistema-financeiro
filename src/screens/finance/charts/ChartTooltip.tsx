import { formatCurrency } from '../formatters';

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
  if (!active || !payload?.length) return null;

  // Séries sem valor no ponto não devem virar linha vazia no tooltip.
  const entries = payload.filter((entry) => entry.value !== undefined && entry.value !== null);
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid #e9eef3',
        background: '#fff',
        boxShadow: '0 8px 24px -8px rgba(15, 43, 56, 0.25)',
        padding: '7px 9px',
        minWidth: 132,
      }}
    >
      {label && (
        <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, color: '#0f2b38' }}>{label}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {entries.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? '');
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ width: 7, height: 7, flexShrink: 0, borderRadius: '50%', background: entry.color ?? '#94a3b8' }} />
              <span style={{ flex: 1, color: '#5f7885' }}>{labels?.[key] ?? entry.name ?? key}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#0f2b38' }}>
                {formatarValor(entry.value ?? 0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
