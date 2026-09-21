import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Target } from 'lucide-react';
import type { DashboardPanoramaData } from '../../types/finance';
import { Card } from '../../ui/card';
import { formatCurrency } from './formatters';
import { firstName, memberColor } from './memberColors';

/** Categorias-raiz mostradas antes de "ver todas" — subs não contam aqui, só aparecem ao expandir a raiz. */
const CATEGORIAS_VISIVEIS = 5;

/** Gasto de um membro dentro de uma categoria — um pedaço colorido da barra. */
interface Segmento {
  usuarioId: number;
  nome: string;
  valor: number;
  color: string;
}

/** Categoria consolidada: as linhas por autor viram um total e seus segmentos. */
interface CategoriaAgregada {
  categoriaId: number | null;
  categoria: string;
  parentId: number | null;
  total: number;
  segmentos: Segmento[];
}

/** Raiz com suas subcategorias já agrupadas. */
interface CategoriaTreeNode {
  root: CategoriaAgregada;
  /** Gasto da própria raiz somado ao das subcategorias. */
  total: number;
  /** Segmentos por membro do total acima (raiz + subs). */
  segmentos: Segmento[];
  children: CategoriaAgregada[];
}

const COR_CATEGORIA = '#0891b2';
const COR_SUBCATEGORIA = '#7dd3d8';

interface MonthCategoriesOverviewProps {
  porCategoria: DashboardPanoramaData['porCategoria'] | undefined;
  periodLabel: string;
  /** Cor de cada membro, por usuario_id — mesma paleta dos donuts do painel. */
  memberColors: Map<number, string>;
  /** Divide as barras por membro só quando há mais de uma pessoa no filtro. */
  segmentarPorMembro: boolean;
}

