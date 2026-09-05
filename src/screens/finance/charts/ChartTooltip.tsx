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
   * ("receitas", "saldoSolido"), que não servem para exibição.
   */
  labels?: Record<string, string>;
  /**
   * Quando true, cada linha ganha o percentual que representa sobre o total
   * das séries do ponto. Útil no comparativo receitas × despesas.
   */
  showPercentage?: boolean;
  /**
   * Par [principal, secundária] de séries que representam a mesma grandeza
   * partida em duas (caso do saldo real e do previsto, separados só para
   * desenhar o trecho tracejado). No ponto em que ambas têm o mesmo valor,
   * a secundária é omitida para não duplicar a linha.
   */
  omitDuplicateOf?: [string, string];
}

/**
 * Tooltip compartilhado dos gráficos do Painel.
 *
 * Existia no painel antigo e se perdeu quando os gráficos foram reescritos em
 * SVG manual; ao voltarem para Recharts, as séries foram remontadas sem o
 * `<Tooltip>`, deixando os gráficos sem detalhamento no hover.
 */
export function ChartTooltip({ active, payload, label, labels, showPercentage, omitDuplicateOf }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  // Séries sem valor no ponto (ex.: saldo previsto antes da projeção começar)
  // não devem virar linha vazia no tooltip.
  let entries = payload.filter((entry) => entry.value !== undefined && entry.value !== null);

  if (omitDuplicateOf) {
    const [principal, secundaria] = omitDuplicateOf;
    const valorPrincipal = entries.find((entry) => String(entry.dataKey) === principal)?.value;
    if (valorPrincipal !== undefined) {
      entries = entries.filter(
        (entry) => !(String(entry.dataKey) === secundaria && entry.value === valorPrincipal),
      );
    }
  }

  if (entries.length === 0) return null;

  const total = entries.reduce((sum, entry) => sum + Math.abs(entry.value ?? 0), 0);

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
          const nome = labels?.[key] ?? entry.name ?? key;
          const valor = entry.value ?? 0;
          const pct = showPercentage && total > 0 ? (Math.abs(valor) / total) * 100 : null;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ width: 7, height: 7, flexShrink: 0, borderRadius: '50%', background: entry.color ?? '#94a3b8' }} />
              <span style={{ flex: 1, color: '#5f7885' }}>{nome}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#0f2b38' }}>
                {formatCurrency(valor)}
              </span>
              {pct !== null && (
                <span style={{ width: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#94a3b8' }}>
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
