import { SlidersHorizontal } from 'lucide-react';

const NOMES_VISIVEIS = 4;

/**
 * Aviso do Painel filtrado: os filtros de despesa ligados (categoria, forma,
 * cartão). Lembra que só as despesas seguem o filtro — as receitas continuam
 * inteiras, por isso os blocos que comparam com a receita saem.
 */
export function AvisoPainelFiltrado({ nomes }: { nomes: string[] }) {
  const visiveis = nomes.slice(0, NOMES_VISIVEIS).join(', ');
  const restantes = nomes.length - NOMES_VISIVEIS;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-[13px] text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-100"
    >
      <SlidersHorizontal size={14} className="shrink-0" aria-hidden="true" />
      <span className="font-semibold">Painel filtrado:</span>
      <span className="min-w-0">{visiveis}{restantes > 0 ? ` e mais ${restantes}` : ''}</span>
      <span className="text-cyan-700 dark:text-cyan-300">· só as despesas seguem o filtro</span>
    </div>
  );
}
