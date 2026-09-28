import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatCurrency } from '../../formatters';
import { useCoresGrafico } from '../coresGrafico';
import { useTransicao } from '../base';
import { formatarPercentual } from '../painelFormat';
import { ConteudoDetalhe, useDetalhe } from './Detalhe';

export interface PontoBarras {
  rotulo: string;
  /** Título do detalhe; sem ele, o rótulo do eixo. */
  titulo?: string;
  /** Trecho que ainda vai vencer: usa `corFuturo` da série, quando houver. */
  futuro?: boolean;
  valores: Record<string, number>;
}

export interface SerieBarras {
  chave: string;
  rotulo: string;
  cor: string | ((valor: number) => string);
  corFuturo?: string;
}

interface BarrasProps {
  pontos: PontoBarras[];
  series: SerieBarras[];
  altura: number;
  /** Uma barra por trecho, com as séries empilhadas. */
  empilhar?: boolean;
  /** Aceita valores negativos (barras abaixo do zero). */
  sinal?: boolean;
  /** Sem grade nem rótulos (card escuro do topo). */
  semEixo?: boolean;
  formatar?: (valor: number) => string;
  /** No detalhe, o % de cada série no trecho. */
  mostrarParte?: boolean;
  linhasExtras?: (ponto: PontoBarras) => [string, ReactNode][];
}

const LARGURA_MAXIMA_BARRA = 34;

function escalaBonita(maximo: number): number {
  if (maximo <= 0) return 1;
  const potencia = Math.pow(10, Math.floor(Math.log10(maximo)));
  for (const multiplo of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (multiplo * potencia >= maximo) return multiplo * potencia;
  }
  return 10 * potencia;
}

