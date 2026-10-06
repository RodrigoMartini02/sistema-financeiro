import { X } from 'lucide-react';
import type { FilterChip, SearchState } from '../utils/searchFilters';

interface FilterChipsProps {
  chips: FilterChip[];
  onRemove: (next: SearchState) => void;
  onClearAll: () => void;
}

/** Filtros ativos acima dos resultados, cada um removível, e "Limpar tudo". */
export function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ul aria-label="Filtros ativos" className="contents">
        {chips.map((chip) => (
          <li
            key={chip.key}
            className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-brand-200 bg-brand-50 py-0.5 pl-2.5 pr-0.5 text-xs font-semibold text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200"
          >
            <span className="truncate">{chip.label}</span>
            <button
              type="button"
              onClick={() => onRemove(chip.without)}
              aria-label={`Remover filtro ${chip.label}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:bg-brand-500/20"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 rounded px-1 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-400 dark:hover:text-slate-200"
      >
        Limpar tudo
      </button>
    </div>
  );
}
