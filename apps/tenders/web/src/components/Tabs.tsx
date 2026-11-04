import { useRef, type KeyboardEvent, type ReactNode } from 'react';

// Abas acessíveis (setas esquerda e direita trocam a aba): detalhe do edital e Configurações.

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  tabs: ReadonlyArray<TabItem<T>>;
  active: T;
  onChange: (tab: T) => void;
  /** Nome da lista de abas para leitores de tela. */
  label: string;
  idPrefix: string;
}

export function Tabs<T extends string>({ tabs, active, onChange, label, idPrefix }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    onChange(nextTab.id);
    refs.current[nextIndex]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 dark:border-slate-700">
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600',
              selected
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, tabId, children }: { idPrefix: string; tabId: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${tabId}`} aria-labelledby={`${idPrefix}-tab-${tabId}`} tabIndex={0} className="pt-4 focus:outline-none">
      {children}
    </div>
  );
}
