import type { QueryClient } from '@tanstack/react-query';
import type { ContractListItem, ContractSearchResult, NoticeListItem, NoticeSearchResult } from '../types';
import { isInfiniteListData, patchListItems, type InfiniteListData } from '../utils/infiniteList';
import { isInfiniteListKey, tendersQueryKeys } from './queryKeys';

// Cache das listas com rolagem infinita de editais e de contratos. Favoritar ou mudar o acompanhamento não relê todas
// as páginas já carregadas (uma por vez, a cada clique): o item muda no lugar. Só as listas cujo filtro depende do que
// mudou (a de favoritos, o filtro de acompanhamento) são relidas, porque o item que sai ou entra muda a posição dos
// seguintes.

/** Muda um edital em todas as listas com rolagem infinita que estão no cache. */
export function patchCachedNotice(queryClient: QueryClient, noticeId: number, patch: (notice: NoticeListItem) => NoticeListItem): void {
  queryClient.setQueriesData<unknown>({ queryKey: tendersQueryKeys.noticeInfiniteLists }, (data: unknown) =>
    isInfiniteListData(data)
      ? patchListItems<NoticeListItem, NoticeSearchResult>(data as InfiniteListData<NoticeSearchResult>, (notice) => notice.id === noticeId, patch)
      : data,
  );
}

/** Muda um contrato em todas as listas com rolagem infinita que estão no cache. */
export function patchCachedContract(
  queryClient: QueryClient,
  contractKey: string,
  patch: (contract: ContractListItem) => ContractListItem,
): void {
  queryClient.setQueriesData<unknown>({ queryKey: tendersQueryKeys.contractInfiniteLists }, (data: unknown) =>
    isInfiniteListData(data)
      ? patchListItems<ContractListItem, ContractSearchResult>(
          data as InfiniteListData<ContractSearchResult>,
          (contract) => contract.pncpControlNumber === contractKey,
          patch,
        )
      : data,
  );
}

/** A consulta da lista é só dos favoritos (a tela Favoritos ou o filtro "Só favoritos")? */
export function listDependsOnFavorites(apiQuery: string): boolean {
  return new URLSearchParams(apiQuery).get('favoritesOnly') === 'true';
}

/** A consulta da lista filtra pelo acompanhamento (Analisar, Vou participar, Descartado ou sem acompanhamento)? */
export function listDependsOnTracking(apiQuery: string): boolean {
  return new URLSearchParams(apiQuery).has('trackingStatus');
}

/**
 * Relê tudo do grupo (editais ou contratos) que não é lista com rolagem infinita (detalhe, histórico, listas curtas e
 * quadro) e só as listas com rolagem infinita cujo filtro depende do que mudou.
 */
export function invalidateGroupExceptLists(
  queryClient: QueryClient,
  group: typeof tendersQueryKeys.notices | typeof tendersQueryKeys.contracts,
  listDependsOnChange: (apiQuery: string) => boolean,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: group,
    predicate: (query) => !isInfiniteListKey(query.queryKey) || listDependsOnChange(String(query.queryKey[3] ?? '')),
  });
}