function formatarEixo(valor: number): string {
  if (Math.abs(valor) >= 1000) return `${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return undefined;
    const observador = new ResizeObserver(([entrada]) => setLargura(Math.floor(entrada!.contentRect.width)));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return { ref, largura };
}

/** Barras do painel: crescem da base, passam para os valores novos e mostram o detalhe do trecho sob o mouse. */
export function Barras({
  pontos, series, altura, empilhar = false, sinal = false, semEixo = false,
  formatar = formatCurrency, mostrarParte = false, linhasExtras,
}: BarrasProps) {
  const cores = useCoresGrafico();
  const detalhe = useDetalhe();
  const { ref, largura } = useLargura();
  const [ativo, setAtivo] = useState<number | null>(null);

  const alvo = pontos.map((ponto) => series.map((serie) => ponto.valores[serie.chave] ?? 0));
  const { de, p } = useTransicao(alvo, JSON.stringify(alvo), 800);
  const mesmoFormato = de !== null && de.length === alvo.length;
  const desenhado = alvo.map((linha, i) => linha.map((valor, k) => {
    const antes = mesmoFormato ? de[i]?.[k] ?? 0 : 0;
    return antes + (valor - antes) * p;
  }));

  const corDa = (serie: SerieBarras, valor: number, ponto: PontoBarras) =>
    ponto.futuro && serie.corFuturo ? serie.corFuturo : typeof serie.cor === 'function' ? serie.cor(valor) : serie.cor;

  const m = { esquerda: semEixo ? 0 : 46, direita: 4, topo: 8, base: semEixo ? 4 : 24 };
  const larguraUtil = Math.max(0, largura - m.esquerda - m.direita);
  const alturaUtil = altura - m.topo - m.base;
  const positivo = (linha: number[]) => (empilhar ? linha.reduce((s, v) => s + Math.max(0, v), 0) : Math.max(0, ...linha));
  const topo = escalaBonita(Math.max(1, ...alvo.map(positivo)));
  const fundo = sinal ? -escalaBonita(Math.max(1, ...alvo.map((linha) => -Math.min(0, ...linha)))) : 0;
  const y = (valor: number) => m.topo + alturaUtil - ((valor - fundo) / (topo - fundo)) * alturaUtil;

  const banda = larguraUtil / Math.max(1, pontos.length);
  const grupo = empilhar ? 1 : series.length;
  const larguraBarra = Math.max(2, Math.min(LARGURA_MAXIMA_BARRA, (banda * 0.72) / grupo));
  const vao = grupo > 1 ? Math.min(4, larguraBarra * 0.2) : 0;
  // Rótulos do eixo sem se sobrepor: em tela estreita, pula alguns.
  const passoRotulo = Math.max(1, Math.ceil((pontos.length * 40) / Math.max(1, larguraUtil)));

  const abrir = (indice: number, evento: { clientX: number; clientY: number }) => {
    setAtivo(indice);
    const ponto = pontos[indice]!;
    const linha = alvo[indice]!;
    const somaTrecho = linha.reduce((s, v) => s + v, 0);
    const linhas: [string, ReactNode, string?][] = series.map((serie, k) => [
      serie.rotulo,
      <>
        {formatar(linha[k]!)}
        {mostrarParte && somaTrecho > 0 && <span className="ml-1.5 font-normal text-slate-400">{formatarPercentual((linha[k]! / somaTrecho) * 100)}</span>}
      </>,
      corDa(serie, linha[k]!, ponto),
    ]);
    detalhe.mostrar(evento, (
      <ConteudoDetalhe
        nome={`${ponto.titulo ?? ponto.rotulo}${ponto.futuro ? ' · ainda vai vencer' : ''}`}
        linhas={[...linhas, ...(linhasExtras?.(ponto) ?? [])]}
      />
    ));
  };
  const fechar = () => {
    setAtivo(null);
    detalhe.esconder();
  };

  return (
    <div ref={ref} className="w-full" style={{ height: altura }}>
      {largura > 0 && (
        <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} className="block overflow-visible" aria-hidden="true">
          {!semEixo && [0, 1, 2, 3, 4].map((passo) => {
            const valor = fundo + ((topo - fundo) * passo) / 4;
            return (
              <g key={passo}>
                <line x1={m.esquerda} x2={largura - m.direita} y1={y(valor)} y2={y(valor)} stroke={valor === 0 ? cores.eixoZero : cores.grade} />
                <text x={m.esquerda - 8} y={y(valor) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{formatarEixo(valor)}</text>
              </g>
            );
          })}
          {semEixo && sinal && <line x1={0} x2={largura} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.18)" />}
          {pontos.map((ponto, i) => {
            const x0 = m.esquerda + banda * i;
            const inicio = x0 + (banda - (larguraBarra * grupo + vao * (grupo - 1))) / 2;
            let pilha = 0;
            const ultimaComValor = desenhado[i]!.reduce((ultima, valor, k) => (Math.abs(valor) > 1e-9 ? k : ultima), -1);
            return (
              <g key={`${ponto.rotulo}-${i}`}>
                <rect
                  x={x0} y={m.topo} width={banda} height={alturaUtil}
                  fill={semEixo ? 'rgba(255,255,255,0.07)' : cores.grade}
                  opacity={ativo === i ? 1 : 0}
                  onPointerEnter={(evento) => abrir(i, evento)}
                  onPointerMove={detalhe.mover}
                  onPointerLeave={fechar}
                />
                {series.map((serie, k) => {
                  const valor = desenhado[i]![k]!;
                  if (Math.abs(valor) < 1e-9) return null;
                  const x = empilhar ? inicio : inicio + k * (larguraBarra + vao);
                  const base = empilhar ? pilha : 0;
                  if (empilhar) pilha += valor;
                  const ya = y(base + Math.max(0, valor));
                  const yb = y(base + Math.min(0, valor));
                  const raio = Math.min(5, larguraBarra / 2, (yb - ya) / 2);
                  const arredonda = !empilhar || k === ultimaComValor;
                  const d = valor >= 0
                    ? `M${x} ${yb}V${ya + (arredonda ? raio : 0)}${arredonda ? `Q${x} ${ya} ${x + raio} ${ya}H${x + larguraBarra - raio}Q${x + larguraBarra} ${ya} ${x + larguraBarra} ${ya + raio}` : `H${x + larguraBarra}`}V${yb}Z`
                    : `M${x} ${ya}V${yb - raio}Q${x} ${yb} ${x + raio} ${yb}H${x + larguraBarra - raio}Q${x + larguraBarra} ${yb} ${x + larguraBarra} ${yb - raio}V${ya}Z`;
                  return <path key={serie.chave} d={d} fill={corDa(serie, alvo[i]![k]!, ponto)} pointerEvents="none" />;
                })}
                {!semEixo && i % passoRotulo === 0 && (
                  <text x={x0 + banda / 2} y={altura - 6} textAnchor="middle" className="fill-slate-400 text-[11px]">{ponto.rotulo}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {detalhe.caixa}
    </div>
  );
}
