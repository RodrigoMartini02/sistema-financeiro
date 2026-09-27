import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import type { PainelCategoria } from '../../types/finance';
import { formatCurrency } from './formatters';
import { firstName } from './memberColors';
import { useCoresGrafico } from './painel/coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, RodapeCard, Secao } from './painel/PainelLayout';

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

interface MonthCategoriesOverviewProps {
  porCategoria: PainelCategoria[] | undefined;
  periodLabel: string;
  /** Cor de cada pessoa, por usuario_id — a mesma de "Quem trouxe e quem gastou". */
  coresPorPessoa: Map<number, string>;
  /** Divide as barras por membro só quando há mais de uma pessoa no filtro. */
  segmentarPorMembro: boolean;
}

export function MonthCategoriesOverview({
  porCategoria, periodLabel, coresPorPessoa, segmentarPorMembro,
}: MonthCategoriesOverviewProps) {
  const cores = useCoresGrafico();
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
      color: coresPorPessoa.get(usuarioId) ?? cores.neutro,
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
    <Secao titulo="Categorias" detalhe="detalhamento">
      <CardPainel>
        <CabecalhoCard
          titulo="Onde mais gastou"
          detalhe={`${formatCurrency(total)} em ${tree.length} categoria${tree.length === 1 ? '' : 's'} · ${periodLabel}`}
        />
        {/* Com mais de uma pessoa filtrada a cor passa a identificar a pessoa,
            então a legenda vira a das pessoas. */}
        <Legenda
          itens={segmentarPorMembro
            ? membrosNaLegenda.map((seg) => ({ cor: seg.color, nome: seg.nome }))
            : [{ cor: cores.destaque, nome: 'Categoria' }, { cor: cores.destaqueSuave, nome: 'Subcategoria' }]}
        />

        <div className="flex flex-col">
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
              const alturaBarra = isChild ? 'h-1.5' : 'h-2';
              return (
                <div
                  key={item.categoriaId ?? item.categoria}
                  className={`flex items-center gap-3 border-t border-slate-100 first:border-t-0 dark:border-slate-700 ${isChild ? 'py-1.5 pl-7' : 'py-2.5'}`}
                >
                  {!isChild && <span className="flex w-4 shrink-0 items-center justify-center">{expandControl}</span>}
                  <span
                    className={`w-32 shrink-0 truncate ${isChild ? 'text-xs text-slate-600 dark:text-slate-300' : 'text-[12.5px] font-medium text-slate-900 dark:text-white'}`}
                    title={item.categoria}
                  >
                    {item.categoria}
                  </span>
                  <div className={`flex-1 rounded-full bg-slate-100 dark:bg-slate-700 ${alturaBarra}`}>
                    {segmentarPorMembro && segmentos.length > 0 ? (
                      // Segmentos lado a lado ocupando a largura da barra:
                      // cada um e a fatia de um membro naquela categoria.
                      <div className={`flex gap-0.5 overflow-hidden rounded-full ${alturaBarra}`} style={{ width: `${barWidth}%` }}>
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
                        className={`rounded-full ${alturaBarra}`}
                        style={{ width: `${barWidth}%`, background: isChild ? cores.destaqueSuave : cores.destaque }}
                      />
                    )}
                  </div>
                  <span
                    className={`w-24 shrink-0 text-right tabular-nums ${isChild ? 'text-xs text-slate-600 dark:text-slate-300' : 'text-[12.5px] font-semibold text-slate-900 dark:text-white'}`}
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
                    className="flex h-4 w-4 items-center justify-center rounded text-slate-400 transition hover:text-cyan-600 dark:hover:text-cyan-400"
                  >
                    <ChevronRight size={13} strokeWidth={2.2} className={`transition-transform duration-150 ${isNodeExpanded ? 'rotate-90' : ''}`} />
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
            className="inline-flex items-center gap-1 self-start text-[12.5px] font-semibold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
          >
            {expandido
              ? <>Ver menos <ChevronUp size={13} /></>
              : <>Ver todas as {tree.length} categorias <ChevronDown size={13} /></>}
          </button>
        )}

        <RodapeCard>
          {segmentarPorMembro
            ? 'Ordenadas por valor gasto no período; cada cor na barra é a fatia de uma pessoa.'
            : 'Ordenadas por valor gasto no período, considerando o filtro de pessoas ativo.'}
        </RodapeCard>
      </CardPainel>
    </Secao>
  );
}
