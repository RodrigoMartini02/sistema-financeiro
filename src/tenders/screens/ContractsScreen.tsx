import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookmarkPlus, CircleCheck, Loader2, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Drawer } from '../../ui/drawer';
import { EmptyState } from '../../ui/EmptyState';
import { Select, ToggleGroup } from '../../ui/form';
import { getLocalTodayIso } from '../../utils/date';
import { ContractCard } from '../components/ContractCard';
import { ContractDetailView } from '../components/ContractDetailView';
import { ContractFiltersPanel } from '../components/ContractFiltersPanel';
import { ContractSearchFormDialog, type ContractSearchFormTarget } from '../components/ContractSearchFormDialog';
import { FilterChips } from '../components/FilterChips';
import { ContractsUpdating, LoadError, LoadingBlock } from '../components/LoadStates';
import { VirtualCardList } from '../components/VirtualCardList';
import { useDomainLists, useDomainLookups } from '../hooks/useDomainLists';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { fetchContracts } from '../services/contractsService';
import { fetchContractSavedSearches } from '../services/contractSearchesService';
import { tendersQueryKeys } from '../services/queryKeys';
import { fetchCollectionStatus } from '../services/settingsService';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import { CONTRACT_SORTS, type CollectionStatus, type ContractListItem, type ContractSearchResult } from '../types';
import {
  CONTRACT_URL_PARAM,
  clearAllContractFilters,
  contractFilterChips,
  parseContractSearchParams,
  toContractApiQuery,
  toContractSearchParams,
  withContractFilters,
  type ContractSearchState,
} from '../utils/contractFilters';
import { cnpjFromSearchText, cnpjPagePath } from '../utils/cnpj';
import { contractKeyFromParam } from '../utils/contractKey';
import { contractStateToForm } from '../utils/contractSearchForm';
import { formatIsoDateTime } from '../utils/dates';
import { LIST_PAGE_SIZE, withPaging } from '../utils/infiniteList';
import { CONTRACT_SORT_LABELS, TERMS_MODE_LABELS } from '../utils/labels';

// Contratos a vencer (plano .plans/licitacoes-contratos-a-vencer.md, Parte B):
// os contratos vigentes do PNCP, com filtros na URL, chips, cards com rolagem
// infinita, "Salvar esta busca" e o contrato no painel lateral (?contrato=).

/** Identifica o contrato na lista. */
const contractListKey = (contract: ContractListItem) => contract.pncpControlNumber;

/** Estado da navegação que abriu o painel do contrato pela lista. */
interface ContractDrawerNavigation {
  contractDrawer?: boolean;
}
const CONTRACT_DRAWER_STATE: ContractDrawerNavigation = { contractDrawer: true };

/** Fim da última coleta diária de contratos, para o rodapé; sem coleta, null. */
function lastContractsUpdate(status: CollectionStatus | undefined): { at: string | null; failed: boolean } | null {
  const run = status?.latestRuns.find((item) => item.type === 'CONTRATOS_DIARIA');
  if (!run) return null;
  return { at: run.finishedAt, failed: run.status === 'FALHA' };
}

