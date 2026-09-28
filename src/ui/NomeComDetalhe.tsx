import type { ReactNode } from 'react';

interface NomeComDetalheProps {
  /** Parte principal, na cor do texto ao redor (categoria-grupo, forma de pagamento). */
  principal: ReactNode;
  /** Detalhe depois de "›", menor e em cinza (subcategoria, cartão). Sem ele, só o principal. */
  detalhe?: string | null;
}

/** "Principal › detalhe": mesmo formato para categoria (grupo › sub) e pagamento (forma › cartão). */
export function NomeComDetalhe({ principal, detalhe }: NomeComDetalheProps) {
  return (
    <>
      {principal}
      {detalhe && <span className="text-[11px] text-slate-400 dark:text-slate-500"> › {detalhe}</span>}
    </>
  );
}
