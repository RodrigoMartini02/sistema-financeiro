import type { ReactNode } from 'react';
import { Card } from '../../../ui/card';

/** Seção do painel: rótulo no mesmo estilo dos grupos do filtro do sistema. */
export function Secao({ titulo, detalhe, children }: { titulo: string; detalhe?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
        {detalhe && <span className="font-normal normal-case tracking-normal">· {detalhe}</span>}
      </h2>
      {children}
    </section>
  );
}

/** Card do painel: o `Card` do kit, com o espaçamento e o empilhamento interno padrão. */
export function CardPainel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Card className={`flex min-w-0 flex-col gap-3.5 p-4 ${className}`}>{children}</Card>;
}

/** Cabeçalho de card: título à esquerda, detalhe opcional à direita. */
export function CabecalhoCard({ titulo, detalhe }: { titulo: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-0.5">
      <h3 className="m-0 text-sm font-semibold text-slate-900 dark:text-white">{titulo}</h3>
      {detalhe && <span className="text-xs text-slate-500 dark:text-slate-400">{detalhe}</span>}
    </div>
  );
}

/** Frase de leitura no rodapé do card, separada por uma linha. */
export function RodapeCard({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mt-auto border-t border-slate-100 pt-2.5 text-xs text-slate-500 [text-wrap:pretty] dark:border-slate-700 dark:text-slate-400">
      {children}
    </p>
  );
}

/** Legenda de séries: quadrado para barra/fatia, traço para linha. */
export function Legenda({ itens }: { itens: { cor: string; nome: string; linha?: boolean }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-3.5 p-0">
      {itens.map((item) => (
        <li key={item.nome} className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span className={item.linha ? 'h-0.5 w-3.5 rounded-full' : 'h-2 w-2 rounded-sm'} style={{ background: item.cor }} />
          {item.nome}
        </li>
      ))}
    </ul>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="m-0 flex-1 py-8 text-center text-sm text-slate-400">{children}</p>;
}