export function ContractsScreen() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const paramsText = params.toString();
  const state = useMemo(() => parseContractSearchParams(new URLSearchParams(paramsText)), [paramsText]);
  const apiQuery = useMemo(() => toContractApiQuery(state), [state]);
  const todayIso = getLocalTodayIso();
  const contractKey = contractKeyFromParam(params.get(CONTRACT_URL_PARAM));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<ContractSearchFormTarget | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [text, setText] = useState(state.q);

  // Busca trocada de fora (chip, voltar): o campo acompanha.
  useEffect(() => setText(state.q), [state.q]);

  const domains = useDomainLists();
  const lookups = useDomainLookups();
  const savedSearches = useQuery({
    queryKey: tendersQueryKeys.contractSavedSearches,
    queryFn: fetchContractSavedSearches,
    enabled: state.savedSearchId !== null,
  });
  const results = useInfiniteList<ContractListItem, ContractSearchResult>({
    queryKey: tendersQueryKeys.contractInfiniteList(apiQuery),
    fetchPage: (page) => fetchContracts(withPaging(apiQuery, { page, perPage: LIST_PAGE_SIZE })),
    getKey: contractListKey,
    retryWhileStoreUpdating: true,
  });
  const collection = useQuery<CollectionStatus, TendersApiError>({ queryKey: tendersQueryKeys.collectionStatus, queryFn: fetchCollectionStatus });
  const lastUpdate = lastContractsUpdate(collection.data);

  const applyState = useCallback((next: ContractSearchState) => setParams(toContractSearchParams(next)), [setParams]);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const closeForm = useCallback(() => setFormTarget(null), []);
  const closeContract = useCallback(() => {
    if ((location.state as ContractDrawerNavigation | null)?.contractDrawer) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete(CONTRACT_URL_PARAM);
    setParams(next, { replace: true });
  }, [location.state, navigate, params, setParams]);

  const chips = contractFilterChips(state, {
    ...lookups,
    savedSearchName: (id) => savedSearches.data?.find((search) => search.id === id)?.name,
  });
  const inSavedSearch = state.savedSearchId !== null;
  const firstPage = results.firstPage;
  const total = results.total;
  const sortOptions = CONTRACT_SORTS.filter((sort) => sort !== 'relevance' || state.q.trim() !== '');
  const totalLabel = firstPage ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'contrato' : 'contratos'}` : undefined;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const cnpj = cnpjFromSearchText(text);
    if (cnpj) {
      navigate(cnpjPagePath(cnpj));
      return;
    }
    applyState(withContractFilters(state, { q: text.trim(), savedSearchId: null }));
  };

  const detailLinkFor = (key: string) => {
    const next = new URLSearchParams(params);
    next.set(CONTRACT_URL_PARAM, key);
    return { search: `?${next.toString()}` };
  };

  const openSaveForm = () => {
    if (!firstPage) return;
    const { values, leftOut } = contractStateToForm(state, firstPage.parsedQuery);
    setFormTarget({ initialValues: values, leftOut });
  };

  const filtersPanel = (
    <ContractFiltersPanel
      state={state}
      onChange={applyState}
      domains={{
        data: domains.data,
        errorMessage: domains.isError ? domains.error.message : null,
        retry: () => void domains.refetch(),
        retrying: domains.isFetching,
      }}
      lookups={lookups}
      todayIso={todayIso}
    />
  );

  let content;
  if (isContractStoreUpdating(results.error)) {
    content = <ContractsUpdating message={results.error?.message} onRetry={results.reload} retrying={results.isFetching} />;
  } else if (results.isPending) {
    content = <LoadingBlock label={state.includeClosed ? 'Buscando em todos os contratos…' : 'Buscando contratos…'} />;
  } else if (results.error || !firstPage) {
    content = (
      <LoadError
        title="Não foi possível buscar os contratos"
        message={results.error?.message ?? 'Tente de novo em instantes.'}
        onRetry={results.reload}
        retrying={results.isFetching}
      />
    );
  } else if (total === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="Nenhum contrato encontrado."
        description={chips.length > 0 ? 'Tente outros termos ou tire alguns filtros.' : 'Ainda não há contratos vigentes na base.'}
        action={
          chips.length > 0 ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => applyState(clearAllContractFilters(state))}>
              Limpar tudo
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <div className={`flex flex-col gap-4 transition-opacity ${results.isPlaceholderData ? 'opacity-60' : ''}`}>
        {results.isPlaceholderData && state.includeClosed && (
          <p role="status" className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 size={14} className="animate-spin text-brand-600 dark:text-brand-400" aria-hidden="true" />
            Buscando em todos os contratos…
          </p>
        )}
        <VirtualCardList
          items={results.items}
          getKey={contractListKey}
          renderItem={(contract) => (
            <ContractCard
              contract={contract}
              todayIso={todayIso}
              detailLink={detailLinkFor(contract.pncpControlNumber)}
              detailLinkState={CONTRACT_DRAWER_STATE}
            />
          )}
          total={total}
          hasNextPage={results.hasNextPage}
          isFetchingNextPage={results.isFetchingNextPage}
          onLoadMore={results.loadMore}
          nextPageError={results.nextPageError}
          resetKey={apiQuery}
          label="Contratos"
        />
      </div>
    );
  }

  return (
    <section className="flex flex-col">
      <form role="search" onSubmit={submitSearch} className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar contratos por palavras-chave ou abrir um CNPJ</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder='Ex.: limpeza "coleta de lixo" -hospitalar'
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-3 text-[15px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-[3px] focus:ring-[rgba(8,145,178,0.12)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </label>
        <Button type="submit" className="h-12">
          Buscar
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {!inSavedSearch && (
          <ToggleGroup
            value={state.termsMode}
            onChange={(value) => applyState(withContractFilters(state, { termsMode: value === 'OU' ? 'OU' : 'E' }))}
            options={[
              { value: 'E', label: TERMS_MODE_LABELS.E },
              { value: 'OU', label: TERMS_MODE_LABELS.OU },
            ]}
          />
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Aspas para frase exata e hífen para excluir: <span className="whitespace-nowrap font-mono">"coleta de lixo" -hospitalar</span>. Um CNPJ abre a página dele.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setFiltersOpen(true)}
          icon={<SlidersHorizontal size={15} aria-hidden="true" />}
          className="ml-auto lg:hidden"
        >
          Filtros{chips.length > 0 ? ` (${chips.length})` : ''}
        </Button>
      </div>

      {savedName && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          <CircleCheck size={14} className="shrink-0" aria-hidden="true" />
          <span>
            Busca “{savedName}” salva.{' '}
            <Link to="/buscas?aba=contratos" className="font-semibold underline underline-offset-2">
              Ver buscas salvas
            </Link>
          </span>
          <button type="button" onClick={() => setSavedName(null)} aria-label="Fechar aviso" className="ml-auto rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-500/20">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-1 items-start gap-6">
        <aside
          aria-label="Filtros"
          className="scrollbar-thin hidden w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto"
        >
          {filtersPanel}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3 self-stretch">
          <FilterChips chips={chips} onRemove={applyState} onClearAll={() => applyState(clearAllContractFilters(state))} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200" aria-live="polite">
              {totalLabel ?? 'Contratos'}
              {results.isFetching && !results.isPending && <Loader2 size={14} className="animate-spin text-brand-600" aria-label="Atualizando" />}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                Ordenar
                <Select
                  value={state.sort}
                  onChange={(event) => {
                    const sort = CONTRACT_SORTS.find((option) => option === event.target.value);
                    if (sort) applyState(withContractFilters(state, { sort }));
                  }}
                  className="w-[200px]"
                >
                  {sortOptions.map((sort) => (
                    <option key={sort} value={sort}>
                      {CONTRACT_SORT_LABELS[sort]}
                    </option>
                  ))}
                </Select>
              </label>
              {!inSavedSearch && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={openSaveForm}
                  disabled={!firstPage || results.isPlaceholderData}
                  icon={<BookmarkPlus size={15} aria-hidden="true" />}
                >
                  Salvar esta busca
                </Button>
              )}
            </div>
          </div>

          {content}

          <p
            className={`text-xs ${lastUpdate?.failed ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Última atualização dos contratos: {lastUpdate?.at ? formatIsoDateTime(lastUpdate.at) : 'ainda não houve coleta'}
            {lastUpdate?.failed && ' · a última coleta falhou, e os dados podem estar desatualizados.'}
          </p>
        </div>
      </div>

      <Drawer
        open={filtersOpen}
        title="Filtros"
        subtitle={totalLabel}
        onClose={closeFilters}
        size="sm"
        footer={
          <Button type="button" className="w-full" onClick={closeFilters}>
            Ver os contratos
          </Button>
        }
      >
        {filtersPanel}
      </Drawer>

      <Drawer open={contractKey !== null} title="Detalhe do contrato" onClose={closeContract}>
        {contractKey !== null && <ContractDetailView key={contractKey} contractKey={contractKey} inDrawer />}
      </Drawer>

      <ContractSearchFormDialog target={formTarget} onClose={closeForm} onSaved={(saved) => setSavedName(saved.name)} />
    </section>
  );
}
