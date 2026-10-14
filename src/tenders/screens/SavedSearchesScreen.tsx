import { useCallback, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookmarkPlus, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useConfirm } from '../../context/ConfirmContext';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/EmptyState';
import { ContractSearchCard } from '../components/ContractSearchCard';
import { ContractSearchFormDialog, type ContractSearchFormTarget } from '../components/ContractSearchFormDialog';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { SavedSearchCard } from '../components/SavedSearchCard';
import { SavedSearchFormDialog, type SavedSearchFormTarget } from '../components/SavedSearchFormDialog';
import { TabPanel, Tabs } from '../components/Tabs';
import { useDeleteContractSavedSearch, useDuplicateContractSavedSearch } from '../hooks/useContractSearchMutations';
import { useDomainLookups } from '../hooks/useDomainLists';
import { useDeleteSavedSearch, useDuplicateSavedSearch } from '../hooks/useSavedSearchMutations';
import { fetchContractSavedSearches } from '../services/contractSearchesService';
import { tendersQueryKeys } from '../services/queryKeys';
import { fetchSavedSearches } from '../services/savedSearchesService';
import type { TendersApiError } from '../services/tendersApiError';
import type { ContractSavedSearch, SavedSearch } from '../types';
import { EMPTY_CONTRACT_SEARCH_FORM, contractSavedSearchToForm } from '../utils/contractSearchForm';
import { EMPTY_SAVED_SEARCH_FORM, savedSearchToForm } from '../utils/savedSearchForm';
import { LIST_TABS, listTabOf, listTabParams, type ListTab } from '../utils/tabs';

/** Limite da API por pessoa e conta, contado à parte para editais e para contratos. */
const MAX_SAVED_SEARCHES = 50;

interface ListHeaderProps {
  description: string;
  canCreate: boolean;
  onCreate: () => void;
  error: TendersApiError | null;
}

function ListHeader({ description, canCreate, onCreate, error }: ListHeaderProps) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
        <Button type="button" size="sm" onClick={onCreate} disabled={!canCreate} icon={<Plus size={15} aria-hidden="true" />}>
          Nova busca
        </Button>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error.message}
        </p>
      )}
    </>
  );
}

