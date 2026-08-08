import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { Z_MODAL } from './zIndex';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl' | 'xxl';
  scrollBody?: boolean;
}

const maxWSize: Record<NonNullable<DialogProps['size']>, string> = {
  md: 'max-w-lg',
  lg: 'max-w-[780px]',
  xl: 'max-w-[980px]',
  xxl: 'max-w-[1180px]',
};

const minHSize: Record<NonNullable<DialogProps['size']>, string> = {
  md: '',
  lg: 'min-h-[560px]',
  xl: 'min-h-[560px]',
  xxl: 'min-h-[560px]',
};

export function Dialog({ open, title, description, onClose, children, size = 'md', scrollBody = true }: DialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className={['fixed inset-0 flex items-end justify-center p-4 sm:items-center', Z_MODAL].join(' ')}>
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={[
          'relative z-10 w-full flex flex-col max-h-[92vh]',
          'rounded-[18px] bg-white shadow-[0_32px_80px_-24px_rgba(13,47,63,0.38),0_0_0_1px_rgba(13,47,63,0.06)]',
          'dark:bg-slate-800 dark:shadow-[0_32px_80px_-24px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)]',
          '[--dialog-px:16px] sm:[--dialog-px:26px]',
          maxWSize[size], minHSize[size],
        ].join(' ')}
        style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-6 px-[var(--dialog-px)] pb-[18px] pt-[22px]">
          <div className="flex flex-col gap-[3px]">
            <p className="text-[19px] font-bold tracking-[-0.01em] text-[#0f2b38] dark:text-white">{title}</p>
            {description && (
              <p className="text-[13px] text-[#6c8593] dark:text-slate-400">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#e3ecf1] bg-transparent text-[#7b93a1] transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className={[
          'px-[var(--dialog-px)] pb-5',
          scrollBody ? 'scrollbar-thin overflow-y-auto' : 'flex flex-col flex-1 min-h-0 overflow-hidden',
        ].join(' ')}>{children}</div>
      </div>
    </div>
  );
}
