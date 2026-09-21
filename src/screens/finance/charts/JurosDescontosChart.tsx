import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { MONTH_NAMES } from '../../../types/finance';

interface JurosDescontosChartProps {
  /** Uma entrada por mês com movimento; os meses faltantes entram zerados. */
  mensal: { mes: number; juros: number; descontos: number }[];
}

const HEIGHT = 260;
const COR_JUROS = '#ef4444';
const COR_DESCONTOS = '#10b981';

function fmtCompact(v: number) {
  if (v === 0) return 'R$ 0';
  if (Math.abs(v) < 1000) return `R$ ${v.toFixed(0)}`;
  return `R$ ${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function JurosDescontosChart({ mensal }: JurosDescontosChartProps) {
  // O ano aparece inteiro mesmo onde nao houve juros nem desconto: uma lacuna
  // no meio do ano e informacao, e sem os 12 meses fixos o eixo mudaria de
  // forma a cada filtro.
  const porMes = new Map(mensal.map((m) => [m.mes, m]));
  const data = MONTH_NAMES.map((nome, mes) => ({
    name: nome.slice(0, 3),
    juros: porMes.get(mes)?.juros ?? 0,
    descontos: porMes.get(mes)?.descontos ?? 0,
  }));
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.juros, d.descontos)));

  return (
    <div style={{ height: HEIGHT }} role="img" aria-label="Juros pagos e descontos obtidos mês a mês no ano">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }} barCategoryGap="22%">
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
            content={<ChartTooltip labels={{ juros: 'Juros pagos', descontos: 'Descontos obtidos' }} />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11.5, color: '#5f7885' }}
          />
          <Bar dataKey="juros" name="Juros pagos" fill={COR_JUROS} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="descontos" name="Descontos obtidos" fill={COR_DESCONTOS} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
