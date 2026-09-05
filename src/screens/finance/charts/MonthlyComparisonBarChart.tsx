import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

interface MonthlyComparisonBarChartProps {
  data: Array<{ name: string; receitas: number; despesas: number }>;
}

const SERIES_LABELS = { receitas: 'Receitas', despesas: 'Despesas' };

function fmtCompact(v: number) {
  return `R$ ${(v / 1000).toFixed(0)}k`;
}

export function MonthlyComparisonBarChart({ data }: MonthlyComparisonBarChartProps) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[640px]" style={{ height: 240 }} role="img" aria-label="Comparativo de receitas e despesas por mês">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }} barGap={4}>
            <CartesianGrid stroke="#eef4f7" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={{ stroke: '#d7e3ea' }}
              tickLine={false}
              tick={{ fontSize: 11.5, fill: '#7b93a1' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtCompact}
              tick={{ fontSize: 10.5, fill: '#6c8593' }}
              width={50}
            />
            <Tooltip
              cursor={{ fill: 'rgba(15, 43, 56, 0.04)' }}
              content={<ChartTooltip labels={SERIES_LABELS} showPercentage />}
            />
            <Bar dataKey="receitas" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="despesas" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
