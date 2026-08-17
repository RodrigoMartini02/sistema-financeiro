import {
  Bar,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface AnnualTrendChartProps {
  data: Array<{ name: string; receitas: number; despesas: number; saldo: number }>;
  activeIndex: number;
}

function fmtK(v: number) {
  return `R$ ${(v / 1000).toFixed(0)}k`;
}

export function AnnualTrendChart({ data, activeIndex }: AnnualTrendChartProps) {
  const lastWithData = data.reduce((last, d, i) => (d.receitas > 0 || d.despesas > 0 ? i : last), -1);
  const solidEnd = Math.max(activeIndex, lastWithData);
  const hasForecast = solidEnd < data.length - 1;

  const chartData = data.map((d, i) => {
    const isForecastPoint = hasForecast && i === solidEnd + 1;
    return {
      ...d,
      saldoSolido: i <= solidEnd ? d.saldo : undefined,
      saldoPrevisto: i === solidEnd || isForecastPoint ? d.saldo : undefined,
    };
  });

  const activeName = data[activeIndex]?.name?.toUpperCase();

  // Meses após o mês de projeção (solidEnd + 1) ainda não têm nenhum lançamento nem
  // projeção — o mockup cobre essa faixa com um retângulo neutro e o texto "ainda sem
  // lançamentos", evitando que as barras/linha colem visualmente no zero.
  const emptyRangeStart = data[solidEnd + 2]?.name;
  const emptyRangeEnd = data[data.length - 1]?.name;
  const hasEmptyRange = hasForecast && emptyRangeStart !== undefined;
  const emptyRangeMidIndex = hasEmptyRange ? Math.round((solidEnd + 2 + (data.length - 1)) / 2) : -1;

  // O domínio precisa incluir o saldo acumulado (que pode ficar negativo) além das
  // barras de receitas/despesas — do contrário um saldo negativo é cortado no zero e
  // fica indistinguível de "sem dado ainda" (bug visto em produção: a linha grudava
  // na base em vez de mostrar valores abaixo de zero).
  const saldoValues = chartData.flatMap((d) => [d.saldoSolido, d.saldoPrevisto]).filter((v): v is number => v !== undefined);
  const maxBar = Math.max(1, ...data.flatMap((d) => [d.receitas, d.despesas]), ...saldoValues);
  const minSaldo = Math.min(0, ...saldoValues);
  const yDomain: [number, number] = [minSaldo < 0 ? minSaldo * 1.15 : 0, maxBar * 1.15];

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[640px]" style={{ height: 264 }} role="img" aria-label="Receitas, despesas e saldo acumulado por mês">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 22, right: 12, bottom: 8, left: 8 }} barGap={4}>
            <CartesianGrid stroke="#eef4f7" vertical={false} />
            {hasEmptyRange && (
              <ReferenceArea x1={emptyRangeStart} x2={emptyRangeEnd} fill="#f8fafb" ifOverflow="visible" />
            )}
            {hasEmptyRange && (
              <ReferenceLine
                x={data[emptyRangeMidIndex]?.name}
                stroke="transparent"
                label={{ value: 'ainda sem lançamentos', position: 'center', fontSize: 11.5, fill: '#b6c7d0' }}
              />
            )}
            <ReferenceArea x1={activeName} x2={activeName} fill="#e6f7fa" ifOverflow="visible" />
            {activeName && (
              <ReferenceLine
                x={activeName}
                stroke="transparent"
                label={{ value: activeName, position: 'top', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em', fill: '#0891b2' }}
              />
            )}
            <XAxis
              dataKey="name"
              axisLine={{ stroke: '#d7e3ea' }}
              tickLine={false}
              tick={(props) => {
                const { x, y, payload } = props;
                const isActive = payload.value === activeName;
                return (
                  <text x={x} y={Number(y) + 12} textAnchor="middle" fontSize={11.5} fontWeight={isActive ? 700 : 400} fill={isActive ? '#0891b2' : '#7b93a1'}>
                    {payload.value}
                  </text>
                );
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtK}
              tick={{ fontSize: 10.5, fill: '#6c8593' }}
              width={50}
              domain={yDomain}
              allowDataOverflow
            />
            {minSaldo < 0 && <ReferenceLine y={0} stroke="#d7e3ea" strokeWidth={1.5} />}
            <Bar dataKey="receitas" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={20} />
            <Bar dataKey="despesas" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={20} />
            <Line
              dataKey="saldoSolido"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={(props) => {
                const { cx, cy, index, payload } = props;
                if (payload.saldoSolido === undefined) return <g key={`dot-${index}`} />;
                const isActive = index === activeIndex;
                return (
                  <circle key={`dot-${index}`} cx={cx} cy={cy} r={isActive ? 5 : 4} fill={isActive ? '#6366f1' : '#fff'} stroke="#6366f1" strokeWidth={2.5} />
                );
              }}
              activeDot={false}
              connectNulls
            />
            <Line
              dataKey="saldoPrevisto"
              stroke="#6366f1"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              strokeOpacity={0.55}
              dot={(props) => {
                const { cx, cy, index, payload } = props;
                if (payload.saldoPrevisto === undefined || index <= solidEnd) return <g key={`dot-forecast-${index}`} />;
                return <circle key={`dot-forecast-${index}`} cx={cx} cy={cy} r={4} fill="#fff" stroke="#6366f1" strokeWidth={2.5} opacity={0.6} />;
              }}
              activeDot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
