import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { OpcaoCatalogo } from '../types/config';
import { compararNomesCatalogo, groupSelectableCategories, normalizeCategoryText } from '../utils/categorySuggestions';
import { C as sharedC } from './dialogFormTokens';

// Mantém os mesmos valores hex já usados neste componente (alguns divergem
// sutilmente da paleta compartilhada, ex.: border/textSoft) para não alterar
// o visual atual sem revisão dedicada — reaproveita o que já é idêntico.
const C = {
  border: '#dbe6ec',
  primary: sharedC.primary,
  primaryDark: sharedC.primaryDark,
  text: sharedC.text,
  textSoft: '#33566a',
  // Mesmo cinza da subcategoria nas tabelas (slate-400).
  sub: '#94a3b8',
  placeholder: sharedC.placeholder,
};

interface Props<T extends OpcaoCatalogo> {
  categories: T[];
  value?: number;
  onChange: (id: number | undefined) => void;
  onCreateNew: (nome: string) => void;
  featuredIds?: number[];
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

interface MenuRect { top: number; left: number; width: number; }

export function CategoryFloatingSelect<T extends OpcaoCatalogo>({
  categories, value, onChange, onCreateNew, featuredIds = [], scrollContainerRef,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rect, setRect] = useState<MenuRect | null>(null);
  // Grupos (categoria com subs) começam fechados; guarda os ids dos abertos.
  const [gruposAbertos, setGruposAbertos] = useState<number[]>([]);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Só o que é diretamente selecionável entra aqui: categoria com sub ativa
  // vira cabeçalho de grupo (group.parent), nunca uma opção clicável — só as
  // subs (group.items) são selecionáveis nesse caso. A→Z com "Outros" no fim.
  const groups = groupSelectableCategories(categories)
    .map((group) => ({ ...group, items: group.items.slice().sort((a, b) => compararNomesCatalogo(a.nome, b.nome)) }))
    .sort((a, b) => compararNomesCatalogo(a.parent?.nome ?? a.items[0].nome, b.parent?.nome ?? b.items[0].nome));
  const selectable = groups.flatMap((group) => group.items);
  const selected = selectable.find((c) => c.id === value);

  const openMenu = () => {
    const fieldRect = fieldRef.current?.getBoundingClientRect();
    if (!fieldRect) return;
    setRect({ top: fieldRect.bottom + 6, left: fieldRect.left, width: fieldRect.width });
    setQuery('');
    // Subcategoria já escolhida: o grupo dela abre junto, para mostrar onde está.
    const grupoDaEscolhida = groups.find((group) => group.parent && group.items.some((c) => c.id === value))?.parent?.id;
    setGruposAbertos(grupoDaEscolhida ? [grupoDaEscolhida] : []);
    setOpen(true);
  };

  const closeMenu = () => setOpen(false);

  const alternarGrupo = (id: number) =>
    setGruposAbertos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
  const featured = featuredIds.map((id) => selectable.find((c) => c.id === id)).filter((c): c is T => Boolean(c));

  // Buscar pelo nome do pai também deve trazer as subs dele — senão digitar
  // "Alimentação" (que não é mais selecionável sozinha) não encontraria nada.
  const groupsFiltered = normalizedQuery
    ? groups
      .map((group) => ({
        ...group,
        items: (group.parent && normalizeCategoryText(group.parent.nome).includes(normalizedQuery))
          ? group.items
          : group.items.filter((c) => normalizeCategoryText(c.nome).includes(normalizedQuery)),
      }))
      .filter((group) => group.items.length > 0)
    : groups;

  const exactMatch = selectable.some((c) => normalizeCategoryText(c.nome) === normalizedQuery);
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
          <span style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                <>
                  <p style={{ margin: '4px 0 2px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.placeholder }}>Recentes</p>
                  {featured.map((category) => (
                    <div
                      key={`featured-${category.id}`}
                      onClick={() => pick(category.id)}
                      className="hover:bg-slate-100"
                      style={{
                        display: 'flex', alignItems: 'center', height: 30, padding: '0 9px', borderRadius: 7,
                        cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontWeight: 400,
                        color: value === category.id ? C.primaryDark : C.textSoft,
                      }}
                    >
                      {category.nome}
                    </div>
                  ))}
                </>
              )}
              {groupsFiltered.map((group) => {
                // Com busca, todo grupo que sobrou aparece aberto: senão a busca esconderia o que achou.
                const aberto = !group.parent || !!normalizedQuery || gruposAbertos.includes(group.parent.id);
                return (
                  <div key={group.parent?.id ?? group.items[0].id}>
                    {/* O grupo não se escolhe (só as subs): a linha dele só abre e fecha. */}
                    {group.parent && (
                      <div
                        role="button"
                        aria-expanded={aberto}
                        onClick={() => alternarGrupo(group.parent!.id)}
                        className="hover:bg-slate-100"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 30, padding: '0 9px',
                          borderRadius: 7, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontWeight: 400, color: C.textSoft,
                        }}
                      >
                        {group.parent.nome}
                        <ChevronDown
                          size={13}
                          style={{ flexShrink: 0, color: '#8ba3b0', transform: aberto ? 'none' : 'rotate(-90deg)', transition: 'transform .13s ease' }}
                        />
                      </div>
                    )}
                    {aberto && group.items.map((category) => (
                      <div
                        key={category.id}
                        onClick={() => pick(category.id)}
                        className="hover:bg-slate-100"
                        style={{
                          display: 'flex', alignItems: 'center', height: 30, padding: '0 9px', marginLeft: group.parent ? 10 : 0,
                          borderRadius: 7, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontWeight: 400,
                          color: value === category.id ? C.primaryDark : group.parent ? C.sub : C.textSoft,
                        }}
                      >
                        {category.nome}
                      </div>
                    ))}
                  </div>
                );
              })}
              {groupsFiltered.length === 0 && !showCreateOption && (
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
