import { Bar, BarChart, CartesianGrid, Cell, Customized, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../formatters';

export interface WaterfallStep {
  label: string;
  value: number;
  kind: 'start' | 'increase' | 'decrease' | 'end';
}

interface MonthWaterfallChartProps {
  steps: WaterfallStep[];
}

const COLORS: Record<WaterfallStep['kind'], string> = {
  start: '#cbd5e1',
  increase: '#10b981',
  decrease: '#ef4444',
  end: '#0891b2',
};

const HEIGHT = 262;

function fmtCompact(v: number) {
  return `R$ ${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

interface WaterfallBar extends WaterfallStep {
  base: number;
  top: number;
  before: number;
}

interface ConnectorLayerProps {
  bars: WaterfallBar[];
  xAxisMap?: Record<string, { scale: (value: string) => number; bandSize: number }>;
  yAxisMap?: Record<string, { scale: (value: number) => number }>;
}

// Recharts não tem waterfall nativo: os conectores tracejados entre o topo de uma barra
// e o topo da próxima (que é a base dela) precisam ser desenhados manualmente por cima
// do BarChart, usando as mesmas escalas x/y que o gráfico calculou internamente.
function ConnectorLayer({ bars, xAxisMap, yAxisMap }: ConnectorLayerProps) {
  const xAxis = xAxisMap ? Object.values(xAxisMap)[0] : undefined;
  const yAxis = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  if (!xAxis || !yAxis) return null;

  return (
    <g>
      {bars.slice(0, -1).map((bar, i) => {
        const nextBar = bars[i + 1];
        // O valor "acumulado depois deste degrau" (before + value para increase/decrease,
        // ou simplesmente top para start/end) é a altura em que a próxima barra começa.
        const afterValue = bar.kind === 'decrease' || bar.kind === 'increase' ? bar.before + bar.value : bar.top;
        const y = yAxis.scale(afterValue);
        // Espelha o maxBarSize={78} do <Bar>: a barra nunca é mais larga que 78px mesmo
        // que a faixa (bandSize) do eixo permita mais.
        const barPixelWidth = Math.min(78, xAxis.bandSize * 0.62);
        const x1 = xAxis.scale(bar.label) + xAxis.bandSize / 2 + barPixelWidth / 2;
        const x2 = xAxis.scale(nextBar.label) + xAxis.bandSize / 2 - barPixelWidth / 2;
        return (
          <line key={`${bar.label}-connector`} x1={x1} y1={y} x2={x2} y2={y} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 3" />
        );
      })}
    </g>
  );
}

export function MonthWaterfallChart({ steps }: MonthWaterfallChartProps) {
  let running = 0;
  const bars = steps.map((step) => {
    const before = running;
    if (step.kind === 'start' || step.kind === 'end') {
      running = step.kind === 'start' ? step.value : running;
      return { ...step, base: 0, top: step.value, before };
    }
    const after = before + step.value;
    running = after;
    const base = Math.min(before, after);
    const top = Math.max(before, after);
    return { ...step, base, top, before };
  });

  const maxValue = Math.max(1, ...bars.map((b) => b.top));
  const chartData = bars.map((bar) => ({
    label: bar.label,
    kind: bar.kind,
    base: bar.base,
    height: bar.top - bar.base,
    valueLabel: bar.kind === 'decrease' ? `-${formatCurrency(Math.abs(bar.value))}` : bar.kind === 'increase' ? `+${formatCurrency(bar.value)}` : formatCurrency(bar.value),
  }));

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[720px]" style={{ height: HEIGHT }} role="img" aria-label="Cascata do mês: saldo anterior, receitas, despesas por categoria e saldo final">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 30, right: 15, bottom: 8, left: 8 }} barCategoryGap="38%">
            <CartesianGrid stroke="#eef4f7" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={{ stroke: '#d7e3ea' }}
              tickLine={false}
              tick={(props) => {
                const { x, y, payload } = props;
                const bar = bars.find((b) => b.label === payload.value);
                const emphasize = bar?.kind === 'start' || bar?.kind === 'end';
                return (
                  <text x={x} y={Number(y) + 12} textAnchor="middle" fontSize={11.5} fontWeight={emphasize ? 700 : 400} fill={emphasize ? '#0f2b38' : '#5f7885'}>
                    {payload.value}
                  </text>
                );
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              domain={[0, maxValue]}
              tickFormatter={fmtCompact}
              tick={{ fontSize: 10.5, fill: '#6c8593' }}
              width={60}
            />
            {/* "base" é o empilhamento invisível que posiciona o degrau, não um
                dado real — fica fora do tooltip. */}
            <Tooltip
              cursor={{ fill: 'rgba(15, 43, 56, 0.04)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const step = bars.find((b) => b.label === label);
                if (!step) return null;
                const cor = COLORS[step.kind];
                const sinal = step.kind === 'decrease' ? '−' : step.kind === 'increase' ? '+' : '';
                return (
                  <div style={{ borderRadius: 10, border: '1px solid #e9eef3', background: '#fff', boxShadow: '0 8px 24px -8px rgba(15, 43, 56, 0.25)', padding: '7px 9px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#0f2b38' }}>{step.label}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor }} />
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#0f2b38' }}>
                        {sinal}{formatCurrency(Math.abs(step.value))}
                      </span>
                    </div>
                    {(step.kind === 'increase' || step.kind === 'decrease') && (
                      <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#7b93a1', fontVariantNumeric: 'tabular-nums' }}>
                        Acumulado: {formatCurrency(step.before + step.value)}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="height"
              stackId="waterfall"
              radius={[3, 3, 0, 0]}
              maxBarSize={78}
              isAnimationActive={false}
              label={(props) => {
                const { x, y, width, index } = props;
                const d = chartData[index as number];
                const fill = d.kind === 'decrease' ? '#b42318' : d.kind === 'increase' ? '#067647' : '#0f2b38';
                return (
                  <text key={`label-${index}`} x={(x as number) + (width as number) / 2} y={(y as number) - 8} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={fill}>
                    {d.valueLabel}
                  </text>
                );
              }}
            >
              {chartData.map((d) => (
                <Cell key={d.label} fill={COLORS[d.kind]} />
              ))}
            </Bar>
            <Customized component={(props: unknown) => <ConnectorLayer {...(props as object)} bars={bars} />} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
