import { Copy, Pencil, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KebabMenu } from '../../ui/KebabMenu';
import { ToggleRow } from '../../ui/form';
import type { DomainLookups } from '../hooks/useDomainLists';
import { usePatchSavedSearch } from '../hooks/useSavedSearchMutations';
import type { SavedSearch } from '../types';
import { criteriaSummary } from '../utils/savedSearchForm';
import { SEARCH_URL_PARAMS } from '../utils/searchFilters';
import { Pill } from './Pill';

interface SavedSearchCardProps {
  search: SavedSearch;
  lookups: DomainLookups;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Busca salva: critérios, abertos agora, interruptores e ações (escopo, seção 9.4). */
export function SavedSearchCard({ search, lookups, onEdit, onDuplicate, onDelete }: SavedSearchCardProps) {
  const patch = usePatchSavedSearch();
  // Enquanto a API grava, o interruptor já mostra a escolha.
  const pending = patch.isPending ? patch.variables?.changes : undefined;
  const active = pending?.active ?? search.active;
  const notify = pending?.notify ?? search.notify;
  const resultsLink = `/buscar?${SEARCH_URL_PARAMS.savedSearch}=${search.id}`;
  const summary = criteriaSummary(search, lookups);

  return (
    <article
      className={`flex flex-col rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-800 ${
        active ? 'border-slate-200 dark:border-slate-700' : 'border-dashed border-slate-300 dark:border-slate-600'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <span className="break-words">{search.name}</span>
            {!active && <Pill tone="muted">Pausada</Pill>}
          </h3>
          <ul className="mt-1.5 grid grid-cols-1 gap-0.5 text-xs text-slate-600 dark:text-slate-300">
            {summary.map((line) => (
              <li key={line} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </div>
        <KebabMenu
          actions={[
            { key: 'edit', label: 'Editar', icon: <Pencil size={15} />, onClick: onEdit },
            { key: 'duplicate', label: 'Duplicar', icon: <Copy size={15} />, onClick: onDuplicate },
            { key: 'delete', label: 'Excluir', icon: <Trash2 size={15} />, onClick: onDelete, tone: 'danger' },
          ]}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700 dark:text-slate-200">
          <strong className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{search.openCount.toLocaleString('pt-BR')}</strong>{' '}
          {search.openCount === 1 ? 'edital aberto' : 'editais abertos'}
        </p>
        <Link
          to={resultsLink}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20"
        >
          <Search size={14} aria-hidden="true" />
          Ver editais
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 dark:border-slate-700 sm:grid-cols-2">
        <ToggleRow
          label="Ativa"
          description={active ? 'Conta no Início e nas notificações.' : 'Pausada: fora do Início e sem avisos.'}
          checked={active}
          disabled={patch.isPending}
          onChange={() => patch.mutate({ id: search.id, changes: { active: !active } })}
        />
        <ToggleRow
          label="Notificar"
          description={notify ? 'Avisa no sino quando aparece edital novo.' : 'Sem avisos no sino.'}
          checked={notify}
          disabled={patch.isPending}
          onChange={() => patch.mutate({ id: search.id, changes: { notify: !notify } })}
        />
      </div>
      {patch.error && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          {patch.error.message}
        </p>
      )}
    </article>
  );
}
