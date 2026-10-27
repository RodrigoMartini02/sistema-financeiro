import { BookmarkPlus, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import type { DashboardContractSavedSearch, DashboardSavedSearch } from '../types';
import { savedSearchHealth } from '../utils/dashboard';
import { CONTRACT_URL_PARAMS } from '../utils/contractFilters';
import { SEARCH_URL_PARAMS } from '../utils/searchFilters';
import { panelLinkClass } from './DashboardPanel';
import { Pill } from './Pill';

const rowClass =
  'flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:bg-slate-700/50';

const count = (value: number) => value.toLocaleString('pt-BR');

/** Buscas salvas de editais: abertos e, por busca, os novos de hoje e dos últimos 7 dias; marca a pausada e a sem novos em 30 dias. */
export function SavedSearchesSummary({ searches }: { searches: DashboardSavedSearch[] }) {
  if (searches.length === 0) {
    return (
      <EmptyState
        icon={BookmarkPlus}
        title="Nenhuma busca salva."
        action={
          <Link to="/buscas" className={panelLinkClass}>
            Criar busca
          </Link>
        }
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-1">
      {searches.map((search) => {
        const health = savedSearchHealth(search);
        return (
          <li key={search.id}>
            <Link to={`/buscar?${SEARCH_URL_PARAMS.savedSearch}=${search.id}`} className={rowClass}>
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-semibold ${health === 'paused' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
                  {search.name}
                </span>
                {health !== 'paused' && (
                  <span className="block text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {count(search.newToday)} novos hoje · {count(search.newLast7Days)} em 7 dias
                  </span>
                )}
              </span>
              {health === 'paused' && <Pill tone="muted">Pausada</Pill>}
              {health === 'quiet' && (
                <Pill tone="warning" title="Nenhum edital novo nos últimos 30 dias: vale rever os filtros">
                  Sem novos em 30 dias
                </Pill>
              )}
              <span className="tabular-nums text-xs font-semibold text-slate-600 dark:text-slate-300">
                {count(search.openCount)} {search.openCount === 1 ? 'aberto' : 'abertos'}
              </span>
              <ChevronRight size={14} className="text-slate-400" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Buscas salvas de contratos, com o total de vigentes da última contagem (nada é lido do armazém aqui). */
export function ContractSearchesSummary({ searches }: { searches: DashboardContractSavedSearch[] }) {
  if (searches.length === 0) {
    return (
      <EmptyState
        icon={BookmarkPlus}
        title="Nenhuma busca de contratos salva."
        description="Salve uma busca em Contratos a vencer para acompanhar o que vence."
        action={
          <Link to="/contratos" className={panelLinkClass}>
            Ver contratos a vencer
          </Link>
        }
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-1">
      {searches.map((search) => (
        <li key={search.id}>
          <Link to={`/contratos?${CONTRACT_URL_PARAMS.savedSearch}=${search.id}`} className={rowClass}>
            <span className={`min-w-0 flex-1 truncate font-semibold ${search.active ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
              {search.name}
            </span>
            {!search.active && <Pill tone="muted">Pausada</Pill>}
            <span className="tabular-nums text-xs font-semibold text-slate-600 dark:text-slate-300">
              {search.activeCount === null ? 'Ainda não contado' : `${count(search.activeCount)} ${search.activeCount === 1 ? 'vigente' : 'vigentes'}`}
            </span>
            <ChevronRight size={14} className="text-slate-400" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
