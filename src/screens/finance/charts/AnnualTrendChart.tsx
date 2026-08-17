import { formatCurrency } from '../formatters';

interface AnnualTrendChartProps {
  data: Array<{ name: string; receitas: number; despesas: number; saldo: number }>;
  activeIndex: number;
}

const WIDTH = 1120;
const HEIGHT = 264;
const PAD_LEFT = 58;
const PAD_RIGHT = 12;
const CHART_TOP = 22;
const CHART_BOTTOM = 222;
const CHART_HEIGHT = CHART_BOTTOM - CHART_TOP;

function fmtK(v: number) {
  return `R$ ${(v / 1000).toFixed(0)}k`;
}

export function AnnualTrendChart({ data, activeIndex }: AnnualTrendChartProps) {
  const maxValue = Math.max(1, ...data.flatMap((d) => [d.receitas, d.despesas, Math.abs(d.saldo)]));
  const scaleMax = maxValue * 1.15;
  const chartWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const slot = chartWidth / data.length;
  const barWidth = Math.min(20, slot * 0.28);

  const yFor = (value: number) => CHART_BOTTOM - (value / scaleMax) * CHART_HEIGHT;
  const xFor = (index: number) => PAD_LEFT + slot * index + slot / 2;

  const lastWithData = data.reduce((last, d, i) => (d.receitas > 0 || d.despesas > 0 ? i : last), -1);
  const solidEnd = Math.max(activeIndex, lastWithData);
  const solidPoints = data.slice(0, solidEnd + 1).map((d, i) => `${xFor(i)},${yFor(d.saldo)}`).join(' ');
  const hasForecast = solidEnd < data.length - 1;
  const forecastPoints = hasForecast
    ? `${xFor(solidEnd)},${yFor(data[solidEnd].saldo)} ${xFor(solidEnd + 1)},${yFor(data[solidEnd + 1].saldo)}`
    : '';
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[640px]" style={{ height: 264 }} role="img" aria-label="Receitas, despesas e saldo por mês">
        <rect
          x={PAD_LEFT + slot * activeIndex}
          y={CHART_TOP}
          width={slot}
          height={CHART_HEIGHT}
          fill="#e6f7fa"
        />
        <text x={PAD_LEFT + slot * activeIndex + slot / 2} y={CHART_TOP - 6} textAnchor="middle" fontSize="9.5" fontWeight={700} letterSpacing="0.09em" fill="#0891b2">
          {data[activeIndex]?.name?.toUpperCase()}
        </text>

        {gridLines.map((g) => {
          const y = CHART_BOTTOM - g * CHART_HEIGHT;
          return (
            <g key={g}>
              <line x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} stroke={g === 0 ? '#d7e3ea' : '#eef4f7'} />
              <text x={PAD_LEFT - 10} y={y + 4} textAnchor="end" fontSize="10.5" fill="#6c8593">{fmtK(scaleMax * g)}</text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = xFor(i);
          const receitasH = (d.receitas / scaleMax) * CHART_HEIGHT;
          const despesasH = (d.despesas / scaleMax) * CHART_HEIGHT;
          return (
            <g key={d.name}>
              <rect x={x - barWidth - 2} y={CHART_BOTTOM - receitasH} width={barWidth} height={receitasH} rx={3} fill={d.receitas > 0 ? '#10b981' : 'transparent'} />
              <rect x={x + 2} y={CHART_BOTTOM - despesasH} width={barWidth} height={despesasH} rx={3} fill={d.despesas > 0 ? '#ef4444' : 'transparent'} />
              <text x={x} y={HEIGHT - 8} textAnchor="middle" fontSize="11.5" fontWeight={i === activeIndex ? 700 : 400} fill={i === activeIndex ? '#0891b2' : '#7b93a1'}>
                {d.name}
              </text>
            </g>
          );
        })}

        <polyline points={solidPoints} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {hasForecast && (
          <polyline points={forecastPoints} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="5 4" opacity={0.55} />
        )}
        {data.slice(0, solidEnd + 1).map((d, i) => (
          <circle
            key={d.name}
            cx={xFor(i)}
            cy={yFor(d.saldo)}
            r={i === activeIndex ? 5 : 4}
            fill={i === activeIndex ? '#6366f1' : '#fff'}
            stroke="#6366f1"
            strokeWidth={2.5}
          >
            <title>{`${d.name}: ${formatCurrency(d.saldo)}`}</title>
          </circle>
        ))}
        {hasForecast && (
          <circle cx={xFor(solidEnd + 1)} cy={yFor(data[solidEnd + 1].saldo)} r={4} fill="#fff" stroke="#6366f1" strokeWidth={2.5} opacity={0.6} />
        )}
      </svg>
    </div>
  );
}
