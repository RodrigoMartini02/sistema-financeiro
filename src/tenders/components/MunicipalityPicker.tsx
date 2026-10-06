import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { inputBase } from '../../ui/form';
import { normalizeSearchText } from '../../utils/storefrontCatalog';
import type { Municipality } from '../types';

const MAX_OPTIONS = 50;

interface MunicipalityPickerProps {
  id?: string;
  /** Nome do campo para leitores de tela. */
  label: string;
  /** Municípios com edital aberto (GET /domains). */
  municipalities: Municipality[];
  /** Códigos IBGE escolhidos. */
  selected: string[];
  onChange: (codes: string[]) => void;
  /** Nome para os escolhidos; fora da lista, o código. */
  nameOf: (code: string) => string | undefined;
  maxItems: number;
  disabled?: boolean;
}

/** Município com busca pelo nome (sem acento), nos que têm edital aberto. */
export function MunicipalityPicker({ id, label, municipalities, selected, onChange, nameOf, maxItems, disabled = false }: MunicipalityPickerProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const listId = useId();

  const searchable = useMemo(
    () => municipalities.map((item) => ({ ...item, key: normalizeSearchText(item.name), label: `${item.name}/${item.state}` })),
    [municipalities],
  );

  const options = useMemo(() => {
    const term = normalizeSearchText(query);
    if (!term) return [];
    const startsWith: typeof searchable = [];
    const contains: typeof searchable = [];
    for (const item of searchable) {
      if (selected.includes(item.code)) continue;
      if (item.key.startsWith(term)) startsWith.push(item);
      else if (item.key.includes(term)) contains.push(item);
    }
    return [...startsWith, ...contains].slice(0, MAX_OPTIONS);
  }, [searchable, query, selected]);

  const choose = (code: string) => {
    if (selected.length >= maxItems) {
      setLimitReached(true);
      return;
    }
    onChange([...selected, code]);
    setQuery('');
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option.code);
    } else if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    }
  };

  const showList = query.trim().length > 0;
  const activeOption = options[activeIndex];
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && activeOption ? `${listId}-${activeOption.code}` : undefined}
        disabled={disabled}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setLimitReached(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Digite o nome do município"
        className={`${inputBase} disabled:cursor-not-allowed disabled:opacity-50`}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="max-h-52 overflow-y-auto rounded-[10px] border border-slate-200 bg-white py-1 shadow-sm dark:border-slate-600 dark:bg-slate-800"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Nenhum município com edital aberto encontrado.</li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.code}
                id={`${listId}-${option.code}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.code)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer px-3 py-1.5 text-[13px] ${
                  index === activeIndex ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
      {limitReached && (
        <p role="alert" className="text-[11px] font-medium text-[#dc2626]">
          Até {maxItems} municípios.
        </p>
      )}
      {selected.length > 0 && (
        <ul aria-label="Municípios escolhidos" className="flex flex-wrap gap-1">
          {selected.map((code) => {
            const name = nameOf(code) ?? code;
            return (
              <li
                key={code}
                className="inline-flex items-center gap-1 rounded-md bg-brand-50 py-0.5 pl-2 pr-1 text-[12px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
              >
                {name}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((item) => item !== code))}
                  aria-label={`Remover ${name}`}
                  className="flex h-5 w-5 items-center justify-center rounded text-brand-600 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-500/20"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
