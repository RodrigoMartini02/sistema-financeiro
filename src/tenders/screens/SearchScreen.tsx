import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookmarkPlus, CircleCheck, Clock, LayoutGrid, Loader2, Rows3, Search, SearchX, SlidersHorizontal, Table2, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTelaDesktop } from '../../hooks/useTelaDesktop';
import { Button } from '../../ui/button';
import { Drawer } from '../../ui/drawer';
import { EmptyState } from '../../ui/EmptyState';
import { Select, ToggleGroup } from '../../ui/form';
import { getLocalTodayIso } from '../../utils/date';
import { FilterChips } from '../components/FilterChips';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { NoticeCard } from '../components/NoticeCard';
import { NoticeDetailView } from '../components/NoticeDetailView';
import { NoticeTable } from '../components/NoticeTable';
import { Pagination } from '../components/Pagination';
import { SavedSearchFormDialog, type SavedSearchFormTarget } from '../components/SavedSearchFormDialog';
import { SearchFiltersPanel } from '../components/SearchFiltersPanel';
import { useDomainLists, useDomainLookups } from '../hooks/useDomainLists';
import { useStoredPreference } from '../hooks/useStoredPreference';
import { SCREEN_MIN_HEIGHT_CLASS } from '../utils/screenLayout';
import { fetchNotices } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import { fetchSavedSearches } from '../services/savedSearchesService';
import type { TendersApiError } from '../services/tendersApiError';
import { NOTICE_SORTS, type NoticeSearchResult } from '../types';
import { formatIsoDate } from '../utils/dates';
import { NOTICE_SORT_LABELS, TERMS_MODE_LABELS } from '../utils/labels';
import { searchStateToForm } from '../utils/savedSearchForm';
import {
  MIN_DAYS_TO_CLOSE,
  NOTICE_URL_PARAM,
  clearAllFilters,
  closingSoonCountQuery,
  filterChips,
  minimumClosingDate,
  parseSearchParams,
  toApiQuery,
  toSearchParams,
  withFilters,
  withMinimumDeadline,
  type SearchState,
} from '../utils/searchFilters';

// Buscar (escopo, seção 9.4): filtros na URL, chips, cards ou tabela,
// ações rápidas, "Salvar esta busca" e o edital no painel lateral (?edital=).

const VIEW_OPTIONS = ['cards', 'tabela'] as const;
const DENSITY_OPTIONS = ['normal', 'compacta'] as const;

/** Estado da navegação que abriu o painel do edital pela lista. */
interface NoticeDrawerNavigation {
  noticeDrawer?: boolean;
}
const NOTICE_DRAWER_STATE: NoticeDrawerNavigation = { noticeDrawer: true };

