import { type ReactNode, useEffect, useRef } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { Z_DRAWER } from './zIndex';
import { GUIDE_LAYER_MODAL, useFirstAccessGuideSurface } from '../context/FirstAccessGuideContext';

interface DrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'sm';
}

const widthBySize: Record<NonNullable<DrawerProps['size']>, string> = {
  md: 'sm:w-[820px]',
  sm: 'sm:w-[620px]',
};

export function Drawer({ open, title, subtitle, onClose, onBack, children, footer, size = 'md' }: DrawerProps) {
  useFirstAccessGuideSurface(GUIDE_LAYER_MODAL, open);

  const openerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={['fixed inset-0', Z_DRAWER].join(' ')} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#040E12]/45" onClick={onClose} />
      <div
        ref={panelRef}
        className={[
          'motion-safe:animate-[drawer-in_180ms_cubic-bezier(0.22,1,0.36,1)]',
          'absolute inset-y-0 right-0 flex h-full w-full max-w-full flex-col border-l border-slate-200 bg-white shadow-[-30px_0_80px_rgba(2,12,17,0.28)]',
          'dark:border-slate-700 dark:bg-slate-900',
          'sm:max-w-[calc(100vw-48px)]',
          widthBySize[size],
        ].join(' ')}
      >
        <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[#eef2f7] px-4 dark:border-slate-800 sm:h-[68px] sm:px-6">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold tracking-[-0.01em] text-[#0f172a] dark:text-white">{title}</p>
            {subtitle && (
              <p className="truncate text-[12.5px] text-[#64748b] dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-[#e3ecf1] text-[#7b93a1] transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 sm:h-[34px] sm:w-[34px]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-[#eef2f7] px-4 py-3 dark:border-slate-800 sm:px-6 sm:py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
