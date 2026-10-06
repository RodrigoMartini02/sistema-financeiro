import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select } from '../../ui/form';
import { PER_PAGE_OPTIONS } from '../utils/searchFilters';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPage: (page: number) => void;
  onPerPage: (perPage: number) => void;
}

const pageButton =
  'inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';

/** Paginação no servidor: 20 por página, com 50 e 100. */
export function Pagination({ page, totalPages, total, perPage, onPage, onPerPage }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {first.toLocaleString('pt-BR')}–{last.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Por página
          <Select value={String(perPage)} onChange={(event) => onPerPage(Number(event.target.value))} className="w-[76px]">
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
        <button type="button" className={pageButton} onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={14} aria-hidden="true" />
          Anterior
        </button>
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300" aria-current="page">
          Página {page.toLocaleString('pt-BR')} de {Math.max(1, totalPages).toLocaleString('pt-BR')}
        </span>
        <button type="button" className={pageButton} onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          Próxima
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
