import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check, Plus } from 'lucide-react';
import type { Categoria } from '../types/config';

interface Props {
  categories: Categoria[];
  value?: number;
  onChange: (id: number | undefined) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  error?: string;
}

interface FlatEntry {
  id: number;
  label: string;
  isChild: boolean;
}

function buildFlatList(categories: Categoria[]): FlatEntry[] {
  const active = categories.filter((c) => c.ativo);
  const parents = active.filter((c) => !c.parent_id);
  const byParent: Record<number, Categoria[]> = {};
  active.filter((c) => c.parent_id).forEach((c) => {
    const pid = c.parent_id!;
    byParent[pid] = byParent[pid] ?? [];
    byParent[pid].push(c);
  });

  const flat: FlatEntry[] = [];
  parents.forEach((p) => {
    flat.push({ id: p.id, label: p.nome, isChild: false });
    (byParent[p.id] ?? []).forEach((s) => {
      flat.push({ id: s.id, label: `${p.nome} / ${s.nome}`, isChild: true });
    });
  });
  return flat;
}

export function CategoryCombobox({ categories, value, onChange, onCreateNew, placeholder = 'Selecione ou busque...', error }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const flat = buildFlatList(categories);
  const filtered = search.trim()
    ? flat.filter((e) => e.label.toLowerCase().includes(search.toLowerCase()))
    : flat;

  const selectedLabel = value ? (flat.find((e) => e.id === value)?.label ?? '') : '';

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const handleSelect = (id: number) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  const handleOpen = () => {
    setOpen((o) => !o);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className={[
          'h-10 w-full flex items-center justify-between rounded-2xl border bg-white px-4 text-sm shadow-sm transition-all',
          open
            ? 'border-brand-400 ring-4 ring-brand-100'
            : error
              ? 'border-red-400'
              : 'border-slate-200 hover:border-slate-300',
          'dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100',
        ].join(' ')}
      >
        <span className={selectedLabel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown
          size={15}
          className={['text-slate-400 transition-transform duration-150', open ? 'rotate-180' : ''].join(' ')}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoria..."
              autoFocus
              className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400 dark:text-slate-200 dark:placeholder-slate-500"
            />
          </div>

          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400">Nenhuma categoria encontrada</p>
            ) : (
              filtered.map((entry) => {
                const isSelected = value === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleSelect(entry.id)}
                    className={[
                      'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition',
                      entry.isChild ? 'pl-7 text-slate-500 text-xs dark:text-slate-400' : 'font-medium text-slate-700 dark:text-slate-200',
                      isSelected ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400' : 'hover:bg-slate-50 dark:hover:bg-slate-700',
                    ].join(' ')}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isSelected && <Check size={12} className="text-brand-600 dark:text-brand-400" />}
                    </span>
                    {entry.label}
                  </button>
                );
              })
            )}
          </div>

          {onCreateNew && (
            <div className="border-t border-slate-100 p-2 dark:border-slate-700">
              <button
                type="button"
                onClick={() => { onCreateNew(); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50 transition dark:text-brand-400 dark:hover:bg-brand-900/20"
              >
                <Plus size={12} /> Nova categoria
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
