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

interface Point { x: number; y: number }

// Curva suave via Catmull-Rom convertido para Bézier cúbico — mesmo efeito
// visual do antigo Recharts `type="monotone"`. Os pontos de controle em Y são
// clampados ao intervalo do segmento (p1↔p2) para evitar overshoot da curva
// além dos valores reais em transições abruptas (ex.: pico isolado entre
// meses zerados), mesma garantia que a interpolação "monotone" do Recharts.
function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, p1.y, p2.y);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, p1.y, p2.y);

    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function AnnualTrendChart({ data, activeIndex }: AnnualTrendChartProps) {
  const maxValue = Math.max(1, ...data.flatMap((d) => [d.receitas, d.despesas, Math.abs(d.saldo)]));
  const scaleMax = maxValue * 1.15;
  const chartWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const slot = chartWidth / data.length;
  const barWidth = Math.min(20, slot * 0.28);

  const yFor = (value: number) => CHART_BOTTOM - (value / scaleMax) * CHART_HEIGHT;
  const xFor = (index: number) => PAD_LEFT + slot * index + slot / 2;

  const linePath = smoothPath(data.map((d, i) => ({ x: xFor(i), y: yFor(d.saldo) })));
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

        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
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
      </svg>
    </div>
  );
}
