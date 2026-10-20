import { useId, type ReactNode } from 'react';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/EmptyState';
import { getLocalTodayIso } from '../../utils/date';
import { ContractCard } from '../components/ContractCard';
import { ContractsUpdating, LoadError, LoadingBlock } from '../components/LoadStates';
import { NoticeCard } from '../components/NoticeCard';
import { Pagination } from '../components/Pagination';
import { TabPanel, Tabs } from '../components/Tabs';
import { fetchContracts } from '../services/contractsService';
import { fetchNotices } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { ContractSearchResult, NoticeSearchResult, Paginated } from '../types';
import { contractFavoritesApiQuery } from '../utils/contractFilters';
import { contractPath } from '../utils/contractKey';
import { SCREEN_MIN_HEIGHT_CLASS } from '../utils/screenLayout';
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS, SEARCH_URL_PARAMS, favoritesApiQuery, positiveInt } from '../utils/searchFilters';
import { LIST_TABS, listTabOf, listTabParams, type ListTab } from '../utils/tabs';

interface PageState {
  page: number;
  perPage: number;
}

/** De quanto em quanto tempo a lista de contratos tenta de novo enquanto os contratos estão sendo atualizados. */
const CONTRACTS_UPDATING_RETRY_MS = 15_000;

interface FavoritesListProps<Item> {
  query: UseQueryResult<Paginated<Item>, TendersApiError>;
  /** Identificador do item na lista: o id do edital, ou a chave do contrato. */
  itemKey: (item: Item) => string | number;
  emptyDescription: string;
  emptyLink: { to: string; label: string };
  renderItem: (item: Item) => ReactNode;
  perPage: number;
  goTo: (next: PageState) => void;
}

/** Lista paginada de favoritos (editais ou contratos), com carregando, erro e vazio. */
function FavoritesList<Item>({ query, itemKey, emptyDescription, emptyLink, renderItem, perPage, goTo }: FavoritesListProps<Item>) {
  const data = query.data;
  if (query.isPending) {
    return <LoadingBlock label="Carregando os favoritos…" />;
  }
  if (isContractStoreUpdating(query.error)) {
    return <ContractsUpdating message={query.error?.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (query.isError || !data) {
    return (
      <LoadError
        title="Não foi possível carregar os favoritos"
        message={query.error?.message ?? 'Tente de novo em instantes.'}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (data.total === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Você ainda não tem favoritos aqui."
        description={emptyDescription}
        action={
          <Link to={emptyLink.to} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
            {emptyLink.label}
          </Link>
        }
      />
    );
  }
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Esta página não tem favoritos."
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => goTo({ page: 1, perPage })}>
            Voltar para a primeira página
          </Button>
        }
      />
    );
  }
  return (
    <div className={`flex flex-1 flex-col gap-4 transition-opacity ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
      <ul className="grid grid-cols-1 gap-3">
        {data.items.map((item) => (
          <li key={itemKey(item)}>{renderItem(item)}</li>
        ))}
      </ul>
      {/* Lista curta: a paginação desce até o rodapé da tela. */}
      <div className="mt-auto">
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          perPage={data.perPage}
          onPage={(next) => goTo({ page: next, perPage })}
          onPerPage={(next) => goTo({ page: 1, perPage: next })}
        />
      </div>
    </div>
  );
}

function FavoriteNotices({ page, perPage, goTo }: PageState & { goTo: (next: PageState) => void }) {
  const apiQuery = favoritesApiQuery(page, perPage);
  const favorites = useQuery<NoticeSearchResult, TendersApiError>({
    queryKey: tendersQueryKeys.noticeSearch(apiQuery),
    queryFn: () => fetchNotices(apiQuery),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Os editais que você marcou com o coração, inclusive os encerrados, pela data de encerramento. Só você vê os seus favoritos.
      </p>
      <FavoritesList
        query={favorites}
        itemKey={(notice) => notice.id}
        emptyDescription="Marque o coração de um edital, em Buscar ou na página dele, para encontrá-lo aqui."
        emptyLink={{ to: '/buscar', label: 'Ir para Buscar' }}
        renderItem={(notice) => <NoticeCard notice={notice} detailLink={`/editais/${notice.id}`} />}
        perPage={perPage}
        goTo={goTo}
      />
    </>
  );
}

function FavoriteContracts({ page, perPage, goTo }: PageState & { goTo: (next: PageState) => void }) {
  const apiQuery = contractFavoritesApiQuery(page, perPage);
  const todayIso = getLocalTodayIso();
  const favorites = useQuery<ContractSearchResult, TendersApiError>({
    queryKey: tendersQueryKeys.contractSearch(apiQuery),
    queryFn: () => fetchContracts(apiQuery),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (isContractStoreUpdating(query.state.error) ? CONTRACTS_UPDATING_RETRY_MS : false),
  });
  return (
    <>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Os contratos que você marcou com o coração, inclusive os vencidos, pelo vencimento. O sino avisa 90 e 30 dias antes e quando o
        vencimento muda. Só você vê os seus favoritos.
      </p>
      <FavoritesList
        query={favorites}
        itemKey={(contract) => contract.pncpControlNumber}
        emptyDescription="Marque o coração de um contrato, em Contratos a vencer ou na página dele, para encontrá-lo aqui."
        emptyLink={{ to: '/contratos', label: 'Ir para Contratos a vencer' }}
        renderItem={(contract) => <ContractCard contract={contract} todayIso={todayIso} detailLink={contractPath(contract.pncpControlNumber)} />}
        perPage={perPage}
        goTo={goTo}
      />
    </>
  );
}

/**
 * Favoritos da pessoa logada, em abas: editais (inclusive os encerrados e os
 * descartados, pelo prazo) e contratos (inclusive os vencidos, pelo
 * vencimento). A aba e a página ficam na URL.
 */
export function FavoritesScreen() {
  const [params, setParams] = useSearchParams();
  const idPrefix = useId();
  const tab = listTabOf(params);
  const page = positiveInt(params.get(SEARCH_URL_PARAMS.page)) ?? 1;
  const perPage = PER_PAGE_OPTIONS.find((option) => String(option) === params.get(SEARCH_URL_PARAMS.perPage)) ?? DEFAULT_PER_PAGE;

  const goTo = (next: PageState) => {
    const nextParams = listTabParams(tab);
    if (next.page > 1) nextParams.set(SEARCH_URL_PARAMS.page, String(next.page));
    if (next.perPage !== DEFAULT_PER_PAGE) nextParams.set(SEARCH_URL_PARAMS.perPage, String(next.perPage));
    setParams(nextParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className={`flex flex-col ${SCREEN_MIN_HEIGHT_CLASS}`}>
      <Tabs tabs={LIST_TABS} active={tab} onChange={(next: ListTab) => setParams(listTabParams(next))} label="Tipo de favorito" idPrefix={idPrefix} />
      <TabPanel idPrefix={idPrefix} tabId={tab}>
        <div className="flex flex-col">
          {tab === 'editais' ? (
            <FavoriteNotices page={page} perPage={perPage} goTo={goTo} />
          ) : (
            <FavoriteContracts page={page} perPage={perPage} goTo={goTo} />
          )}
        </div>
      </TabPanel>
    </section>
  );
}
