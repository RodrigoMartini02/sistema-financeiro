import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';
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
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
