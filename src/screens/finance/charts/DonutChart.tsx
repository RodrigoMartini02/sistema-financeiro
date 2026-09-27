import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../formatters';

interface DonutChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  centerLabel: string;
  centerValue: string;
  capitalizeLabels?: boolean;
  /** Desliga a lista ao lado quando quem usa monta a própria legenda (ex.: tabela de formas de pagamento). */
  mostrarLegenda?: boolean;
}

const SIZE = 132;
const INNER_RADIUS = 46;
const OUTER_RADIUS = 66;
// Vão entre fatias, em graus: separa fatias vizinhas sem depender da cor do fundo.
const VAO_ENTRE_FATIAS = 1.5;

export function DonutChart({ data, centerLabel, centerValue, capitalizeLabels = false, mostrarLegenda = true }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const segments = data.map((d) => ({ ...d, fraction: total > 0 ? d.value / total : 0 }));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
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
              paddingAngle={segments.length > 1 ? VAO_ENTRE_FATIAS : 0}
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
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-px px-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{centerLabel}</span>
          <span className="max-w-full truncate text-xs font-bold tabular-nums text-slate-900 dark:text-white">{centerValue}</span>
        </div>
      </div>
      {mostrarLegenda && (
        <ul className="m-0 w-full min-w-0 flex-1 list-none space-y-2 p-0 text-xs">
          {segments.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className={`truncate text-slate-700 dark:text-slate-300 ${capitalizeLabels ? 'capitalize' : ''}`} title={s.name}>{s.name}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{(s.fraction * 100).toFixed(0)}%</span>
              <span className="ml-auto shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">{formatCurrency(s.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
