import { formatCurrency } from '../formatters';

interface DonutChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  centerLabel: string;
  centerValue: string;
  capitalizeLabels?: boolean;
}

const SIZE = 140;
const RADIUS = 54;
const STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({ data, centerLabel, centerValue, capitalizeLabels = false }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;
  const segments = data.map((d) => {
    const fraction = total > 0 ? d.value / total : 0;
    const dash = fraction * CIRCUMFERENCE;
    const segment = { ...d, fraction, dashArray: `${dash} ${CIRCUMFERENCE - dash}`, dashOffset: -offset };
    offset += dash;
    return segment;
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex w-full justify-center sm:w-auto">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: 132, height: 132 }} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#f5f9fb" strokeWidth={STROKE} />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((s) => (
              <circle
                key={s.name}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={s.dashArray}
                strokeDashoffset={s.dashOffset}
              />
            ))}
          </g>
          <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" fontSize="10" fontWeight={700} letterSpacing="0.09em" fill="#6c8593">{centerLabel}</text>
          <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" fontSize="15" fontWeight={700} fill="#0f2b38">{centerValue}</text>
        </svg>
      </div>
      <ul className="flex-1 space-y-2.5 text-xs">
        {segments.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className={`text-slate-700 dark:text-slate-300 ${capitalizeLabels ? 'capitalize' : ''}`}>{s.name}</span>
              <span className="text-[11px] text-slate-400">{(s.fraction * 100).toFixed(0)}%</span>
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
