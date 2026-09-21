import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

interface JurosDescontosChartProps {
  juros: number;
  descontos: number;
}

const HEIGHT = 200;

function fmtCompact(v: number) {
  return `R$ ${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function JurosDescontosChart({ juros, descontos }: JurosDescontosChartProps) {
  const data = [
    { name: 'Juros pagos', key: 'juros', value: juros, color: '#ef4444' },
    { name: 'Descontos obtidos', key: 'descontos', value: descontos, color: '#10b981' },
  ];
  const maxValue = Math.max(1, juros, descontos);

  return (
    <div style={{ height: HEIGHT }} role="img" aria-label="Juros pagos comparados a descontos obtidos no período">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }} barCategoryGap="35%">
          <CartesianGrid stroke="#eef4f7" vertical={false} />
          <XAxis
            dataKey="name"
            axisLine={{ stroke: '#d7e3ea' }}
            tickLine={false}
            tick={{ fontSize: 11.5, fill: '#5f7885' }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            domain={[0, maxValue]}
            tickFormatter={fmtCompact}
            tick={{ fontSize: 10.5, fill: '#6c8593' }}
            width={52}
          />
          <Tooltip
            cursor={{ fill: 'rgba(15, 43, 56, 0.04)' }}
            content={<ChartTooltip labels={{ value: 'Valor' }} />}
          />
          <Bar dataKey="value" name="Valor" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
