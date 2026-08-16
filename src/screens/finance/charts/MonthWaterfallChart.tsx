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
const CHART_TOP = 30;
const CHART_BOTTOM = 224;
const CHART_HEIGHT = CHART_BOTTOM - CHART_TOP;
const PAD_LEFT = 70;
const PAD_RIGHT = 15;

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
  const width = Math.max(720, PAD_LEFT + PAD_RIGHT + bars.length * 150);
  const chartWidth = width - PAD_LEFT - PAD_RIGHT;
  const slot = chartWidth / bars.length;
  const barWidth = Math.min(78, slot * 0.62);

  const yFor = (value: number) => CHART_BOTTOM - (value / maxValue) * CHART_HEIGHT;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="block w-full min-w-[720px]" style={{ height: HEIGHT }} role="img" aria-label="Cascata do mês: saldo anterior, receitas, despesas por categoria e saldo final">
        {[0, 0.5, 1].map((g) => {
          const y = CHART_BOTTOM - g * CHART_HEIGHT;
          return (
            <g key={g}>
              <line x1={PAD_LEFT} y1={y} x2={width - PAD_RIGHT} y2={y} stroke={g === 0 ? '#d7e3ea' : '#eef4f7'} />
              <text x={PAD_LEFT - 10} y={y + 4} textAnchor="end" fontSize="10.5" fill="#6c8593">{formatCurrency(maxValue * g)}</text>
            </g>
          );
        })}

        {bars.map((bar, i) => {
          const x = PAD_LEFT + slot * i + (slot - barWidth) / 2;
          const barTopY = yFor(bar.top);
          const barBottomY = yFor(bar.base);
          const barHeight = Math.max(2, barBottomY - barTopY);
          const centerX = x + barWidth / 2;
          const nextBar = bars[i + 1];

          return (
            <g key={`${bar.label}-${i}`}>
              {nextBar && (
                <line
                  x1={x + barWidth}
                  y1={yFor(bar.kind === 'decrease' || bar.kind === 'increase' ? bar.before + bar.value : bar.top)}
                  x2={PAD_LEFT + slot * (i + 1) + (slot - barWidth) / 2}
                  y2={yFor(bar.kind === 'decrease' || bar.kind === 'increase' ? bar.before + bar.value : bar.top)}
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )}
              <rect x={x} y={barTopY} width={barWidth} height={barHeight} rx={3} fill={COLORS[bar.kind]} />
              <text x={centerX} y={barTopY - 8} textAnchor="middle" fontSize="11.5" fontWeight={700} fill={bar.kind === 'decrease' ? '#b42318' : bar.kind === 'increase' ? '#067647' : '#0f2b38'}>
                {bar.kind === 'decrease' ? `-${formatCurrency(Math.abs(bar.value))}` : bar.kind === 'increase' ? `+${formatCurrency(bar.value)}` : formatCurrency(bar.value)}
              </text>
              <text x={centerX} y={HEIGHT - 14} textAnchor="middle" fontSize="11.5" fontWeight={bar.kind === 'start' || bar.kind === 'end' ? 700 : 400} fill={bar.kind === 'start' || bar.kind === 'end' ? '#0f2b38' : '#5f7885'}>
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
