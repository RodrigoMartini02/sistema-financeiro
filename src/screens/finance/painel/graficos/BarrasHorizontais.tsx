import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../../formatters';
import { useCoresGrafico } from '../coresGrafico';
import { formatarPercentual } from '../painelFormat';
import { ConteudoDetalhe, useDetalhe } from './Detalhe';

export interface LinhaHorizontal {
  id: string;
  nome: string;
  valor: number;
  meta?: number | null;
  /** % do total (modo "parte"). */
  parte?: number;
  /** Divisão da barra por pessoa. */
  segmentos?: { nome: string; valor: number; cor: string }[];
  subs?: LinhaHorizontal[];
  /** Notas pequenas no fim do detalhe. */
  observacoes?: string[];
}

interface BarrasHorizontaisProps {
  linhas: LinhaHorizontal[];
  /** "meta": barra com a meta marcada e selo de % da meta. "parte": selo de % do total. */
  modo: 'meta' | 'parte';
  /** Principais mostradas antes de "ver todas"; sem valor, mostra todas. */
  limiteVisivel?: number;
}

// Mesmos limites do Planejamento: a partir de 80% da meta pede atenção; acima de 100%, passou.
const FAIXA_ATENCAO = 0.8;

const SELO = 'inline-flex rounded-full px-2 py-px text-[11.5px] font-medium';

function Selo({ linha, modo }: { linha: LinhaHorizontal; modo: 'meta' | 'parte' }) {
  if (modo === 'meta' && linha.meta) {
    const proporcao = linha.valor / linha.meta;
    const tom = proporcao > 1
      ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
      : proporcao >= FAIXA_ATENCAO
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
    return <span className={`${SELO} ${tom}`}>{formatarPercentual(proporcao * 100)}</span>;
  }
  if (modo === 'parte' && linha.parte !== undefined) {
    return <span className={`${SELO} bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300`}>{formatarPercentual(linha.parte)}</span>;
  }
  return null;
}

/** Trilho com a barra que cresce da esquerda ao aparecer. */
function Trilho({ largura, cor, segmentos, meta, fina }: {
  largura: number;
  cor: string;
  segmentos?: LinhaHorizontal['segmentos'];
  meta?: number | null;
  fina: boolean;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const quadro = requestAnimationFrame(() => setMontado(true));
    return () => cancelAnimationFrame(quadro);
  }, []);
  const total = segmentos?.reduce((soma, segmento) => soma + segmento.valor, 0) ?? 0;
  return (
    <span className={`relative block rounded-full bg-slate-100 dark:bg-slate-700 ${fina ? 'h-2' : 'h-3'}`}>
      <span
        className="absolute inset-y-0 left-0 flex gap-0.5 overflow-hidden rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${montado ? largura : 0}%`, background: segmentos?.length ? undefined : cor }}
      >
        {segmentos && total > 0 && segmentos.map((segmento) => (
          <span key={segmento.nome} className="h-full" style={{ width: `${(segmento.valor / total) * 100}%`, background: segmento.cor }} />
        ))}
      </span>
      {meta != null && (
        <span className="absolute -inset-y-1 w-0.5 rounded-sm bg-slate-900 dark:bg-white" style={{ left: `calc(${meta}% - 1px)` }} aria-hidden="true" />
      )}
    </span>
  );
}

