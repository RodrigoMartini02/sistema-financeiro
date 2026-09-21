import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Target } from 'lucide-react';
import type { DashboardPanoramaData } from '../../types/finance';
import { Card } from '../../ui/card';
import { formatCurrency } from './formatters';

/** Categorias-raiz mostradas antes de "ver todas" — subs não contam aqui, só aparecem ao expandir a raiz. */
const CATEGORIAS_VISIVEIS = 5;

type CategoriaLinha = DashboardPanoramaData['porCategoria'][number];

/** Raiz com suas subcategorias já agrupadas. */
interface CategoriaTreeNode {
  root: CategoriaLinha;
  children: CategoriaLinha[];
}

const COR_CATEGORIA = '#0891b2';
const COR_SUBCATEGORIA = '#7dd3d8';

interface MonthCategoriesOverviewProps {
  porCategoria: DashboardPanoramaData['porCategoria'] | undefined;
  periodLabel: string;
}

export function MonthCategoriesOverview({ porCategoria, periodLabel }: MonthCategoriesOverviewProps) {
  const [expandido, setExpandido] = useState(false);
  // Raizes iniciam colapsadas — mesma abordagem de CategoriasTab (o default
  // "fechado" não depende de um efeito para popular ids).
  const [expandedRoots, setExpandedRoots] = useState<number[]>([]);

  const allItems = (porCategoria ?? []).filter((item) => item.total > 0);
  if (allItems.length === 0) return null;

  const total = allItems.reduce((s, item) => s + item.total, 0);
  const max = Math.max(1, ...allItems.map((item) => item.total));

  // Arvore: raiz + subs. Uma sub cujo pai nao aparece em allItems (pai sem
  // gasto no periodo) vira raiz propria, para nao sumir da tela.
  const visibleIds = new Set(allItems.map((item) => item.categoriaId));
  const roots = allItems
    .filter((item) => item.parentId === null || !visibleIds.has(item.parentId))
    .sort((a, b) => b.total - a.total);
  const tree: CategoriaTreeNode[] = roots.map((root) => ({
    root,
    children: allItems.filter((item) => item.parentId === root.categoriaId).sort((a, b) => b.total - a.total),
  }));

  // O corte "top 5 / ver mais" conta so raizes — subs so aparecem ao expandir
  // a raiz correspondente, sem ocupar vaga nesse corte.
  const treeVisivel = expandido ? tree : tree.slice(0, CATEGORIAS_VISIVEIS);
  const raizesOcultas = tree.length - treeVisivel.length;

  const toggleRoot = (id: number | null) => {
    if (id === null) return;
    setExpandedRoots((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Card className="overflow-hidden rounded-2xl p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e6eef3] px-[22px] py-5 dark:border-slate-700">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[#b9e6ef] bg-[#e6f7fa] text-[#0891b2] dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300">
          <Target size={18} />
        </span>
        <div>
          <h2 className="text-[15.5px] font-bold tracking-[-0.01em] text-[#0f2b38] dark:text-white">Categorias <span className="font-semibold text-[#6c8593] dark:text-slate-400">— {periodLabel}</span></h2>
          <p className="mt-0.5 text-xs text-[#7b93a1] dark:text-slate-400">Quanto cada categoria consumiu no período, considerando o filtro atual.</p>
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex items-center justify-between text-[11px] text-[#5f7885] dark:text-slate-400">
          <span>{formatCurrency(total)} em {tree.length} categoria{tree.length === 1 ? '' : 's'}</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm" style={{ background: COR_CATEGORIA }} />categoria</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-sm" style={{ background: COR_SUBCATEGORIA }} />subcategoria</span>
          </div>
        </div>

        <div className="grid">
          {treeVisivel.map((node) => {
            const hasChildren = node.children.length > 0;
            const isNodeExpanded = expandedRoots.includes(node.root.categoriaId ?? -1);
            const renderRow = (item: CategoriaLinha, isChild: boolean, expandControl?: React.ReactNode) => {
              const barWidth = Math.min(100, (item.total / max) * 100);
              return (
                <div
                  key={item.categoriaId ?? item.categoria}
                  className={`flex items-center gap-3.5 border-t border-[#eef4f7] py-[11px] first:border-t-0 dark:border-slate-700 ${isChild ? 'pl-6' : ''}`}
                >
                  {!isChild && (
                    <span className="flex w-4 shrink-0 items-center justify-center">
                      {expandControl}
                    </span>
                  )}
                  <span
                    className={`w-28 shrink-0 truncate text-[#0f2b38] dark:text-slate-100 ${isChild ? 'text-[11.5px] font-medium' : 'text-[12.5px] font-semibold'}`}
                    title={item.categoria}
                  >
                    {item.categoria}
                  </span>
                  <div className={`relative flex-1 rounded-md bg-[#f5f9fb] dark:bg-slate-800 ${isChild ? 'h-4' : 'h-6'}`}>
                    <div
                      className={`rounded-md ${isChild ? 'h-4' : 'h-6'}`}
                      style={{ width: `${barWidth}%`, background: isChild ? COR_SUBCATEGORIA : COR_CATEGORIA }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-[12.5px] font-bold tabular-nums text-[#0f2b38] dark:text-white">{formatCurrency(item.total)}</span>
                </div>
              );
            };
            return (
              <div key={node.root.categoriaId ?? node.root.categoria}>
                {renderRow(node.root, false, hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleRoot(node.root.categoriaId)}
                    aria-expanded={isNodeExpanded}
                    aria-label={isNodeExpanded ? 'Recolher subcategorias' : 'Expandir subcategorias'}
                    className="flex h-4 w-4 items-center justify-center rounded text-[#7b93a1] transition hover:text-[#0891b2] dark:text-slate-400"
                  >
                    <ChevronRight size={13} strokeWidth={2.2} style={{ transform: isNodeExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .13s ease' }} />
                  </button>
                ) : null)}
                {hasChildren && isNodeExpanded && node.children.map((child) => renderRow(child, true))}
              </div>
            );
          })}
        </div>

        {(raizesOcultas > 0 || expandido) && (
          <button
            type="button"
            onClick={() => setExpandido((atual) => !atual)}
            aria-expanded={expandido}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#eef4f7] py-2 text-[11.5px] font-semibold text-[#0891b2] transition hover:bg-[#f5f9fb] dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {expandido
              ? <>Ver menos <ChevronUp size={13} /></>
              : <>Ver todas as {tree.length} categorias <ChevronDown size={13} /></>}
          </button>
        )}

        <p className="mt-3.5 border-t border-[#eef4f7] pt-3.5 text-[11.5px] text-[#5f7885] dark:border-slate-700 dark:text-slate-400">
          Ordenadas por valor gasto no período, considerando o filtro de membros ativo.
        </p>
      </div>
    </Card>
  );
}
