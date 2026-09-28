import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '../formatters';

export interface FatiaDonut {
  name: string;
  value: number;
  color: string;
  /** Linhas extras do detalhe que aparece no hover/toque (ex.: compras, juros). */
  detalhes?: string[];
}

interface DonutChartProps {
  data: FatiaDonut[];
  centerLabel: string;
  centerValue: string;
}

const SIZE = 132;
const INNER_RADIUS = 46;
const OUTER_RADIUS = 66;
// Vão entre fatias, em graus: separa fatias vizinhas sem depender da cor do fundo.
const VAO_ENTRE_FATIAS = 1.5;

interface DetalheProps {
  active?: boolean;
  payload?: Array<{ payload?: FatiaDonut & { fraction: number } }>;
}

/** Detalhe da fatia no hover/toque: nome, valor, % e as linhas extras. */
function DetalheFatia({ active, payload }: DetalheProps) {
  const fatia = active ? payload?.[0]?.payload : undefined;
  if (!fatia) return null;
  return (
    <div className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="m-0 flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: fatia.color }} />
        {fatia.name}
      </p>
      <p className="m-0 mt-1 flex items-baseline justify-between gap-3 text-xs tabular-nums">
        <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(fatia.value)}</span>
        <span className="text-slate-500 dark:text-slate-400">{(fatia.fraction * 100).toFixed(0)}%</span>
      </p>
      {fatia.detalhes?.map((linha) => (
        <p key={linha} className="m-0 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{linha}</p>
      ))}
    </div>
  );
}

/**
 * Pizza do painel: total no centro, legenda só com os nomes e o detalhe (valor,
 * % e extras) no hover — no celular, ao tocar na fatia.
 */
export function DonutChart({ data, centerLabel, centerValue }: DonutChartProps) {
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
            <Tooltip content={<DetalheFatia />} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 20 }} />
          </PieChart>
        </ResponsiveContainer>
        {/* O texto vive no furo do donut (raio interno de 46px, ~92px de
            diâmetro), então precisa caber nessa largura sem encostar no anel. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-px px-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{centerLabel}</span>
          <span className="max-w-full truncate text-xs font-bold tabular-nums text-slate-900 dark:text-white">{centerValue}</span>
        </div>
      </div>
      <ul className="m-0 w-full min-w-0 flex-1 list-none space-y-2 p-0 text-xs">
        {segments.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate text-slate-700 dark:text-slate-300" title={s.name}>{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
