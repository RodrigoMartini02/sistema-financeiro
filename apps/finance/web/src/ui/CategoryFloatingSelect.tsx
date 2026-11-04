import { useRef, useState, type KeyboardEvent } from 'react';
import type { OpcaoCatalogo } from '../types/config';
import {
  compararNomesCatalogo, groupSelectableCategories, normalizeCategoryText, type NewCategoryRequest,
} from '../utils/categorySuggestions';
import { C } from './dialogFormTokens';
import { FloatingPanel } from './FloatingPanel';

const SEPARATOR = '#eef2f6';
const INVALID_BORDER = '#fca5a5';
/** Valor da opção "Nova categoria" na escolha do grupo. */
const NEW_PARENT = 'new';

interface Props<T extends OpcaoCatalogo> {
  categories: T[];
  value?: number;
  onChange: (id: number | undefined) => void;
  /** Cria o que foi pedido e devolve o id que já fica escolhido. */
  onCreate?: (request: NewCategoryRequest) => Promise<number>;
  /**
   * Conta pessoal: só se cria subcategoria, num grupo existente ou num grupo novo criado
   * junto. Sem isto (conta empresa), o "+ criar" cria uma categoria solta, como sempre foi.
   */
  groupedCreation?: boolean;
  /** Categorias mais usadas, mostradas em chips antes da lista. */
  recentIds?: number[];
  invalid?: boolean;
  /** Campo de 28px da grade de despesas; o padrão é o de 32px dos formulários. */
  compact?: boolean;
}

interface Option<T> {
  category: T;
  parent: T | null;
}

