import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCoresGrafico } from '../painel/coresGrafico';
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

// Largura mínima por ponto: abaixo disso os rótulos do eixo X se sobrepõem e o
// gráfico passa a rolar na horizontal em vez de espremer.
const LARGURA_POR_PONTO = 44;
const LARGURA_MINIMA = 280;

function formatarEixoMoeda(valor: number): string {
  if (Math.abs(valor) >= 1000) return `R$ ${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return `R$ ${valor.toFixed(0)}`;
}

/**
 * Gráfico de série do Painel: barras (lado a lado ou empilhadas) e linhas
 * sobre um eixo só. Um componente para receita × despesa, cadastrado × pago,
 * uso do crédito e compromissos futuros. A legenda fica com quem usa.
 */
export function BarrasSerieChart({
  pontos, series, formatarValor, formatarEixo = formatarEixoMoeda, altura = 220,
}: BarrasSerieChartProps) {
  const cores = useCoresGrafico();
  const labels = Object.fromEntries(series.map((serie) => [serie.chave, serie.rotulo]));
  // Só o segmento do topo de cada pilha ganha cantos arredondados.
  const ultimaDaPilha = new Map(series.filter((serie) => serie.pilha).map((serie) => [serie.pilha, serie.chave]));
  const eixo = { fontSize: 11, fill: cores.eixo };

  return (
    <div className="overflow-x-auto">
      <div
        style={{ height: altura, minWidth: Math.max(LARGURA_MINIMA, pontos.length * LARGURA_POR_PONTO) }}
        role="img"
        aria-label={series.map((serie) => serie.rotulo).join(', ')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={cores.grade} />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={{ stroke: cores.eixoZero }} tick={eixo} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={eixo} tickFormatter={formatarEixo} />
            <Tooltip cursor={{ fill: cores.destaque, fillOpacity: 0.06 }} content={<ChartTooltip labels={labels} formatarValor={formatarValor} />} />
            {series.map((serie) => (serie.tipo === 'barra'
              ? (
                <Bar
                  key={serie.chave}
                  dataKey={serie.chave}
                  name={serie.rotulo}
                  fill={serie.cor}
                  stackId={serie.pilha}
                  radius={!serie.pilha || ultimaDaPilha.get(serie.pilha) === serie.chave ? [3, 3, 0, 0] : undefined}
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
                  dot={{ r: 4, fill: serie.cor, stroke: cores.superficie, strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: serie.cor, stroke: cores.superficie, strokeWidth: 2 }}
                  type="linear"
                  isAnimationActive={false}
                />
              )))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
