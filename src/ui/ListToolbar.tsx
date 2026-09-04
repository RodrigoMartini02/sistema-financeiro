import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

interface ListToolbarProps {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filters?: ReactNode;
  action?: ReactNode;
  countLabel?: string;
}

export function ListToolbar({ search, filters, action, countLabel }: ListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {countLabel && <p className="mr-1 text-sm text-slate-500">{countLabel}</p>}

      {search && (
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? 'Buscar...'}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      )}

      {filters}

      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
