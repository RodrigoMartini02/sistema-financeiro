import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { MONTH_NAMES } from '../../../types/finance';
import type { ParcelaFutura } from '../../../services/financeService';

interface ParcelasFuturasChartProps {
  parcelas: ParcelaFutura[];
}

const HEIGHT = 260;
const COR_PAGAS = '#10b981';
const COR_EM_ABERTO = '#f59e0b';

function fmtCompact(v: number) {
  if (v === 0) return 'R$ 0';
  if (Math.abs(v) < 1000) return `R$ ${v.toFixed(0)}`;
  return `R$ ${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function ParcelasFuturasChart({ parcelas }: ParcelasFuturasChartProps) {
  // Ano inteiro sempre visivel, mesmo criterio do grafico de juros: um mes
  // sem parcela e informacao, e o eixo fixo evita o grafico mudar de forma a
  // cada filtro.
  const porMes = new Map(parcelas.map((p) => [p.mes, p]));
  const data = MONTH_NAMES.map((nome, mes) => ({
    name: nome.slice(0, 3),
    pagas: porMes.get(mes)?.pagas ?? 0,
    emAberto: porMes.get(mes)?.emAberto ?? 0,
  }));
  const maxValue = Math.max(1, ...data.map((d) => d.pagas + d.emAberto));

  return (
    <div style={{ height: HEIGHT }} role="img" aria-label="Parcelas por mês no ano, divididas entre pagas e em aberto">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }} barCategoryGap="28%">
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
            width={62}
          />
          <Tooltip
            cursor={{ fill: 'rgba(15, 43, 56, 0.04)' }}
            content={<ChartTooltip labels={{ pagas: 'Pagas', emAberto: 'Em aberto' }} />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11.5, color: '#5f7885' }}
          />
          <Bar dataKey="pagas" name="Pagas" stackId="parcelas" fill={COR_PAGAS} maxBarSize={30} isAnimationActive={false} />
          <Bar dataKey="emAberto" name="Em aberto" stackId="parcelas" fill={COR_EM_ABERTO} radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
