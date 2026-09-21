import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { MONTH_NAMES } from '../../../types/finance';
import type { ParcelaFutura } from '../../../services/financeService';

interface ParcelasFuturasChartProps {
  parcelas: ParcelaFutura[];
  anoReferencia: number;
}

const HEIGHT = 200;
const COR_PAGAS = '#10b981';
const COR_EM_ABERTO = '#f59e0b';

function fmtCompact(v: number) {
  return `R$ ${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function ParcelasFuturasChart({ parcelas, anoReferencia }: ParcelasFuturasChartProps) {
  const data = parcelas.map((p) => ({
    name: `${MONTH_NAMES[p.mes].slice(0, 3)}${p.ano !== anoReferencia ? `/${String(p.ano).slice(2)}` : ''}`,
    pagas: p.pagas,
    emAberto: p.emAberto,
  }));
  const maxValue = Math.max(1, ...data.map((d) => d.pagas + d.emAberto));

  return (
    <div style={{ height: HEIGHT }} role="img" aria-label="Parcelas futuras por mês, divididas entre pagas e em aberto">
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
            content={<ChartTooltip labels={{ pagas: 'Pagas', emAberto: 'Em aberto' }} />}
          />
          <Bar dataKey="pagas" name="Pagas" stackId="parcelas" fill={COR_PAGAS} radius={[0, 0, 0, 0]} maxBarSize={56} isAnimationActive={false} />
          <Bar dataKey="emAberto" name="Em aberto" stackId="parcelas" fill={COR_EM_ABERTO} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
