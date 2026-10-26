import { useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getLocalTodayIso } from '../../utils/date';
import { fetchCnpjWinners } from '../services/cnpjService';
import { fetchContracts } from '../services/contractsService';
import { fetchNotices } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { CnpjWinnerItem, ContractSearchResult, NoticeSearchResult, Paginated } from '../types';
import {
  CNPJ_LIST_SIZE,
  CNPJ_WINNERS_PER_PAGE_OPTIONS,
  cnpjContractsApiQuery,
  cnpjNoticesApiQuery,
  type CnpjTab,
} from '../utils/cnpjPage';
import { contractPath } from '../utils/contractKey';
import { ContractCard } from './ContractCard';
import { ContractsUpdating, LoadError, LoadingBlock } from './LoadStates';
import { NoticeCard } from './NoticeCard';
import { Pagination } from './Pagination';
import { WinnerCard } from './WinnerCard';

// As listas da página do CNPJ (plano .plans/licitacoes-pagina-cnpj.md): os 10 contratos e os 10 editais mais recentes,
// pelas mesmas buscas das telas Contratos a vencer e Buscar (os mesmos cards e favoritos), e as licitações vencidas,
// paginadas. Cada lista tem os seus estados de carregando, vazio, erro e "atualizando".

/** De quanto em quanto tempo a lista tenta de novo enquanto os contratos estão sendo atualizados. */
const UPDATING_RETRY_MS = 15_000;

const updatingRefetch = (error: unknown) => (isContractStoreUpdating(error) ? UPDATING_RETRY_MS : false);

function EmptyList({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">{children}</p>;
}

interface ListQuery {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: TendersApiError | null;
  refetch: () => unknown;
}

/** Os estados de uma lista que não é o resultado; null quando há resultado para mostrar. */
function listProblem(query: ListQuery, title: string, loadingLabel: string) {
  if (isContractStoreUpdating(query.error)) {
    return <ContractsUpdating message={query.error?.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (query.isPending) return <LoadingBlock label={loadingLabel} />;
  if (query.isError) {
    return <LoadError title={title} message={query.error?.message ?? 'Tente de novo em instantes.'} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return null;
}

/** Os 10 contratos mais recentes do CNPJ na aba (como fornecedor ou como órgão). */
export function CnpjContractList({ tab, cnpj }: { tab: CnpjTab; cnpj: string }) {
  const apiQuery = cnpjContractsApiQuery(tab, cnpj);
  const results = useQuery<ContractSearchResult, TendersApiError>({
    queryKey: tendersQueryKeys.contractSearch(apiQuery),
    queryFn: () => fetchContracts(apiQuery),
    refetchInterval: (query) => updatingRefetch(query.state.error),
  });
  const todayIso = getLocalTodayIso();
  const problem = listProblem(results, 'Não foi possível carregar os contratos', 'Carregando contratos…');
  if (problem) return problem;
  const items = results.data?.items ?? [];
  if (items.length === 0) return <EmptyList>Nenhum contrato encontrado.</EmptyList>;
  return (
    <ul className="grid grid-cols-1 gap-3">
      {items.map((contract) => (
        <li key={contract.pncpControlNumber}>
          <ContractCard contract={contract} todayIso={todayIso} detailLink={contractPath(contract.pncpControlNumber)} />
        </li>
      ))}
    </ul>
  );
}

/** Os 10 editais abertos mais recentes do órgão. */
export function CnpjNoticeList({ cnpj }: { cnpj: string }) {
  const apiQuery = cnpjNoticesApiQuery(cnpj);
  const results = useQuery<NoticeSearchResult, TendersApiError>({
    queryKey: tendersQueryKeys.noticeSearch(apiQuery),
    queryFn: () => fetchNotices(apiQuery),
  });
  const problem = listProblem(results, 'Não foi possível carregar os editais', 'Carregando editais…');
  if (problem) return problem;
  const items = results.data?.items ?? [];
  if (items.length === 0) return <EmptyList>Nenhum edital aberto no momento.</EmptyList>;
  return (
    <ul className="grid grid-cols-1 gap-3">
      {items.map((notice) => (
        <li key={notice.id}>
          <NoticeCard notice={notice} detailLink={`/editais/${notice.id}`} />
        </li>
      ))}
    </ul>
  );
}

/** As licitações vencidas pelo CNPJ, da mais recente para a mais antiga, 10 por página. */
export function CnpjWinnersList({ cnpj }: { cnpj: string }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(CNPJ_LIST_SIZE);
  const topRef = useRef<HTMLDivElement>(null);
  const winners = useQuery<Paginated<CnpjWinnerItem>, TendersApiError>({
    queryKey: tendersQueryKeys.cnpjWinners(cnpj, page, perPage),
    queryFn: () => fetchCnpjWinners(cnpj, page, perPage),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => updatingRefetch(query.state.error),
  });

  const problem = listProblem(winners, 'Não foi possível carregar as licitações vencidas', 'Carregando licitações vencidas…');
  if (problem) return problem;
  const data = winners.data;
  if (!data || data.total === 0) return <EmptyList>Nenhuma licitação vencida encontrada.</EmptyList>;

  const goToPage = (next: number) => {
    setPage(next);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div ref={topRef} className={`grid grid-cols-1 gap-3 transition-opacity ${winners.isPlaceholderData ? 'opacity-60' : ''}`}>
      <ul className="grid grid-cols-1 gap-3">
        {data.items.map((winner) => (
          <li key={winner.purchaseControlNumber}>
            <WinnerCard winner={winner} />
          </li>
        ))}
      </ul>
      {data.total > CNPJ_LIST_SIZE && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          perPage={data.perPage}
          onPage={goToPage}
          onPerPage={(size) => {
            setPerPage(size);
            setPage(1);
          }}
          perPageOptions={CNPJ_WINNERS_PER_PAGE_OPTIONS}
        />
      )}
    </div>
  );
}
