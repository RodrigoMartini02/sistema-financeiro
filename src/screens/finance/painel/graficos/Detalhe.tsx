import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '../../formatters';
import { formatarPercentual } from '../painelFormat';

interface Ponteiro {
  clientX: number;
  clientY: number;
}

interface EstadoDetalhe {
  x: number;
  y: number;
  conteudo: ReactNode;
}

const MARGEM = 16;

/**
 * Detalhe que acompanha o ponteiro: só do item sob o mouse (ou tocado). Vai
 * para o `body` para não ser cortado pelo card nem herdar o deslocamento do
 * hover do card.
 */
function CaixaDetalhe({ x, y, conteudo }: EstadoDetalhe) {
  const ref = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({ left: x + MARGEM, top: y + MARGEM });

  useLayoutEffect(() => {
    const caixa = ref.current;
    if (!caixa) return;
    const { offsetWidth: largura, offsetHeight: altura } = caixa;
    let left = x + MARGEM;
    let top = y + MARGEM;
    if (left + largura > window.innerWidth - 8) left = x - largura - MARGEM;
    if (top + altura > window.innerHeight - 8) top = y - altura - MARGEM;
    setPosicao({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y, conteudo]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-50 min-w-[180px] max-w-[260px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_14px_30px_-14px_rgba(13,46,60,0.35)] dark:border-slate-700 dark:bg-slate-800"
      style={posicao}
    >
      {conteudo}
    </div>,
    document.body,
  );
}

export function useDetalhe() {
  const [estado, setEstado] = useState<EstadoDetalhe | null>(null);
  const mostrar = useCallback((evento: Ponteiro, conteudo: ReactNode) => {
    setEstado({ x: evento.clientX, y: evento.clientY, conteudo });
  }, []);
  const mover = useCallback((evento: Ponteiro) => {
    setEstado((atual) => (atual ? { ...atual, x: evento.clientX, y: evento.clientY } : atual));
  }, []);
  const esconder = useCallback(() => setEstado(null), []);
  return { mostrar, mover, esconder, caixa: estado ? <CaixaDetalhe {...estado} /> : null };
}

/** Conteúdo padrão: nome com a cor, valor, % do todo e linhas extras. */
export function ConteudoDetalhe({ nome, cor, valor, parte, linhas = [] }: {
  nome: string;
  cor?: string;
  valor?: number;
  parte?: number | null;
  /** [rótulo, valor, cor opcional do marcador]. */
  linhas?: [string, ReactNode, string?][];
}) {
  return (
    <>
      <p className="m-0 flex items-center gap-1.5 text-[12.5px] font-medium text-slate-900 dark:text-white">
        {cor && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: cor }} aria-hidden="true" />}
        {nome}
      </p>
      {valor !== undefined && (
        <p className="m-0 mt-1.5 flex items-baseline justify-between gap-3.5 tabular-nums">
          <span className="text-base font-semibold text-slate-900 dark:text-white">{formatCurrency(valor)}</span>
          {parte != null && (
            <span className="rounded-full bg-cyan-50 px-1.5 text-xs font-medium text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
              {formatarPercentual(parte)}
            </span>
          )}
        </p>
      )}
      {linhas.length > 0 && (
        <dl className={`m-0 grid gap-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400 ${valor !== undefined ? 'mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-700' : 'mt-1'}`}>
          {linhas.map(([rotulo, texto, corLinha]) => (
            <div key={rotulo} className="flex justify-between gap-3">
              <dt className="flex items-center gap-1.5">
                {corLinha && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: corLinha }} aria-hidden="true" />}
                {rotulo}
              </dt>
              <dd className="m-0 font-medium text-slate-700 dark:text-slate-200">{texto}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
