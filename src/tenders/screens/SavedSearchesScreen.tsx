import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookmarkPlus, Plus } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/EmptyState';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { SavedSearchCard } from '../components/SavedSearchCard';
import { SavedSearchFormDialog, type SavedSearchFormTarget } from '../components/SavedSearchFormDialog';
import { useDomainLookups } from '../hooks/useDomainLists';
import { useDeleteSavedSearch, useDuplicateSavedSearch } from '../hooks/useSavedSearchMutations';
import { tendersQueryKeys } from '../services/queryKeys';
import { fetchSavedSearches } from '../services/savedSearchesService';
import type { TendersApiError } from '../services/tendersApiError';
import type { SavedSearch } from '../types';
import { EMPTY_SAVED_SEARCH_FORM, savedSearchToForm } from '../utils/savedSearchForm';

/** Limite da API por pessoa e conta. */
const MAX_SAVED_SEARCHES = 50;

/** Buscas salvas (escopo, seção 9.4): cards, interruptores, ações e formulário com prévia. */
export function SavedSearchesScreen() {
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
  const actionError = remove.error ?? duplicate.error;

  let content;
  if (searches.isPending) {
    content = <LoadingBlock label="Carregando as buscas salvas…" />;
  } else if (searches.isError) {
    content = <LoadError message={searches.error.message} onRetry={() => void searches.refetch()} retrying={searches.isFetching} />;
  } else if (list.length === 0) {
    content = (
      <EmptyState
        icon={BookmarkPlus}
        title="Você ainda não tem buscas salvas."
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
      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
    <section className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {searches.data
            ? `${list.length} de ${MAX_SAVED_SEARCHES} buscas. Cada uma mostra os editais abertos que batem agora.`
            : 'Suas buscas nesta conta.'}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={openCreate}
          disabled={list.length >= MAX_SAVED_SEARCHES}
          icon={<Plus size={15} aria-hidden="true" />}
        >
          Nova busca
        </Button>
      </div>
      {actionError && (
        <p role="alert" className="mb-3 text-xs font-medium text-red-600 dark:text-red-400">
          {actionError.message}
        </p>
      )}
      {content}
      <SavedSearchFormDialog target={formTarget} onClose={closeForm} />
    </section>
  );
}