/** Barras horizontais com valor e selo; linhas com subcategorias abrem e fecham. */
export function BarrasHorizontais({ linhas, modo, limiteVisivel }: BarrasHorizontaisProps) {
  const cores = useCoresGrafico();
  const detalhe = useDetalhe();
  const [todas, setTodas] = useState(false);
  // A primeira linha com subcategorias já vem aberta, para mostrar que dá para abrir.
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(linhas.filter((l) => l.subs?.length).slice(0, 1).map((l) => l.id)));

  const maximo = Math.max(1, ...linhas.map((linha) => Math.max(linha.valor, modo === 'meta' ? linha.meta ?? 0 : 0)));
  const visiveis = limiteVisivel && !todas ? linhas.slice(0, limiteVisivel) : linhas;
  const ocultas = linhas.length - visiveis.length;

  const corDa = (linha: LinhaHorizontal, sub: boolean) => (
    modo === 'meta' && linha.meta && linha.valor > linha.meta ? cores.negativo : sub ? cores.destaqueSuave : cores.destaque
  );

  const mostrarDetalhe = (linha: LinhaHorizontal, sub: boolean, evento: { clientX: number; clientY: number }) => {
    const extras: [string, ReactNode, string?][] = [];
    if (modo === 'meta' && linha.meta) {
      extras.push(['Meta', formatCurrency(linha.meta)]);
      extras.push([linha.valor > linha.meta ? 'Passou' : 'Falta', formatCurrency(Math.abs(linha.meta - linha.valor))]);
    }
    // Com uma pessoa só, a parte dela é o próprio valor da linha: não repete.
    if ((linha.segmentos?.length ?? 0) > 1) {
      for (const segmento of linha.segmentos!) extras.push([segmento.nome, formatCurrency(segmento.valor), segmento.cor]);
    }
    detalhe.mostrar(evento, (
      <ConteudoDetalhe nome={linha.nome} cor={corDa(linha, sub)} valor={linha.valor} parte={modo === 'parte' ? linha.parte : null} linhas={extras} observacoes={linha.observacoes} />
    ));
  };

  const alternar = (id: string) => setAbertas((atual) => {
    const proximo = new Set(atual);
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    return proximo;
  });

  const renderLinha = (linha: LinhaHorizontal, sub: boolean) => {
    const temSubs = !sub && !!linha.subs?.length;
    const aberta = abertas.has(linha.id);
    const nome = temSubs ? (
      <button
        type="button"
        onClick={() => alternar(linha.id)}
        aria-expanded={aberta}
        className="flex min-w-0 items-center gap-1.5 text-left text-slate-700 hover:text-cyan-700 dark:text-slate-200 dark:hover:text-cyan-300"
      >
        <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${aberta ? 'rotate-90' : ''}`} aria-hidden="true" />
        <span className="truncate">{linha.nome}</span>
      </button>
    ) : (
      <span className={`truncate ${sub ? 'pl-10 text-[13px] text-slate-500 dark:text-slate-400' : 'pl-5 text-slate-700 dark:text-slate-200'}`} title={linha.nome}>{linha.nome}</span>
    );
    return (
      <div
        key={linha.id}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(110px,170px)_minmax(0,1fr)_auto]"
        onPointerEnter={(evento) => mostrarDetalhe(linha, sub, evento)}
        onPointerMove={detalhe.mover}
        onPointerLeave={detalhe.esconder}
      >
        {nome}
        <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
          <Trilho
            largura={(linha.valor / maximo) * 100}
            cor={corDa(linha, sub)}
            segmentos={linha.segmentos}
            meta={modo === 'meta' && linha.meta ? (linha.meta / maximo) * 100 : null}
            fina={sub}
          />
        </span>
        <span className={`flex items-center justify-end gap-2 tabular-nums ${sub ? 'text-[13px] text-slate-600 dark:text-slate-300' : 'text-slate-800 dark:text-slate-100'}`}>
          {formatCurrency(linha.valor)}
          <Selo linha={linha} modo={modo} />
        </span>
      </div>
    );
  };

  return (
    <div className="grid gap-3 text-sm">
      {visiveis.map((linha) => (
        <div key={linha.id} className="grid gap-2.5">
          {renderLinha(linha, false)}
          {abertas.has(linha.id) && linha.subs?.map((sub) => renderLinha(sub, true))}
        </div>
      ))}
      {(ocultas > 0 || todas) && (
        <button
          type="button"
          onClick={() => setTodas((atual) => !atual)}
          aria-expanded={todas}
          className="inline-flex items-center gap-1 justify-self-start text-[12.5px] font-medium text-cyan-700 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300"
        >
          {todas ? <>Ver menos <ChevronUp size={13} /></> : <>Ver todas as {linhas.length} categorias <ChevronDown size={13} /></>}
        </button>
      )}
      {detalhe.caixa}
    </div>
  );
}
