import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { useLocation } from 'react-router-dom';
import { Button } from '../../ui/button';

// Lista de cartões com rolagem infinita e virtualizada (plano .plans/licitacoes-lista-infinita.md): só os cartões
// perto da tela ficam desenhados, e a próxima página é pedida quando a pessoa chega perto do fim. A página rola pela
// janela (o <main> do módulo não tem contêiner de rolagem), então vale o virtualizador de janela.

/** Altura estimada de um cartão, até ele ser medido (título em duas linhas, selos, métricas). */
const ESTIMATED_ROW_HEIGHT = 176;
const ROW_GAP = 12;
const OVERSCAN = 6;
/** Quando um dos últimos itens desta lista aparece, a próxima página é pedida. */
const LOAD_MORE_MARGIN = 5;
/** Barra superior do módulo (4rem, mais a borda) e uma folga: o item que a pessoa abre ao voltar não fica sob ela. */
const STICKY_TOP_PADDING = 80;

const NO_MEASUREMENTS: VirtualItem[] = [];

// O virtualizador rola a janela até o `initialOffset` ao montar. Sem um ponto guardado, vale onde a janela já está,
// para a lista que monta no meio da página (Vencedores do CNPJ, troca de aba) não puxar a pessoa para o topo.
const currentWindowScroll = () => window.scrollY;

/** Onde a pessoa estava numa lista quando saiu dela, para voltar ao mesmo ponto ao voltar do detalhe. */
interface ListPosition {
  offset: number;
  measurements: VirtualItem[];
}

const POSITION_MEMORY_LIMIT = 20;
// Na memória do navegador, por entrada do histórico (`location.key`): vale ao voltar pelo "voltar" ou ao fechar o
// detalhe, não ao recarregar a página.
const positionMemory = new Map<string, ListPosition>();

function rememberPosition(historyKey: string, position: ListPosition): void {
  positionMemory.delete(historyKey);
  positionMemory.set(historyKey, position);
  if (positionMemory.size > POSITION_MEMORY_LIMIT) {
    const oldest = positionMemory.keys().next();
    if (!oldest.done) positionMemory.delete(oldest.value);
  }
}

interface VirtualCardListProps<Item> {
  items: readonly Item[];
  /** Identifica o item na lista; função fixa (de fora do componente). */
  getKey: (item: Item) => string | number;
  renderItem: (item: Item) => ReactNode;
  /** Total da consulta (não só o que já carregou). */
  total: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** Falha ao carregar uma página seguinte: a lista que já chegou fica, e o rodapé oferece "Tentar de novo". */
  nextPageError: Error | null;
  /** Identifica a busca: quando muda (filtro, ordem), a lista volta ao topo. */
  resetKey: string;
  /** Nome da lista, para leitores de tela. */
  label: string;
}

export function VirtualCardList<Item>({
  items,
  getKey,
  renderItem,
  total,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  nextPageError,
  resetKey,
  label,
}: VirtualCardListProps<Item>) {
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // Só vale com a lista já em cache: sem os itens, não há como voltar ao ponto onde a pessoa estava.
  const [restored] = useState<ListPosition | null>(() => (items.length > 0 ? (positionMemory.get(location.key) ?? null) : null));

  const getItemKey = useCallback(
    (index: number) => {
      const item = items[index];
      return item === undefined ? index : getKey(item);
    },
    [items, getKey],
  );
  const estimateSize = useCallback(() => ESTIMATED_ROW_HEIGHT, []);

  const virtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: items.length,
    estimateSize,
    getItemKey,
    overscan: OVERSCAN,
    gap: ROW_GAP,
    scrollMargin,
    scrollPaddingStart: STICKY_TOP_PADDING,
    initialOffset: restored ? restored.offset : currentWindowScroll,
    initialMeasurementsCache: restored?.measurements ?? NO_MEASUREMENTS,
  });

  // A distância do topo da página até o início da lista muda com o que fica acima dela (chips, avisos).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const top = Math.round(list.getBoundingClientRect().top + window.scrollY);
    setScrollMargin((current) => (current === top ? current : top));
  });

  // Ao sair da tela, ou ao abrir o detalhe (outra entrada do histórico), guarda o ponto onde a pessoa estava.
  useEffect(() => {
    const historyKey = location.key;
    return () => {
      if (virtualizer.options.count === 0) return;
      rememberPosition(historyKey, { offset: virtualizer.scrollOffset ?? 0, measurements: virtualizer.takeSnapshot() });
    };
  }, [location.key, virtualizer]);

  // Busca nova (filtro, ordem): a lista recomeça do topo.
  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    window.scrollTo({ top: 0 });
  }, [resetKey]);

  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || nextPageError !== null) return;
    if (lastVirtualIndex < items.length - LOAD_MORE_MARGIN) return;
    onLoadMore();
  }, [hasNextPage, isFetchingNextPage, nextPageError, lastVirtualIndex, items.length, onLoadMore]);

  return (
    <div>
      <div ref={listRef} role="list" aria-label={label} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (item === undefined) return null;
          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              role="listitem"
              aria-setsize={total}
              aria-posinset={virtualItem.index + 1}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)` }}
            >
              {renderItem(item)}
            </div>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-4 flex flex-col items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {nextPageError !== null ? (
          <>
            <p role="alert" className="font-medium text-red-600 dark:text-red-400">
              Não foi possível carregar mais. {nextPageError.message}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onLoadMore}
              icon={<RefreshCw size={14} aria-hidden="true" />}
            >
              Tentar de novo
            </Button>
          </>
        ) : (
          <>
            <p className="tabular-nums">
              Mostrando {items.length.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
            </p>
            {isFetchingNextPage && (
              <p role="status" className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-brand-600 dark:text-brand-400" aria-hidden="true" />
                Carregando…
              </p>
            )}
            {!hasNextPage && !isFetchingNextPage && <p>Fim da lista</p>}
          </>
        )}
      </div>
    </div>
  );
}
