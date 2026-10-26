import { useId, type ReactNode } from 'react';
import { Heart } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { getLocalTodayIso } from '../../utils/date';
import { ContractCard } from '../components/ContractCard';
import { ContractsUpdating, LoadError, LoadingBlock } from '../components/LoadStates';
import { NoticeCard } from '../components/NoticeCard';
import { TabPanel, Tabs } from '../components/Tabs';
import { VirtualCardList } from '../components/VirtualCardList';
import { useInfiniteList, type InfiniteList } from '../hooks/useInfiniteList';
import { fetchContracts } from '../services/contractsService';
import { fetchNotices } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import { isContractStoreUpdating } from '../services/tendersApiError';
import type { ContractListItem, ContractSearchResult, NoticeListItem, NoticeSearchResult, Paginated } from '../types';
import { contractFavoritesApiQuery } from '../utils/contractFilters';
import { contractPath } from '../utils/contractKey';
import { LIST_PAGE_SIZE, withPaging } from '../utils/infiniteList';
import { favoritesApiQuery } from '../utils/searchFilters';
import { LIST_TABS, listTabOf, listTabParams, type ListTab } from '../utils/tabs';

const FAVORITE_NOTICES_QUERY = favoritesApiQuery();
const FAVORITE_CONTRACTS_QUERY = contractFavoritesApiQuery();

const noticeKey = (notice: NoticeListItem) => notice.id;
const contractListKey = (contract: ContractListItem) => contract.pncpControlNumber;

interface FavoritesListProps<Item, Page extends Paginated<Item>> {
  list: InfiniteList<Item, Page>;
  getKey: (item: Item) => string | number;
  /** Identifica a consulta da lista (para ela recomeçar do topo quando mudar). */
  resetKey: string;
  /** Nome da lista, para leitores de tela. */
  label: string;
  emptyDescription: string;
  emptyLink: { to: string; label: string };
  renderItem: (item: Item) => ReactNode;
}

/** Lista de favoritos (editais ou contratos) com rolagem infinita, com carregando, erro e vazio. */
function FavoritesList<Item, Page extends Paginated<Item>>({
  list,
  getKey,
  resetKey,
  label,
  emptyDescription,
  emptyLink,
  renderItem,
}: FavoritesListProps<Item, Page>) {
  if (list.isPending) {
    return <LoadingBlock label="Carregando os favoritos…" />;
  }
  if (isContractStoreUpdating(list.error)) {
    return <ContractsUpdating message={list.error?.message} onRetry={list.reload} retrying={list.isFetching} />;
  }
  if (list.error || !list.firstPage) {
    return (
      <LoadError
        title="Não foi possível carregar os favoritos"
        message={list.error?.message ?? 'Tente de novo em instantes.'}
        onRetry={list.reload}
        retrying={list.isFetching}
      />
    );
  }
  if (list.total === 0) {
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
  return (
    <div className={`transition-opacity ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
      <VirtualCardList
        items={list.items}
        getKey={getKey}
        renderItem={renderItem}
        total={list.total}
        hasNextPage={list.hasNextPage}
        isFetchingNextPage={list.isFetchingNextPage}
        onLoadMore={list.loadMore}
        nextPageError={list.nextPageError}
        resetKey={resetKey}
        label={label}
      />
    </div>
  );
}

function FavoriteNotices() {
  const favorites = useInfiniteList<NoticeListItem, NoticeSearchResult>({
    queryKey: tendersQueryKeys.noticeInfiniteList(FAVORITE_NOTICES_QUERY),
    fetchPage: (page) => fetchNotices(withPaging(FAVORITE_NOTICES_QUERY, { page, perPage: LIST_PAGE_SIZE })),
    getKey: noticeKey,
  });
  return (
    <>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Os editais que você marcou com o coração, inclusive os encerrados, pela data de encerramento. Só você vê os seus favoritos.
      </p>
      <FavoritesList
        list={favorites}
        getKey={noticeKey}
        resetKey={FAVORITE_NOTICES_QUERY}
        label="Editais favoritos"
        emptyDescription="Marque o coração de um edital, em Buscar ou na página dele, para encontrá-lo aqui."
        emptyLink={{ to: '/buscar', label: 'Ir para Buscar' }}
        renderItem={(notice) => <NoticeCard notice={notice} detailLink={`/editais/${notice.id}`} />}
      />
    </>
  );
}

function FavoriteContracts() {
  const todayIso = getLocalTodayIso();
  const favorites = useInfiniteList<ContractListItem, ContractSearchResult>({
    queryKey: tendersQueryKeys.contractInfiniteList(FAVORITE_CONTRACTS_QUERY),
    fetchPage: (page) => fetchContracts(withPaging(FAVORITE_CONTRACTS_QUERY, { page, perPage: LIST_PAGE_SIZE })),
    getKey: contractListKey,
    retryWhileStoreUpdating: true,
  });
  return (
    <>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Os contratos que você marcou com o coração, inclusive os vencidos, pelo vencimento. O sino avisa 90 e 30 dias antes e quando o
        vencimento muda. Só você vê os seus favoritos.
      </p>
      <FavoritesList
        list={favorites}
        getKey={contractListKey}
        resetKey={FAVORITE_CONTRACTS_QUERY}
        label="Contratos favoritos"
        emptyDescription="Marque o coração de um contrato, em Contratos a vencer ou na página dele, para encontrá-lo aqui."
        emptyLink={{ to: '/contratos', label: 'Ir para Contratos a vencer' }}
        renderItem={(contract) => <ContractCard contract={contract} todayIso={todayIso} detailLink={contractPath(contract.pncpControlNumber)} />}
      />
    </>
  );
}

/**
 * Favoritos da pessoa logada, em abas: editais (inclusive os encerrados e os
 * descartados, pelo prazo) e contratos (inclusive os vencidos, pelo
 * vencimento). A aba fica na URL; cada lista tem rolagem infinita.
 */
export function FavoritesScreen() {
  const [params, setParams] = useSearchParams();
  const idPrefix = useId();
  const tab = listTabOf(params);

  return (
    <section className="flex flex-col">
      <Tabs tabs={LIST_TABS} active={tab} onChange={(next: ListTab) => setParams(listTabParams(next))} label="Tipo de favorito" idPrefix={idPrefix} />
      <TabPanel idPrefix={idPrefix} tabId={tab}>
        <div className="flex flex-col">{tab === 'editais' ? <FavoriteNotices /> : <FavoriteContracts />}</div>
      </TabPanel>
    </section>
  );
}