/** Buscas salvas de editais: cards, interruptores, ações e formulário com prévia. */
function NoticeSavedSearches() {
  const searches = useQuery<SavedSearch[], TendersApiError>({ queryKey: tendersQueryKeys.savedSearches, queryFn: fetchSavedSearches });
  const lookups = useDomainLookups();
  const confirm = useConfirm();
  const remove = useDeleteSavedSearch();
  const duplicate = useDuplicateSavedSearch();
  const [formTarget, setFormTarget] = useState<SavedSearchFormTarget | null>(null);
  const closeForm = useCallback(() => setFormTarget(null), []);

  const openCreate = () => setFormTarget({ initialValues: EMPTY_SAVED_SEARCH_FORM });

  const handleDelete = async (search: SavedSearch) => {
    const confirmed = await confirm({
      title: 'Excluir busca salva',
      message: `A busca "${search.name}" sai da lista e deixa de notificar. Os editais e os acompanhamentos não mudam.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (confirmed) remove.mutate(search.id);
  };

  const list = searches.data ?? [];

  let content;
  if (searches.isPending) {
    content = <LoadingBlock label="Carregando as buscas salvas…" />;
  } else if (searches.isError) {
    content = <LoadError message={searches.error.message} onRetry={() => void searches.refetch()} retrying={searches.isFetching} />;
  } else if (list.length === 0) {
    content = (
      <EmptyState
        icon={BookmarkPlus}
        title="Você ainda não tem buscas salvas de editais."
        description="Salve os termos e filtros que você usa para ver os editais abertos que batem e receber avisos no sino."
        action={
          <Button type="button" size="sm" onClick={openCreate} icon={<Plus size={15} aria-hidden="true" />}>
            Criar busca
          </Button>
        }
      />
    );
  } else {
    content = (
      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {list.map((search) => (
          <li key={search.id}>
            <SavedSearchCard
              search={search}
              lookups={lookups}
              onEdit={() => setFormTarget({ search, initialValues: savedSearchToForm(search) })}
              onDuplicate={() => duplicate.mutate(search.id)}
              onDelete={() => void handleDelete(search)}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <ListHeader
        description={
          searches.data
            ? `${list.length} de ${MAX_SAVED_SEARCHES} buscas. Cada uma mostra os editais abertos que batem agora.`
            : 'Suas buscas de editais nesta conta.'
        }
        canCreate={list.length < MAX_SAVED_SEARCHES}
        onCreate={openCreate}
        error={remove.error ?? duplicate.error}
      />
      {content}
      <SavedSearchFormDialog target={formTarget} onClose={closeForm} />
    </>
  );
}

/** Buscas salvas de contratos: as mesmas ações, com os contratos vigentes que batem. */
function ContractSavedSearches() {
  const searches = useQuery<ContractSavedSearch[], TendersApiError>({
    queryKey: tendersQueryKeys.contractSavedSearches,
    queryFn: fetchContractSavedSearches,
  });
  const lookups = useDomainLookups();
  const confirm = useConfirm();
  const remove = useDeleteContractSavedSearch();
  const duplicate = useDuplicateContractSavedSearch();
  const [formTarget, setFormTarget] = useState<ContractSearchFormTarget | null>(null);
  const closeForm = useCallback(() => setFormTarget(null), []);

  const openCreate = () => setFormTarget({ initialValues: EMPTY_CONTRACT_SEARCH_FORM });

  const handleDelete = async (search: ContractSavedSearch) => {
    const confirmed = await confirm({
      title: 'Excluir busca salva',
      message: `A busca "${search.name}" sai da lista e deixa de avisar dos vencimentos. Os contratos e os favoritos não mudam.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (confirmed) remove.mutate(search.id);
  };

  const list = searches.data ?? [];

  let content;
  if (searches.isPending) {
    content = <LoadingBlock label="Carregando as buscas salvas…" />;
  } else if (searches.isError) {
    content = <LoadError message={searches.error.message} onRetry={() => void searches.refetch()} retrying={searches.isFetching} />;
  } else if (list.length === 0) {
    content = (
      <EmptyState
        icon={BookmarkPlus}
        title="Você ainda não tem buscas salvas de contratos."
        description="Salve os termos e filtros que você usa para ver os contratos vigentes que batem e receber avisos 90 e 30 dias antes do vencimento."
        action={
          <Button type="button" size="sm" onClick={openCreate} icon={<Plus size={15} aria-hidden="true" />}>
            Criar busca
          </Button>
        }
      />
    );
  } else {
    content = (
      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {list.map((search) => (
          <li key={search.id}>
            <ContractSearchCard
              search={search}
              lookups={lookups}
              onEdit={() => setFormTarget({ search, initialValues: contractSavedSearchToForm(search) })}
              onDuplicate={() => duplicate.mutate(search.id)}
              onDelete={() => void handleDelete(search)}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <ListHeader
        description={
          searches.data
            ? `${list.length} de ${MAX_SAVED_SEARCHES} buscas. Cada uma mostra os contratos vigentes que batem agora.`
            : 'Suas buscas de contratos nesta conta.'
        }
        canCreate={list.length < MAX_SAVED_SEARCHES}
        onCreate={openCreate}
        error={remove.error ?? duplicate.error}
      />
      {content}
      <ContractSearchFormDialog target={formTarget} onClose={closeForm} />
    </>
  );
}

/** Buscas salvas (escopo, seção 9.4), em abas: editais e contratos. A aba fica na URL. */
export function SavedSearchesScreen() {
  const [params, setParams] = useSearchParams();
  const idPrefix = useId();
  const tab = listTabOf(params);
  return (
    <section>
      <Tabs tabs={LIST_TABS} active={tab} onChange={(next: ListTab) => setParams(listTabParams(next))} label="Tipo de busca salva" idPrefix={idPrefix} />
      <TabPanel idPrefix={idPrefix} tabId={tab}>
        {tab === 'editais' ? <NoticeSavedSearches /> : <ContractSavedSearches />}
      </TabPanel>
    </section>
  );
}
