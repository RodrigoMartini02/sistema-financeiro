import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { Categoria } from '../types/config';
import { normalizeCategoryText } from '../utils/categorySuggestions';

interface Props {
  categories: Categoria[];
  value?: number;
  onChange: (id: number | undefined) => void;
  onCreateNew: (nome: string) => void;
  featuredIds?: number[];
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

interface MenuRect { top: number; left: number; width: number; }

export function CategoryFloatingSelect({ categories, value, onChange, onCreateNew, featuredIds = [], scrollContainerRef }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rect, setRect] = useState<MenuRect | null>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const active = categories.filter((c) => c.ativo);
  const selected = active.find((c) => c.id === value);

  const openMenu = () => {
    const fieldRect = fieldRef.current?.getBoundingClientRect();
    if (!fieldRect) return;
    setRect({ top: fieldRect.bottom + 6, left: fieldRect.left, width: fieldRect.width });
    setQuery('');
    setOpen(true);
  };

  const closeMenu = () => setOpen(false);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || fieldRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    const scrollContainer = scrollContainerRef?.current;

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    scrollContainer?.addEventListener('scroll', closeMenu);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      scrollContainer?.removeEventListener('scroll', closeMenu);
    };
  }, [open, scrollContainerRef]);

  const normalizedQuery = normalizeCategoryText(query);
  const featured = featuredIds.map((id) => active.find((c) => c.id === id)).filter((c): c is Categoria => Boolean(c));
  const alphabetical = active.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const filtered = normalizedQuery
    ? alphabetical.filter((c) => normalizeCategoryText(c.nome).includes(normalizedQuery))
    : [...featured, ...alphabetical.filter((c) => !featured.some((f) => f.id === c.id))];

  const exactMatch = active.some((c) => normalizeCategoryText(c.nome) === normalizedQuery);
  const showCreateOption = normalizedQuery.length > 0 && !exactMatch;

  const pick = (id: number) => {
    onChange(value === id ? undefined : id);
    closeMenu();
  };

  return (
    <div className="relative">
      <button
        ref={fieldRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm transition-all hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700"
      >
        {selected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
            {selected.nome}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">Selecionar categoria</span>
        )}
        <ChevronDown size={15} className="shrink-0 text-slate-400" />
      </button>

      {open && rect && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-50 flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-800"
        >
          <div className="flex items-center gap-1.5">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar categoria..."
              className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
            {selected && (
              <button
                type="button"
                onClick={() => pick(selected.id)}
                title="Remover categoria"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-700"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {!normalizedQuery && featured.length > 0 && (
              <p className="mt-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Recentes</p>
            )}
            {filtered.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => pick(category.id)}
                className={[
                  'rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                  value === category.id
                    ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700',
                ].join(' ')}
              >
                {category.nome}
              </button>
            ))}
            {filtered.length === 0 && !showCreateOption && (
              <p className="px-2.5 py-2 text-sm text-slate-400">Nenhuma categoria encontrada</p>
            )}
            {showCreateOption && (
              <button
                type="button"
                onClick={() => { onCreateNew(query.trim()); closeMenu(); }}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20"
              >
                <Plus size={13} /> criar "{query.trim()}"
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
