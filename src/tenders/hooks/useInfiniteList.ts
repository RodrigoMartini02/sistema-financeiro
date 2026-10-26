import { useCallback, useMemo } from 'react';
import { keepPreviousData, useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { Paginated } from '../types';
import { flattenPages, nextPageNumber, type InfiniteListData } from '../utils/infiniteList';

// Lista com rolagem infinita (plano .plans/licitacoes-lista-infinita.md): pede a primeira página e, a cada
// `loadMore`, a seguinte; devolve os itens de todas as páginas já carregadas numa lista só.

/** De quanto em quanto tempo a lista tenta de novo enquanto os contratos estão sendo atualizados. */
const STORE_UPDATING_RETRY_MS = 15_000;

interface UseInfiniteListOptions<Item, Page extends Paginated<Item>> {
  queryKey: QueryKey;
  fetchPage: (page: number) => Promise<Page>;
  /** Identifica o item na lista; função fixa (de fora do componente), para a lista não ser refeita a cada render. */
  getKey: (item: Item) => string | number;
  /** Lista de contratos: tenta de novo sozinha enquanto o armazém está sendo atualizado e a primeira página não chegou. */
  retryWhileStoreUpdating?: boolean;
}

export interface InfiniteList<Item, Page extends Paginated<Item>> {
  /** Os itens de todas as páginas carregadas, sem repetidos. */
  items: Item[];
  /** O total da consulta, como a última página carregada o informa. */
  total: number;
  /** A primeira página, de onde saem os dados da consulta (como `parsedQuery`). */
  firstPage: Page | undefined;
  /** Sem nenhuma página ainda (a primeira carga). */
  isPending: boolean;
  isFetching: boolean;
  /** Mostrando a lista da busca anterior enquanto a nova chega. */
  isPlaceholderData: boolean;
  /** Falha ao carregar a lista (não vale para a falha de uma página seguinte). */
  error: TendersApiError | null;
  /** Falha ao carregar uma página seguinte: a lista que já chegou fica. */
  nextPageError: TendersApiError | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadMore: () => void;
  reload: () => void;
}

export function useInfiniteList<Item, Page extends Paginated<Item>>({
  queryKey,
  fetchPage,
  getKey,
  retryWhileStoreUpdating = false,
}: UseInfiniteListOptions<Item, Page>): InfiniteList<Item, Page> {
  const query = useInfiniteQuery<Page, TendersApiError, InfiniteListData<Page>, QueryKey, number>({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageNumber(lastPage),
    // Ao trocar a busca, a lista antiga fica (esmaecida) até a primeira página nova chegar.
    placeholderData: keepPreviousData,
    refetchInterval: retryWhileStoreUpdating
      ? (current) => (current.state.data === undefined && isContractStoreUpdating(current.state.error) ? STORE_UPDATING_RETRY_MS : false)
      : false,
  });

  const pages = query.data?.pages;
  const items = useMemo(() => (pages ? flattenPages<Item>(pages, getKey) : []), [pages, getKey]);
  const { fetchNextPage, refetch } = query;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const reload = useCallback(() => void refetch(), [refetch]);

  return {
    items,
    total: pages?.[pages.length - 1]?.total ?? 0,
    firstPage: pages?.[0],
    isPending: query.isPending,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    error: query.isError && !query.isFetchNextPageError ? query.error : null,
    nextPageError: query.isFetchNextPageError ? query.error : null,
    hasNextPage: query.hasNextPage && !query.isPlaceholderData,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore,
    reload,
  };
}
