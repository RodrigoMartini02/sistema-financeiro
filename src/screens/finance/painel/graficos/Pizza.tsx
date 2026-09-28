import { useRef, useState, type ReactNode } from 'react';
import { formatCurrency } from '../../formatters';
import { corDaPaleta, useCoresGrafico } from '../coresGrafico';
import { useTransicao, Vazio } from '../base';
import { ConteudoDetalhe, useDetalhe } from './Detalhe';

export interface FatiaPizza {
  nome: string;
  valor: number;
  /** Cor fixa (ex.: a da pessoa, a da situação); sem ela, a cor segue a paleta. */
  cor?: string;
  /** Linhas extras do detalhe (subcategorias, compras, limite...). */
  detalhes?: [string, ReactNode][];
}

interface PizzaProps {
  fatias: FatiaPizza[];
  vazio: string;
  /** Menor diâmetro do disco; acima dele, o disco ocupa o espaço livre do card. */
  tamanhoMinimo: number;
  /** false mantém a ordem recebida (ex.: Renda fixa e extra). */
  ordenar?: boolean;
  /** Card largo: legenda ao lado do disco, em coluna. */
  legendaAoLado?: boolean;
}

const RAIO = 118;
const AFASTAMENTO = 8;

function arco(inicio: number, fim: number): string {
  const angulo = fim - inicio;
  if (angulo >= Math.PI * 2 - 1e-6) {
    return `M0 ${-RAIO}A${RAIO} ${RAIO} 0 1 1 0 ${RAIO}A${RAIO} ${RAIO} 0 1 1 0 ${-RAIO}Z`;
  }
  const x1 = RAIO * Math.cos(inicio), y1 = RAIO * Math.sin(inicio);
  const x2 = RAIO * Math.cos(fim), y2 = RAIO * Math.sin(fim);
  return `M0 0L${x1} ${y1}A${RAIO} ${RAIO} 0 ${angulo > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`;
}

/**
 * Pizza inteira do painel: todas as fatias, legenda enxuta (cor + nome) e o
 * detalhe (valor, % e extras) só da fatia sob o mouse. Passar o mouse na
 * legenda destaca a fatia. O disco ocupa o espaço livre do card sem esticá-lo.
 */
export function Pizza({ fatias, vazio, tamanhoMinimo, ordenar = true, legendaAoLado = false }: PizzaProps) {
  const cores = useCoresGrafico();
  const detalhe = useDetalhe();
  const [ativa, setAtiva] = useState<string | null>(null);
  // A cor de cada nome fica fixa enquanto o card existe: trocar o período não embaralha as cores.
  const indices = useRef(new Map<string, number>());

  const itens = fatias.filter((fatia) => fatia.valor > 0);
  if (ordenar) itens.sort((a, b) => b.valor - a.valor);
  for (const item of itens) {
    if (!indices.current.has(item.nome)) indices.current.set(item.nome, indices.current.size);
  }
  const corDe = (item: FatiaPizza) => item.cor ?? corDaPaleta(indices.current.get(item.nome)!, cores);

  const alvo = Object.fromEntries(itens.map((item) => [item.nome, item.valor]));
  const { de, p } = useTransicao(alvo, JSON.stringify(alvo));

  if (itens.length === 0) return <Vazio>{vazio}</Vazio>;

  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  const valorDesenhado = (nome: string) => (de ? (de[nome] ?? 0) + (alvo[nome]! - (de[nome] ?? 0)) * p : alvo[nome]!);
  const totalDesenhado = itens.reduce((soma, item) => soma + valorDesenhado(item.nome), 0);
  const varredura = de ? 1 : p;

  const destacar = (item: FatiaPizza | null, evento?: { clientX: number; clientY: number }) => {
    setAtiva(item?.nome ?? null);
    if (!item || !evento) {
      detalhe.esconder();
      return;
    }
    detalhe.mostrar(evento, (
      <ConteudoDetalhe nome={item.nome} cor={corDe(item)} valor={item.valor} parte={(item.valor / total) * 100} linhas={item.detalhes} />
    ));
  };

  let angulo = -Math.PI / 2;
  const fatiasDesenhadas = totalDesenhado > 0 ? itens.map((item) => {
    const tamanho = (valorDesenhado(item.nome) / totalDesenhado) * Math.PI * 2 * varredura;
    const inicio = angulo;
    angulo += tamanho;
    const meio = inicio + tamanho / 2;
    return { item, d: arco(inicio, inicio + tamanho), dx: Math.cos(meio) * AFASTAMENTO, dy: Math.sin(meio) * AFASTAMENTO };
  }) : [];

  return (
    <div className={`flex min-h-0 flex-1 items-center ${legendaAoLado ? 'flex-col justify-center gap-4 sm:flex-row sm:gap-7' : 'flex-col gap-2.5'}`}>
      {/* A área do disco não tem altura própria além do mínimo: ela só ocupa o
          espaço que o card já tem. O SVG fica por cima dela (absolute) para que
          a proporção do disco nunca empurre a altura do card pela largura. */}
      <div
        className={legendaAoLado ? 'relative h-[180px] w-[180px] shrink-0' : 'relative w-full flex-1 basis-0'}
        style={legendaAoLado ? undefined : { minHeight: tamanhoMinimo }}
      >
        <svg viewBox="-130 -130 260 260" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
          {fatiasDesenhadas.map(({ item, d, dx, dy }) => (
            <path
              key={item.nome}
              d={d}
              fill={corDe(item)}
              stroke={cores.superficie}
              strokeWidth={1.5}
              strokeLinejoin="round"
              className="cursor-pointer transition-[transform,opacity] duration-200"
              style={{
                transform: ativa === item.nome ? `translate(${dx}px, ${dy}px)` : undefined,
                opacity: ativa && ativa !== item.nome ? 0.32 : 1,
              }}
              onPointerEnter={(evento) => destacar(item, evento)}
              onPointerMove={detalhe.mover}
              onPointerLeave={() => destacar(null)}
            />
          ))}
        </svg>
      </div>
      <ul className={`m-0 flex list-none p-0 text-[11px] text-slate-600 dark:text-slate-300 ${legendaAoLado ? 'flex-row flex-wrap justify-center sm:flex-col' : 'flex-wrap justify-center gap-x-0.5'}`}>
        {itens.map((item) => (
          <li
            key={item.nome}
            className={`inline-flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-opacity hover:bg-slate-100 dark:hover:bg-slate-700/60 ${ativa && ativa !== item.nome ? 'opacity-40' : ''}`}
            onPointerEnter={(evento) => destacar(item, evento)}
            onPointerMove={detalhe.mover}
            onPointerLeave={() => destacar(null)}
          >
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: corDe(item) }} aria-hidden="true" />
            {item.nome}
            <span className="sr-only">: {formatCurrency(item.valor)}</span>
          </li>
        ))}
      </ul>
      {detalhe.caixa}
    </div>
  );
}
