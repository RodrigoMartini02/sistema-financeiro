import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { Z_DROPDOWN } from './zIndex';

export interface KebabMenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

interface KebabMenuProps {
  actions: KebabMenuAction[];
}

export function KebabMenu({ actions }: KebabMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ações"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className={['absolute right-0 top-full mt-1 min-w-[180px] rounded-xl border border-slate-100 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800', Z_DROPDOWN].join(' ')}>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              onClick={() => { setOpen(false); action.onClick(); }}
              className={[
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                action.tone === 'danger'
                  ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
