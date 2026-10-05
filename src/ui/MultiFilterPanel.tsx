import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { groupHeaderState, toggleGroupSelection } from '../utils/filterGroupSelection';
import { Z_DROPDOWN } from './zIndex';

export interface FilterGroupOption {
  value: string;
  label: string;
  /** Presente quando esta opção é subcategoria de outra opção do mesmo grupo
   *  (aponta para o `value` do pai) — vira uma linha indentada sob o cabeçalho
   *  do pai em vez de uma opção solta. Opções sem filhos e sem `parentValue`
   *  continuam soltas, como sempre foram. */
  parentValue?: string;
  /** Opção visível mas não selecionável (ex.: sem permissão) — `hint` explica o motivo. */
  disabled?: boolean;
  hint?: string;
}

export interface FilterGroup {
  id: string;
  label: string;
  options: FilterGroupOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

interface MultiFilterPanelProps {
  groups: FilterGroup[];
  hasActiveFilters: boolean;
  onClear: () => void;
  /** Conteúdo acima dos grupos (ex.: período do Painel), sob o mesmo "Limpar". */
  topo?: ReactNode;
}

// Checkbox nativo não tem prop declarativa para o estado indeterminado — só
// dá para setar via `ref.current.indeterminate`, daí este componente à parte
// em vez de inline no map principal.
function ParentCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
}

// Botao unico + card popover com todos os grupos de filtro em multi-selecao
// (checkbox por opcao). Cada grupo filtra em OR (qualquer opcao marcada
// passa); grupos diferentes combinam em AND — quem monta `groups` e quem
// aplica essa combinacao no array de dados, este componente so cuida da UI
// de selecionar. Generico o suficiente para ser reaproveitado por outras
// telas de listagem alem de Despesas.
export function MultiFilterPanel({ groups, hasActiveFilters, onClear, topo }: MultiFilterPanelProps) {
  const [open, setOpen] = useState(false);
  // Todos os grupos comecam colapsados — cada um expande/colapsa
  // independentemente, sem exclusividade entre eles (nao e accordion).
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggleOption = (group: FilterGroup, value: string) => {
    const next = new Set(group.selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    group.onChange(next);
  };

  // O cabeçalho marca e desmarca o pai junto com as filhas: há lançamentos
  // feitos direto no pai, e marcar o grupo deve trazê-los também.
  const toggleParent = (group: FilterGroup, parent: FilterGroupOption, children: FilterGroupOption[]) => {
    group.onChange(toggleGroupSelection(group.selected, parent.value, children.map((child) => child.value)));
  };

  // Organiza as opções de um grupo em: soltas (sem parentValue e sem
  // filhas) e agrupadas por pai (parentValue aponta para outra option do
  // mesmo grupo). Uma option com filhas vira só cabeçalho — ela mesma não
  // aparece como linha solta, mesmo que não tenha `parentValue`.
  const organizeOptions = (options: FilterGroupOption[]) => {
    const childrenByParent = new Map<string, FilterGroupOption[]>();
    for (const opt of options) {
      if (!opt.parentValue) continue;
      const list = childrenByParent.get(opt.parentValue) ?? [];
      list.push(opt);
      childrenByParent.set(opt.parentValue, list);
    }
    const loose = options.filter((opt) => !opt.parentValue && !childrenByParent.has(opt.value));
    const parents = options.filter((opt) => !opt.parentValue && childrenByParent.has(opt.value));
    return { loose, parents, childrenByParent };
  };

  const toggleGrupoAberto = (groupId: string) => {
    setGruposAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Filtros"
        title="Filtros"
        className={[
          'inline-flex items-center justify-center rounded-full h-8 w-8 transition select-none',
          hasActiveFilters
            ? 'bg-[#0EC4D8]/15 text-[#0a9db5] dark:bg-[#0EC4D8]/20 dark:text-[#0EC4D8]'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
        ].join(' ')}
      >
        <SlidersHorizontal size={14} />
      </button>

      {open && (
        <div
          role="group"
          className={[
            'absolute right-0 top-full mt-1.5 w-[min(320px,calc(100vw-2rem))] max-h-[min(480px,70vh)] overflow-y-auto',
            'rounded-xl border border-slate-100 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800',
            Z_DROPDOWN,
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Filtros</span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-100 transition dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
              >
                <X size={10} /> Limpar
              </button>
            )}
          </div>

          {topo && (
            <div className="mb-2 border-b border-slate-100 pb-3 dark:border-slate-700">{topo}</div>
          )}

          <div className="flex flex-col gap-1">
            {groups.map((group) => {
              const isOpen = gruposAbertos.has(group.id);
              const isGroupActive = group.selected.size > 0;
              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() => toggleGrupoAberto(group.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <span
                      className={[
                        'text-[11px] font-semibold uppercase tracking-wide',
                        isGroupActive ? 'text-[#0a9db5] dark:text-[#0EC4D8]' : 'text-slate-400 dark:text-slate-500',
                      ].join(' ')}
                    >
                      {group.label}
                    </span>
                    <ChevronDown
                      size={12}
                      className={[
                        'shrink-0 transition-transform duration-150',
                        isOpen ? 'rotate-180' : '',
                        isGroupActive ? 'text-[#0a9db5] dark:text-[#0EC4D8]' : 'text-slate-400 dark:text-slate-500',
                      ].join(' ')}
                    />
                  </button>
                  {isOpen && (() => {
                    const { loose, parents, childrenByParent } = organizeOptions(group.options);
                    return (
                      <div className="flex flex-col gap-0.5 pb-1">
                        {loose.map((opt) => (
                          <label
                            key={opt.value}
                            title={opt.hint}
                            className={[
                              'flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-slate-700 dark:text-slate-200',
                              opt.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              checked={group.selected.has(opt.value)}
                              disabled={opt.disabled}
                              onChange={() => toggleOption(group, opt.value)}
                            />
                            {opt.label}
                            {opt.hint && <span className="ml-auto text-[10.5px] text-slate-400">{opt.hint}</span>}
                          </label>
                        ))}
                        {parents.map((parent) => {
                          const children = childrenByParent.get(parent.value)!;
                          const headerState = groupHeaderState(group.selected, parent.value, children.map((child) => child.value));
                          return (
                            <div key={parent.value}>
                              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700">
                                <ParentCheckbox
                                  checked={headerState === 'checked'}
                                  indeterminate={headerState === 'partial'}
                                  onChange={() => toggleParent(group, parent, children)}
                                />
                                {parent.label}
                              </label>
                              {children.map((child) => (
                                <label
                                  key={child.value}
                                  className="ml-4 flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                                >
                                  <input
                                    type="checkbox"
                                    checked={group.selected.has(child.value)}
                                    onChange={() => toggleOption(group, child.value)}
                                  />
                                  {child.label}
                                </label>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
