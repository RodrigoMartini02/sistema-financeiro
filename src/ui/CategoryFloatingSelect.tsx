import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { Categoria } from '../types/config';
import { normalizeCategoryText } from '../utils/categorySuggestions';
import { C as sharedC } from './dialogFormTokens';

// Mantém os mesmos valores hex já usados neste componente (alguns divergem
// sutilmente da paleta compartilhada, ex.: border/textSoft) para não alterar
// o visual atual sem revisão dedicada — reaproveita o que já é idêntico.
const C = {
  border: '#dbe6ec',
  primary: sharedC.primary,
  primaryDark: sharedC.primaryDark,
  primarySoft: sharedC.primarySoft,
  primarySoftBorder: sharedC.primarySoftBorder,
  text: sharedC.text,
  textSoft: '#33566a',
  placeholder: sharedC.placeholder,
};

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
    <div style={{ position: 'relative' }}>
      <button
        ref={fieldRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', boxSizing: 'border-box', height: 32, padding: '0 9px',
          borderRadius: 10, border: `1px solid ${open ? C.primary : sharedC.borderInput}`,
          background: '#fff', cursor: 'pointer', transition: 'border-color .13s ease',
        }}
      >
        {selected ? (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.primaryDark, background: C.primarySoft, border: `1px solid ${C.primarySoftBorder}`, borderRadius: 6, padding: '2px 7px' }}>
            {selected.nome}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: C.placeholder }}>Selecionar categoria</span>
        )}
        <ChevronDown size={13} style={{ flexShrink: 0, color: '#8ba3b0' }} />
      </button>

      {open && rect && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={closeMenu} />
          <div
            ref={menuRef}
            style={{
              position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 41,
              display: 'flex', flexDirection: 'column', gap: 6,
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12,
              boxShadow: '0 20px 44px -14px rgba(13, 47, 63, 0.34)', padding: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar categoria..."
                style={{
                  flex: 1, height: 38, borderRadius: 9, border: `1.5px solid ${C.border}`,
                  background: '#fff', padding: '0 11px', fontSize: '13.5px', color: C.text, outline: 'none',
                }}
              />
              {selected && (
                <button
                  type="button"
                  onClick={() => pick(selected.id)}
                  title="Remover categoria"
                  style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 9, color: C.placeholder, background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 200, overflowY: 'auto' }}>
              {!normalizedQuery && featured.length > 0 && (
                <p style={{ margin: '4px 0 2px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.placeholder }}>Recentes</p>
              )}
              {filtered.map((category) => (
                <div
                  key={category.id}
                  onClick={() => pick(category.id)}
                  style={{
                    display: 'flex', alignItems: 'center', height: 30, padding: '0 9px', borderRadius: 7,
                    cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                    fontWeight: value === category.id ? 600 : 500,
                    color: value === category.id ? C.primaryDark : C.textSoft,
                    background: value === category.id ? C.primarySoft : 'transparent',
                  }}
                >
                  {category.nome}
                </div>
              ))}
              {filtered.length === 0 && !showCreateOption && (
                <p style={{ padding: '8px 10px', fontSize: 13, color: C.placeholder }}>Nenhuma categoria encontrada</p>
              )}
              {showCreateOption && (
                <div
                  onClick={() => { onCreateNew(query.trim()); closeMenu(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 9px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.primaryDark }}
                >
                  <Plus size={13} /> criar "{query.trim()}"
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
