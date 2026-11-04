import type { InfiniteData } from '@tanstack/react-query';
import type { Paginated } from '../types';

// Listas com rolagem infinita (plano .plans/licitacoes-lista-infinita.md): a API pagina por posição (`page` e
// `perPage`), e a tela junta as páginas que já chegaram numa lista só, pedindo a próxima quando a pessoa chega
// perto do fim.

/** Itens pedidos a cada página das listas com rolagem infinita. */
export const LIST_PAGE_SIZE = 50;

/** Dados de uma lista com rolagem infinita, como o React Query guarda. */
export type InfiniteListData<Page extends Paginated<unknown>> = InfiniteData<Page, number>;

/** Página e tamanho de página de um pedido à API. */
export interface ApiPaging {
  page: number;
  perPage: number;
}

/**
 * Acrescenta a página e o tamanho à consulta da API, que não os traz (a consulta de uma lista com rolagem infinita é
 * a mesma em todas as páginas, e é ela que identifica a lista no cache).
 */
export function withPaging(apiQuery: string, paging: ApiPaging): string {
  const params = new URLSearchParams(apiQuery);
  params.set('page', String(paging.page));
  params.set('perPage', String(paging.perPage));
  return params.toString();
}

/** Próxima página a pedir; undefined quando a última já chegou. */
export function nextPageNumber(lastPage: Pick<Paginated<unknown>, 'page' | 'totalPages'>): number | undefined {
  return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
}

/**
 * Junta as páginas numa lista só. Como a API pagina por posição, um item pode aparecer em duas páginas se a base
 * mudar entre os dois pedidos; fica a primeira ocorrência.
 */
export function flattenPages<Item>(
  pages: ReadonlyArray<Pick<Paginated<Item>, 'items'>>,
  getKey: (item: Item) => string | number,
): Item[] {
  const seen = new Set<string | number>();
  const items: Item[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      const key = getKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

/** Os dados do cache são de uma lista com rolagem infinita (e não de uma consulta comum ou do detalhe)? */
export function isInfiniteListData(value: unknown): value is InfiniteListData<Paginated<unknown>> {
  if (typeof value !== 'object' || value === null || !('pages' in value) || !Array.isArray(value.pages)) return false;
  return value.pages.every((page: unknown) => typeof page === 'object' && page !== null && 'items' in page && Array.isArray(page.items));
}

/**
 * Troca, em todas as páginas, os itens que `matches` aponta pelo que `patch` devolve. Sem nenhum item igual,
 * devolve os mesmos dados (o React Query não avisa ninguém).
 */
export function patchListItems<Item, Page extends Paginated<Item>>(
  data: InfiniteListData<Page>,
  matches: (item: Item) => boolean,
  patch: (item: Item) => Item,
): InfiniteListData<Page> {
  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page.items.some(matches)) return page;
    changed = true;
    return { ...page, items: page.items.map((item) => (matches(item) ? patch(item) : item)) };
  });
  return changed ? { ...data, pages } : data;
}
