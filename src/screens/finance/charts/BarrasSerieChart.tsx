import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

export interface SerieBarras {
  chave: string;
  rotulo: string;
  cor: string;
  tipo: 'barra' | 'linha';
  /** Séries de barra com o mesmo grupo são empilhadas; sem grupo, ficam lado a lado. */
  pilha?: string;
}

interface BarrasSerieChartProps {
  /** Um ponto por trecho (semana, mês ou ano): `rotulo` no eixo X e um valor por `chave` de série. */
  pontos: Array<{ rotulo: string } & Record<string, number | string>>;
  series: SerieBarras[];
  formatarValor?: (valor: number) => string;
  formatarEixo?: (valor: number) => string;
  altura?: number;
}

function formatarEixoMoeda(valor: number): string {
  if (Math.abs(valor) >= 1000) return `R$ ${(valor / 1000).toFixed(0)}k`;
  return `R$ ${valor.toFixed(0)}`;
}

/**
 * Gráfico de série do Painel: barras (lado a lado ou empilhadas) e linhas
 * sobre o mesmo eixo. Um componente só para receita × despesa, cadastrado ×
 * pago, uso do crédito e compromissos futuros.
 */
export function BarrasSerieChart({
  pontos, series, formatarValor, formatarEixo = formatarEixoMoeda, altura = 240,
}: BarrasSerieChartProps) {
  const labels = Object.fromEntries(series.map((serie) => [serie.chave, serie.rotulo]));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]" style={{ height: altura }} role="img" aria-label={series.map((serie) => serie.rotulo).join(', ')}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#eef4f7" />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#7b93a1' }} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: '#7b93a1' }} tickFormatter={formatarEixo} />
            <Tooltip cursor={{ fill: '#0891b2', fillOpacity: 0.04 }} content={<ChartTooltip labels={labels} formatarValor={formatarValor} />} />
            {series.map((serie) => (serie.tipo === 'barra'
              ? (
                <Bar
                  key={serie.chave}
                  dataKey={serie.chave}
                  name={serie.rotulo}
                  fill={serie.cor}
                  stackId={serie.pilha}
                  radius={serie.pilha ? undefined : [3, 3, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
              )
              : (
                <Line
                  key={serie.chave}
                  dataKey={serie.chave}
                  name={serie.rotulo}
                  stroke={serie.cor}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: serie.cor }}
                  type="monotone"
                  isAnimationActive={false}
                />
              )))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