function positiveId(text: string | null): number | null {
  if (!text || !/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function SearchScreen() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const paramsText = params.toString();
  const state = useMemo(() => parseSearchParams(new URLSearchParams(paramsText)), [paramsText]);
  const todayIso = getLocalTodayIso();
  // A API recebe o estado com o prazo mínimo (hoje + 3 dias), salvo as exceções da regra.
  const apiQuery = useMemo(() => toApiQuery(withMinimumDeadline(state, todayIso)), [state, todayIso]);
  const closingSoonQuery = useMemo(() => closingSoonCountQuery(state, todayIso), [state, todayIso]);
  const noticeId = positiveId(params.get(NOTICE_URL_PARAM));
  const isDesktop = useTelaDesktop();
  const [view, setView] = useStoredPreference('licitacoes.buscar.visao', VIEW_OPTIONS, 'cards');
  const [density, setDensity] = useStoredPreference('licitacoes.buscar.tabela', DENSITY_OPTIONS, 'normal');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<SavedSearchFormTarget | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [text, setText] = useState(state.q);

  // Busca trocada de fora (busca rápida da barra, chip, voltar): o campo acompanha.
  useEffect(() => setText(state.q), [state.q]);

  const domains = useDomainLists();
  const lookups = useDomainLookups();
  const savedSearches = useQuery({
    queryKey: tendersQueryKeys.savedSearches,
    queryFn: fetchSavedSearches,
    enabled: state.savedSearchId !== null,
  });
  const results = useQuery<NoticeSearchResult, TendersApiError>({
    queryKey: tendersQueryKeys.noticeSearch(apiQuery),
    queryFn: () => fetchNotices(apiQuery),
    placeholderData: keepPreviousData,
  });
  // Quantos o prazo mínimo deixou de fora (uma linha por página, só o total).
  const closingSoon = useQuery<NoticeSearchResult, TendersApiError>({
    queryKey: tendersQueryKeys.noticeSearch(closingSoonQuery ?? ''),
    queryFn: () => fetchNotices(closingSoonQuery ?? ''),
    enabled: closingSoonQuery !== null,
  });
  const hiddenClosingSoon = closingSoonQuery !== null ? (closingSoon.data?.total ?? 0) : 0;

  const applyState = useCallback((next: SearchState) => setParams(toSearchParams(next)), [setParams]);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const closeForm = useCallback(() => setFormTarget(null), []);
  const closeNotice = useCallback(() => {
    if ((location.state as NoticeDrawerNavigation | null)?.noticeDrawer) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete(NOTICE_URL_PARAM);
    setParams(next, { replace: true });
  }, [location.state, navigate, params, setParams]);

  const chips = filterChips(state, {
    ...lookups,
    savedSearchName: (id) => savedSearches.data?.find((search) => search.id === id)?.name,
  });
  const inSavedSearch = state.savedSearchId !== null;
  const data = results.data;
  const showTable = view === 'tabela' && isDesktop;
  const sortOptions = NOTICE_SORTS.filter((sort) => sort !== 'relevance' || state.q.trim() !== '');

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    applyState(withFilters(state, { q: text.trim(), savedSearchId: null }));
  };

  const goToPage = (page: number) => {
    applyState({ ...state, page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const detailLinkFor = (id: number) => {
    const next = new URLSearchParams(params);
    next.set(NOTICE_URL_PARAM, String(id));
    return { search: `?${next.toString()}` };
  };

  const openSaveForm = () => {
    if (!data) return;
    const { values, leftOut } = searchStateToForm(state, data.parsedQuery);
    setFormTarget({ initialValues: values, leftOut });
  };

  const filtersPanel = (
    <SearchFiltersPanel
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
  if (results.isPending) {
    content = <LoadingBlock label="Buscando editais…" />;
  } else if (results.isError || !data) {
    content = (
      <LoadError
        title="Não foi possível buscar os editais"
        message={results.error?.message ?? 'Tente de novo em instantes.'}
        onRetry={() => void results.refetch()}
        retrying={results.isFetching}
      />
    );
  } else if (data.total === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="Nenhum edital encontrado."
        description={chips.length > 0 ? 'Tente outros termos ou tire alguns filtros.' : 'Ainda não há editais abertos na base.'}
        action={
          chips.length > 0 ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => applyState(clearAllFilters(state))}>
              Limpar tudo
            </Button>
          ) : undefined
        }
      />
    );
  } else if (data.items.length === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="Esta página não tem editais."
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => goToPage(1)}>
            Voltar para a primeira página
          </Button>
        }
      />
    );
  } else {
    content = (
      <div className={`flex flex-1 flex-col gap-4 transition-opacity ${results.isPlaceholderData ? 'opacity-60' : ''}`}>
        {showTable ? (
          <NoticeTable notices={data.items} compact={density === 'compacta'} detailLinkFor={detailLinkFor} detailLinkState={NOTICE_DRAWER_STATE} />
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {data.items.map((notice) => (
              <li key={notice.id}>
                <NoticeCard notice={notice} detailLink={detailLinkFor(notice.id)} detailLinkState={NOTICE_DRAWER_STATE} />
              </li>
            ))}
          </ul>
        )}
        {/* Lista curta: a paginação desce até o rodapé da tela. */}
        <div className="mt-auto">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            perPage={data.perPage}
            onPage={goToPage}
            onPerPage={(perPage) => applyState(withFilters(state, { perPage }))}
          />
        </div>
      </div>
    );
  }

  return (
    <section className={`flex flex-col ${SCREEN_MIN_HEIGHT_CLASS}`}>
      <form role="search" onSubmit={submitSearch} className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar editais por palavras-chave</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder='Ex.: software "licença de uso" -obra'
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
            onChange={(value) => applyState(withFilters(state, { termsMode: value === 'OU' ? 'OU' : 'E' }))}
            options={[
              { value: 'E', label: TERMS_MODE_LABELS.E },
              { value: 'OU', label: TERMS_MODE_LABELS.OU },
            ]}
          />
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Aspas para frase exata e hífen para excluir: <span className="whitespace-nowrap font-mono">"merenda escolar" -café</span>
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
            <Link to="/buscas" className="font-semibold underline underline-offset-2">
              Ver buscas salvas
            </Link>
          </span>
          <button type="button" onClick={() => setSavedName(null)} aria-label="Fechar aviso" className="ml-auto rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-500/20">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-1 items-start gap-6">
        {/* Altura máxima: a tela menos o que fica acima do painel (barra, busca e
            opções, cerca de 197 px) e o espaço de baixo. Assim, com lista curta, a
            página cabe na tela e a paginação aparece no rodapé. */}
        <aside
          aria-label="Filtros"
          className="scrollbar-thin hidden w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto"
        >
          {filtersPanel}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3 self-stretch">
          <FilterChips chips={chips} onRemove={applyState} onClearAll={() => applyState(clearAllFilters(state))} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200" aria-live="polite">
              {data ? `${data.total.toLocaleString('pt-BR')} ${data.total === 1 ? 'edital' : 'editais'}` : 'Editais'}
              {results.isFetching && !results.isPending && (
                <Loader2 size={14} className="animate-spin text-brand-600" aria-label="Atualizando" />
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                Ordenar
                <Select
                  value={state.sort}
                  onChange={(event) => {
                    const sort = NOTICE_SORTS.find((option) => option === event.target.value);
                    if (sort) applyState(withFilters(state, { sort }));
                  }}
                  className="w-[188px]"
                >
                  {sortOptions.map((sort) => (
                    <option key={sort} value={sort}>
                      {NOTICE_SORT_LABELS[sort]}
                    </option>
                  ))}
                </Select>
              </label>
              {isDesktop && (
                <ToggleGroup
                  value={view}
                  onChange={(value) => setView(value === 'tabela' ? 'tabela' : 'cards')}
                  options={[
                    { value: 'cards', label: 'Cards', icon: <LayoutGrid size={13} aria-hidden="true" /> },
                    { value: 'tabela', label: 'Tabela', icon: <Table2 size={13} aria-hidden="true" /> },
                  ]}
                />
              )}
              {showTable && (
                <button
                  type="button"
                  aria-pressed={density === 'compacta'}
                  onClick={() => setDensity(density === 'compacta' ? 'normal' : 'compacta')}
                  className={[
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600',
                    density === 'compacta'
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  ].join(' ')}
                >
                  <Rows3 size={13} aria-hidden="true" />
                  Compacta
                </button>
              )}
              {!inSavedSearch && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={openSaveForm}
                  disabled={!data || results.isPlaceholderData}
                  icon={<BookmarkPlus size={15} aria-hidden="true" />}
                >
                  Salvar esta busca
                </Button>
              )}
            </div>
          </div>

          {hiddenClosingSoon > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <Clock size={14} className="shrink-0" aria-hidden="true" />
              <span>
                {hiddenClosingSoon.toLocaleString('pt-BR')}{' '}
                {hiddenClosingSoon === 1 ? 'edital encerra' : 'editais encerram'} antes de {formatIsoDate(minimumClosingDate(todayIso)).slice(0, 5)}{' '}
                (menos de {MIN_DAYS_TO_CLOSE} dias) e não {hiddenClosingSoon === 1 ? 'aparece' : 'aparecem'} na lista.
              </span>
              <button
                type="button"
                onClick={() => applyState(withFilters(state, { includeClosingSoon: true }))}
                className="rounded font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                Mostrar
              </button>
            </p>
          )}

          {content}
        </div>
      </div>

      <Drawer
        open={filtersOpen}
        title="Filtros"
        subtitle={data ? `${data.total.toLocaleString('pt-BR')} ${data.total === 1 ? 'edital' : 'editais'}` : undefined}
        onClose={closeFilters}
        size="sm"
        footer={
          <Button type="button" className="w-full" onClick={closeFilters}>
            Ver os editais
          </Button>
        }
      >
        {filtersPanel}
      </Drawer>

      <Drawer open={noticeId !== null} title="Detalhe do edital" onClose={closeNotice}>
        {noticeId !== null && <NoticeDetailView key={noticeId} noticeId={noticeId} inDrawer />}
      </Drawer>

      <SavedSearchFormDialog target={formTarget} onClose={closeForm} onSaved={(saved) => setSavedName(saved.name)} />
    </section>
  );
}
