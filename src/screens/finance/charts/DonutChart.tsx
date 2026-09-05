import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../formatters';

interface DonutChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  centerLabel: string;
  centerValue: string;
  capitalizeLabels?: boolean;
}

const SIZE = 132;
const INNER_RADIUS = 46;
const OUTER_RADIUS = 66;

export function DonutChart({ data, centerLabel, centerValue, capitalizeLabels = false }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const segments = data.map((d) => ({ ...d, fraction: total > 0 ? d.value / total : 0 }));

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto shrink-0 sm:mx-0" style={{ width: SIZE, height: SIZE }} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
        <ResponsiveContainer width={SIZE} height={SIZE}>
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={INNER_RADIUS}
              outerRadius={OUTER_RADIUS}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {segments.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* O texto vive no furo do donut (raio interno de 46px, ~92px de
            diâmetro), então precisa caber nessa largura sem encostar no anel. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[1px] px-1">
          <span className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#8ba3b0]">{centerLabel}</span>
          <span className="max-w-full truncate text-[12px] font-bold tabular-nums text-[#0f2b38]">{centerValue}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5 text-xs">
        {segments.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5" title={s.name}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className={`truncate text-slate-700 dark:text-slate-300 ${capitalizeLabels ? 'capitalize' : ''}`}>{s.name}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{(s.fraction * 100).toFixed(0)}%</span>
            </span>
            <span className="shrink-0 font-semibold text-slate-900 dark:text-white">{formatCurrency(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