export function CategoryFloatingSelect<T extends OpcaoCatalogo>({
  categories, value, onChange, onCreate, groupedCreation = false, recentIds = [], invalid = false, compact = false,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [parentChoice, setParentChoice] = useState('');
  const [newParentName, setNewParentName] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Categoria com subcategoria ativa vira só o cabeçalho do grupo: escolhe-se a sub.
  const groups = groupSelectableCategories(categories)
    .map((group) => ({ ...group, items: group.items.slice().sort((a, b) => compararNomesCatalogo(a.nome, b.nome)) }))
    .sort((a, b) => compararNomesCatalogo(a.parent?.nome ?? a.items[0]!.nome, b.parent?.nome ?? b.items[0]!.nome));
  const options: Option<T>[] = groups.flatMap((group) => group.items.map((category) => ({ category, parent: group.parent })));
  const selected = options.find((option) => option.category.id === value);

  const normalizedQuery = normalizeCategoryText(query);
  const results = normalizedQuery
    ? options.filter(({ category, parent }) => normalizeCategoryText(category.nome).includes(normalizedQuery)
      || (parent !== null && normalizeCategoryText(parent.nome).includes(normalizedQuery)))
    : [];
  const recents = recentIds
    .map((id) => options.find((option) => option.category.id === id))
    .filter((option): option is Option<T> => option !== undefined);
  const canCreate = !!onCreate && !!normalizedQuery && creatingName === null
    && !options.some(({ category }) => normalizeCategoryText(category.nome) === normalizedQuery);
  // Os grupos que podem receber a subcategoria nova (a categoria de sistema não).
  const parentOptions = categories
    .filter((category) => !category.parent_id && category.ativo && !category.is_system)
    .sort((a, b) => compararNomesCatalogo(a.nome, b.nome));

  const startCreating = (name: string) => {
    setCreatingName(name);
    setParentChoice('');
    setNewParentName('');
    setCreateError('');
  };

  const stopCreating = () => {
    setCreatingName(null);
    setCreateError('');
  };

  const close = () => {
    setOpen(false);
    setQuery('');
    stopCreating();
  };

  const toggleOpen = () => {
    if (open) {
      close();
      return;
    }
    setExpandedGroups({});
    setOpen(true);
  };

  // Clicar de novo na categoria escolhida desmarca.
  const pick = (id: number) => {
    onChange(value === id ? undefined : id);
    close();
    triggerRef.current?.focus();
  };

  const confirmCreate = async () => {
    const name = (creatingName ?? '').trim();
    if (!name || !onCreate || isCreating) return;
    const groupName = newParentName.trim();
    if (groupedCreation && !parentChoice) {
      setCreateError('Escolha a categoria da nova subcategoria.');
      return;
    }
    if (groupedCreation && parentChoice === NEW_PARENT && !groupName) {
      setCreateError('Informe o nome da nova categoria.');
      return;
    }
    let request: NewCategoryRequest = { name };
    if (groupedCreation) {
      request = parentChoice === NEW_PARENT ? { name, newParentName: groupName } : { name, parentId: Number(parentChoice) };
    }
    setIsCreating(true);
    setCreateError('');
    try {
      const id = await onCreate(request);
      onChange(id);
      close();
      triggerRef.current?.focus();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Não foi possível criar a categoria.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (results[0]) pick(results[0].category.id);
    else if (onCreate && query.trim()) startCreating(query.trim());
  };

  const handleCreateKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void confirmCreate();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      stopCreating();
    }
  };

  const isGroupOpen = (groupId: number) => groupId in expandedGroups
    ? expandedGroups[groupId]
    : groups.some((group) => group.parent?.id === groupId && group.items.some((item) => item.id === value));

  const height = compact ? 28 : 32;
  const rowStyle = (active: boolean, indent: number) => ({
    display: 'flex', alignItems: 'center', gap: 6, flex: 'none', height: 28, padding: `0 8px 0 ${indent}px`,
    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, textAlign: 'left' as const,
    background: active ? C.primarySoft : 'transparent', color: active ? C.primaryDark : C.text,
  });

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        title={selected ? [selected.parent?.nome, selected.category.nome].filter(Boolean).join(' › ') : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', height, padding: '0 8px',
          border: `1px solid ${invalid ? INVALID_BORDER : open ? C.primary : C.borderInput}`,
          borderRadius: compact ? 8 : 10, background: '#fff', cursor: 'pointer', textAlign: 'left',
          fontSize: compact ? 12 : 13, color: selected ? C.text : C.placeholder,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? (
            <>
              {selected.parent?.nome ?? selected.category.nome}
              {selected.parent && <span style={{ color: C.textFaint }}> › {selected.category.nome}</span>}
            </>
          ) : 'Selecionar'}
        </span>
        <span aria-hidden="true" style={{ fontSize: 8, color: C.textFaint }}>▼</span>
      </button>

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={close} label="Categorias" minWidth={280} padding={8}>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(event) => { setQuery(event.target.value); stopCreating(); }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Buscar categoria..."
          className="focus:border-[#0891b2] focus:shadow-[0_0_0_3px_rgba(8,145,178,0.14)]"
          style={{ height: 28, padding: '0 9px', border: `1px solid ${C.borderInput}`, borderRadius: 8, fontSize: 12, color: C.text, outline: 'none' }}
        />

        {!normalizedQuery && recents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 2px' }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: C.textFaint }}>Recentes</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {recents.map(({ category }) => {
                const active = category.id === value;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => pick(category.id)}
                    style={{
                      height: 24, padding: '0 9px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${active ? C.primary : C.borderInput}`,
                      background: active ? C.primarySoft : '#fff', color: active ? C.primaryDark : C.text,
                    }}
                  >
                    {category.nome}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 220, overflowY: 'auto', borderTop: `1px solid ${SEPARATOR}`, paddingTop: 6 }}>
          {normalizedQuery
            ? results.map(({ category, parent }) => (
              <button key={category.id} type="button" onClick={() => pick(category.id)} style={rowStyle(category.id === value, 8)}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.nome}</span>
                {parent && <span style={{ fontSize: 11, color: C.textFaint }}>{parent.nome}</span>}
              </button>
            ))
            : groups.map((group) => {
              if (!group.parent) {
                const category = group.items[0]!;
                return (
                  <button key={category.id} type="button" onClick={() => pick(category.id)} style={rowStyle(category.id === value, 8)}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.nome}</span>
                  </button>
                );
              }
              const parent = group.parent;
              const expanded = isGroupOpen(parent.id);
              return (
                <div key={parent.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpandedGroups((current) => ({ ...current, [parent.id]: !expanded }))}
                    style={{ ...rowStyle(false, 8), fontWeight: 500 }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parent.nome}</span>
                    <span aria-hidden="true" style={{ fontSize: 11, color: C.textFaint }}>{expanded ? '▾' : '▸'}</span>
                  </button>
                  {expanded && group.items.map((category) => (
                    <button key={category.id} type="button" onClick={() => pick(category.id)} style={rowStyle(category.id === value, 22)}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.nome}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          {(normalizedQuery ? results.length === 0 : groups.length === 0) && (
            <span style={{ padding: '6px 8px', fontSize: 12, color: C.textFaint }}>Nenhuma categoria encontrada</span>
          )}
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => startCreating(query.trim())}
            style={{
              height: 28, padding: '0 8px', border: 'none', borderTop: `1px solid ${SEPARATOR}`, background: 'transparent',
              color: C.primary, fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
            }}
          >
            + criar {groupedCreation ? 'subcategoria ' : ''}“{query.trim()}”
          </button>
        )}

        {creatingName !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: `1px solid ${SEPARATOR}` }}>
            {groupedCreation && (
              <>
                <select
                  autoFocus
                  value={parentChoice}
                  onChange={(event) => setParentChoice(event.target.value)}
                  aria-label="Categoria da nova subcategoria"
                  style={{ height: 28, padding: '0 6px', border: `1px solid ${C.borderInput}`, borderRadius: 8, fontSize: 12, color: C.text, background: '#fff' }}
                >
                  <option value="">Em qual categoria?</option>
                  {parentOptions.map((parent) => <option key={parent.id} value={parent.id}>{parent.nome}</option>)}
                  <option value={NEW_PARENT}>+ Nova categoria</option>
                </select>
                {parentChoice === NEW_PARENT && (
                  <input
                    type="text"
                    value={newParentName}
                    onChange={(event) => setNewParentName(event.target.value)}
                    onKeyDown={handleCreateKeyDown}
                    placeholder="Nome da nova categoria"
                    aria-label="Nome da nova categoria"
                    style={{ height: 28, padding: '0 8px', border: `1px solid ${C.borderInput}`, borderRadius: 8, fontSize: 12, color: C.text, outline: 'none' }}
                  />
                )}
              </>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus={!groupedCreation}
                type="text"
                value={creatingName}
                onChange={(event) => setCreatingName(event.target.value)}
                onKeyDown={handleCreateKeyDown}
                aria-label={groupedCreation ? 'Nome da nova subcategoria' : 'Nome da nova categoria'}
                style={{ flex: 1, minWidth: 0, height: 28, padding: '0 8px', border: `1px solid ${C.primary}`, borderRadius: 8, fontSize: 12, color: C.text, outline: 'none' }}
              />
              <button
                type="button"
                onClick={() => void confirmCreate()}
                disabled={isCreating}
                style={{ height: 28, padding: '0 10px', border: 'none', borderRadius: 8, background: C.primary, color: '#fff', fontSize: 12, fontWeight: 500, cursor: isCreating ? 'wait' : 'pointer' }}
              >
                Criar
              </button>
              <button
                type="button"
                onClick={stopCreating}
                aria-label="Cancelar"
                style={{ width: 28, height: 28, border: 'none', borderRadius: 8, background: '#f1f5f9', color: C.textSoft, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            {createError && <span style={{ fontSize: 12, color: C.danger }}>{createError}</span>}
          </div>
        )}
      </FloatingPanel>
    </div>
  );
}
