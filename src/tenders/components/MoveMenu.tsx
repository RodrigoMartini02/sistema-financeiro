import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import { Z_DROPDOWN } from '../../ui/zIndex';
import { TRACKING_STATUSES, type TrackingStatus } from '../types';
import { TRACKING_STATUS_LABELS } from '../utils/labels';

interface MoveMenuProps {
  current: TrackingStatus;
  onMove: (status: TrackingStatus) => void;
  /** Objeto do edital, para o leitor de tela saber o que vai mudar. */
  noticeLabel: string;
  disabled?: boolean;
}

/**
 * "Mover para…": a alternativa ao arrastar e soltar, pelo teclado e no toque
 * do celular (onde o arrastar nativo não funciona).
 */
export function MoveMenu({ current, onMove, noticeLabel, disabled = false }: MoveMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    firstItemRef.current?.focus();
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const targets = TRACKING_STATUSES.filter((status) => status !== current);
  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mover para… ${noticeLabel}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-brand-300 sm:h-8"
      >
        <ArrowLeftRight size={13} aria-hidden="true" />
        Mover para…
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-full mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${Z_DROPDOWN}`}
        >
          {targets.map((status, index) => (
            <button
              key={status}
              ref={index === 0 ? firstItemRef : undefined}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onMove(status);
              }}
              className="flex w-full items-center px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
            >
              {TRACKING_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
