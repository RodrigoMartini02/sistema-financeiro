import type { ReactNode } from 'react';

/** Seção do painel: rótulo discreto com a linha divisória desenhada por CSS, sem `div` decorativa. */
export function Secao({ titulo, detalhe, children }: { titulo: string; detalhe?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3.5">
      <h2 className="m-0 flex items-center gap-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5f7885] after:h-px after:flex-1 after:bg-[#e6eef3] after:content-[''] dark:text-slate-400 dark:after:bg-slate-700">
        {titulo}
        {detalhe && <span className="font-semibold normal-case tracking-normal text-[#7b93a1]">· {detalhe}</span>}
      </h2>
      {children}
    </section>
  );
}

/** Cabeçalho de card: título à esquerda, detalhe opcional à direita. */
export function CabecalhoCard({ titulo, detalhe }: { titulo: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5">
      <h3 className="text-[13.5px] font-bold text-[#0f2b38] dark:text-white">{titulo}</h3>
      {detalhe && <span className="text-[11.5px] text-[#5f7885] dark:text-slate-400">{detalhe}</span>}
    </div>
  );
}

/** Frase de leitura no rodapé do card, separada por uma linha. */
export function RodapeCard({ children }: { children: ReactNode }) {
  return (
    <p className="mt-auto border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
      {children}
    </p>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="flex-1 py-8 text-center text-sm text-slate-400">{children}</p>;
}
