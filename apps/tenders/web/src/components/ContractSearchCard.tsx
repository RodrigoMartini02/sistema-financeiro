import { CalendarClock, Copy, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KebabMenu } from '../../ui/KebabMenu';
import { ToggleRow } from '../../ui/form';
import type { DomainLookups } from '../hooks/useDomainLists';
import { usePatchContractSavedSearch } from '../hooks/useContractSearchMutations';
import type { ContractSavedSearch } from '../types';
import { CONTRACT_URL_PARAMS } from '../utils/contractFilters';
import { contractCriteriaSummary } from '../utils/contractSearchForm';
import { contractSavedSearchTotal } from '../utils/savedSearchTotal';
import { ListCard, ListCardLine } from './ListCard';
import { Pill } from './Pill';

interface ContractSearchCardProps {
  search: ContractSavedSearch;
  lookups: DomainLookups;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** "contratos vigentes" → "Contratos vigentes", para o rótulo da métrica. */
function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Busca salva de contratos: critérios, vigentes agora, interruptores e ações. */
export function ContractSearchCard({ search, lookups, onEdit, onDuplicate, onDelete }: ContractSearchCardProps) {
  const patch = usePatchContractSavedSearch();
  // Enquanto a API grava, o interruptor já mostra a escolha.
  const pending = patch.isPending ? patch.variables?.changes : undefined;
  const active = pending?.active ?? search.active;
  const notify = pending?.notify ?? search.notify;
  const resultsLink = `/contratos?${CONTRACT_URL_PARAMS.savedSearch}=${search.id}`;
  const summary = contractCriteriaSummary(search, lookups);
  const total = contractSavedSearchTotal(search);

  return (
    <ListCard
      muted={!active}
      title={
        <>
          <span className="break-words">{search.name}</span>
          {!active && (
            <span className="ml-2 align-middle">
              <Pill tone="muted">Pausada</Pill>
            </span>
          )}
        </>
      }
      topAction={
        <KebabMenu
          actions={[
            { key: 'edit', label: 'Editar', icon: <Pencil size={15} />, onClick: onEdit },
            { key: 'duplicate', label: 'Duplicar', icon: <Copy size={15} />, onClick: onDuplicate },
            { key: 'delete', label: 'Excluir', icon: <Trash2 size={15} />, onClick: onDelete, tone: 'danger' },
          ]}
        />
      }
      context={summary.map((line) => (
        <ListCardLine key={line} lines="all">
          {line}
        </ListCardLine>
      ))}
      metrics={[
        {
          label: capitalized(total.label),
          value: total.note ? (
            <span className="flex flex-col">
              <span>{total.count}</span>
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">{total.note}</span>
            </span>
          ) : (
            total.count
          ),
        },
      ]}
      footer={
        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-wrap gap-2">
            <Link
              to={resultsLink}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20"
            >
              <CalendarClock size={14} aria-hidden="true" />
              Ver contratos
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ToggleRow
              label="Ativa"
              description={active ? 'Conta nos avisos de vencimento.' : 'Pausada: sem avisos.'}
              checked={active}
              disabled={patch.isPending}
              onChange={() => patch.mutate({ id: search.id, changes: { active: !active } })}
            />
            <ToggleRow
              label="Notificar"
              description={notify ? 'Avisa no sino 90 e 30 dias antes do vencimento.' : 'Sem avisos no sino.'}
              checked={notify}
              disabled={patch.isPending}
              onChange={() => patch.mutate({ id: search.id, changes: { notify: !notify } })}
            />
          </div>
          {patch.error && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {patch.error.message}
            </p>
          )}
        </div>
      }
    />
  );
}