export function MonthCategoriesOverview({
  porCategoria, periodLabel, memberColors, segmentarPorMembro,
}: MonthCategoriesOverviewProps) {
  const [expandido, setExpandido] = useState(false);
  // Raizes iniciam colapsadas — mesma abordagem de CategoriasTab (o default
  // "fechado" não depende de um efeito para popular ids).
  const [expandedRoots, setExpandedRoots] = useState<number[]>([]);

  const linhas = (porCategoria ?? []).filter((linha) => linha.total > 0);
  if (linhas.length === 0) return null;

  const total = linhas.reduce((s, linha) => s + linha.total, 0);

  // A query devolve uma linha por (categoria, autor). Consolida por categoria
  // guardando a divisao por membro, que colore a barra quando ha mais de uma
  // pessoa no filtro.
  const somarSegmentos = (destino: Map<number, Segmento>, usuarioId: number | null, nome: string | null, valor: number) => {
    if (usuarioId === null) return;
    const atual = destino.get(usuarioId);
    if (atual) atual.valor += valor;
    else destino.set(usuarioId, {
      usuarioId,
      nome: firstName(nome ?? ''),
      valor,
      color: memberColor(memberColors, usuarioId),
    });
  };

  const porCategoriaId = new Map<string, CategoriaAgregada & { segMap: Map<number, Segmento> }>();
  for (const linha of linhas) {
    const chave = String(linha.categoriaId ?? linha.categoria);
    let agregada = porCategoriaId.get(chave);
    if (!agregada) {
      agregada = {
        categoriaId: linha.categoriaId,
        categoria: linha.categoria,
        parentId: linha.parentId,
        total: 0,
        segmentos: [],
        segMap: new Map(),
      };
      porCategoriaId.set(chave, agregada);
    }
    agregada.total += linha.total;
    somarSegmentos(agregada.segMap, linha.usuarioId, linha.autorNome, linha.total);
  }

  const ordenarSegmentos = (mapa: Map<number, Segmento>) =>
    [...mapa.values()].sort((a, b) => b.valor - a.valor);

  const allItems: CategoriaAgregada[] = [...porCategoriaId.values()].map((c) => ({
    categoriaId: c.categoriaId,
    categoria: c.categoria,
    parentId: c.parentId,
    total: c.total,
    segmentos: ordenarSegmentos(c.segMap),
  }));

  // Arvore: raiz + subs. Uma sub cujo pai nao aparece em allItems (pai sem
  // gasto proprio no periodo) ainda precisa aparecer sob ele, entao a raiz
  // e reconhecida por nao ter pai VISIVEL na lista — nao por ter gasto.
  const porId = new Map(allItems.map((item) => [item.categoriaId, item]));
  const ehRaiz = (item: CategoriaAgregada) => item.parentId === null || !porId.has(item.parentId);

  // O valor da categoria-pai e o proprio gasto MAIS o das subcategorias: a
  // query devolve cada categoria com o que foi lancado diretamente nela, e
  // sem somar os filhos o pai aparecia quase zerado (o gasto costuma estar
  // nas subs), quebrando tambem a escala das barras. Os segmentos do pai
  // seguem o mesmo criterio: somam os membros dele e dos filhos.
  const filhosDe = (id: number | null) => allItems.filter((i) => i.parentId !== null && i.parentId === id);

  const tree: CategoriaTreeNode[] = allItems
    .filter(ehRaiz)
    .map((root) => {
      const filhos = filhosDe(root.categoriaId);
      const segMap = new Map<number, Segmento>();
      for (const seg of [root, ...filhos].flatMap((c) => c.segmentos)) {
        somarSegmentos(segMap, seg.usuarioId, seg.nome, seg.valor);
      }
      return {
        root,
        total: root.total + filhos.reduce((s, f) => s + f.total, 0),
        segmentos: ordenarSegmentos(segMap),
        children: filhos.sort((a, b) => b.total - a.total),
      };
    })
    .sort((a, b) => b.total - a.total);

  // A escala sai do maior total de raiz (ja com os filhos somados) — usar o
  // maior valor solto deixava todas as barras de pai minusculas.
  const max = Math.max(1, ...tree.map((node) => node.total));

  // Legenda de membros: sai de quem de fato tem gasto no periodo.
  const membrosNaLegenda = segmentarPorMembro
    ? [...new Map(tree.flatMap((n) => n.segmentos).map((s) => [s.usuarioId, s])).values()]
      .sort((a, b) => b.valor - a.valor)
    : [];

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
          {/* Com mais de um membro filtrado a cor passa a identificar a
              pessoa, entao a legenda vira a dos membros. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {segmentarPorMembro ? (
              membrosNaLegenda.map((seg) => (
                <span key={seg.usuarioId} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-sm" style={{ background: seg.color }} />{seg.nome}
                </span>
              ))
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm" style={{ background: COR_CATEGORIA }} />categoria</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-sm" style={{ background: COR_SUBCATEGORIA }} />subcategoria</span>
              </>
            )}
          </div>
        </div>

        <div className="grid">
          {treeVisivel.map((node) => {
            const hasChildren = node.children.length > 0;
            const isNodeExpanded = expandedRoots.includes(node.root.categoriaId ?? -1);
            // `valor` e o que a linha representa: na raiz, o total ja somado
            // com as subcategorias; na sub, o gasto dela mesma. `segmentos` e
            // a divisao desse mesmo valor entre os membros.
            const renderRow = (
              item: CategoriaAgregada,
              valor: number,
              segmentos: Segmento[],
              isChild: boolean,
              expandControl?: React.ReactNode,
            ) => {
              const barWidth = Math.min(100, (valor / max) * 100);
              const alturaBarra = isChild ? 'h-3' : 'h-6';
              return (
                <div
                  key={item.categoriaId ?? item.categoria}
                  className={`flex items-center gap-3.5 border-t border-[#eef4f7] first:border-t-0 dark:border-slate-700 ${isChild ? 'pl-6 py-[7px]' : 'py-[11px]'}`}
                >
                  {!isChild && (
                    <span className="flex w-4 shrink-0 items-center justify-center">
                      {expandControl}
                    </span>
                  )}
                  <span
                    className={`w-28 shrink-0 truncate text-[#0f2b38] dark:text-slate-100 ${isChild ? 'text-[11.5px] font-normal' : 'text-[12.5px] font-semibold'}`}
                    title={item.categoria}
                  >
                    {item.categoria}
                  </span>
                  <div className={`relative flex-1 rounded-md bg-[#f5f9fb] dark:bg-slate-800 ${alturaBarra}`}>
                    {segmentarPorMembro && segmentos.length > 0 ? (
                      // Segmentos lado a lado ocupando a largura da barra:
                      // cada um e a fatia de um membro naquela categoria.
                      <div className={`flex overflow-hidden rounded-md ${alturaBarra}`} style={{ width: `${barWidth}%` }}>
                        {segmentos.map((seg) => (
                          <div
                            key={seg.usuarioId}
                            style={{ width: `${(seg.valor / valor) * 100}%`, background: seg.color }}
                            title={`${seg.nome}: ${formatCurrency(seg.valor)}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        className={`rounded-md ${alturaBarra}`}
                        style={{ width: `${barWidth}%`, background: isChild ? COR_SUBCATEGORIA : COR_CATEGORIA }}
                      />
                    )}
                  </div>
                  {/* Subcategoria usa a mesma fonte/peso da propria descricao:
                      o destaque em negrito e da categoria-pai. */}
                  <span
                    className={`w-24 shrink-0 text-right tabular-nums ${isChild ? 'text-[11.5px] font-normal text-[#0f2b38] dark:text-slate-100' : 'text-[12.5px] font-bold text-[#0f2b38] dark:text-white'}`}
                  >
                    {formatCurrency(valor)}
                  </span>
                </div>
              );
            };
            return (
              <div key={node.root.categoriaId ?? node.root.categoria}>
                {renderRow(node.root, node.total, node.segmentos, false, hasChildren ? (
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
                {hasChildren && isNodeExpanded && node.children.map((child) => renderRow(child, child.total, child.segmentos, true))}
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
          {segmentarPorMembro
            ? 'Ordenadas por valor gasto no período; cada cor na barra é a fatia de um membro.'
            : 'Ordenadas por valor gasto no período, considerando o filtro de membros ativo.'}
        </p>
      </div>
    </Card>
  );
}
