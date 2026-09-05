import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { Z_MODAL } from './zIndex';
import { GUIDE_LAYER_MODAL, useFirstAccessGuideSurface } from '../context/FirstAccessGuideContext';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  scrollBody?: boolean;
}

// Larguras da especificação: categoria 340 · conta 440 · cartão 600.
const maxWSize: Record<NonNullable<DialogProps['size']>, string> = {
  xs: 'max-w-[340px]',
  sm: 'max-w-[440px]',
  md: 'max-w-lg',
  lg: 'max-w-[780px]',
  xl: 'max-w-[980px]',
  xxl: 'max-w-[1180px]',
};

export function Dialog({ open, title, description, onClose, children, size = 'md', scrollBody = true }: DialogProps) {
  useFirstAccessGuideSurface(GUIDE_LAYER_MODAL, open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={['fixed inset-0', 'flex items-end justify-center p-4 sm:items-center', Z_MODAL].join(' ')}>
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={[
          'dialog-panel relative z-10 w-full flex flex-col max-h-[85vh]',
          // overflow-hidden recorta o rodapé (que tem fundo próprio) nos cantos
          // arredondados do painel.
          'overflow-hidden rounded-[18px] bg-white shadow-[0_32px_80px_-24px_rgba(13,47,63,0.38),0_0_0_1px_rgba(13,47,63,0.06)]',
          'dark:bg-slate-800 dark:shadow-[0_32px_80px_-24px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)]',
          '[--dialog-px:16px] sm:[--dialog-px:26px]',
          maxWSize[size],
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-6 border-b border-[#eef2f6] px-[var(--dialog-px)] pb-[11px] pt-[12px] dark:border-slate-700">
          <div className="flex flex-col gap-[2px]">
            <p className="text-[13.5px] font-bold tracking-[-0.01em] text-[#0f172a] dark:text-white">{title}</p>
            {description && (
              <p className="text-[11.5px] font-medium text-[#64748b] dark:text-slate-400">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-0 bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-slate-100"
          >
            <X size={12} strokeWidth={2.4} />
          </button>
        </div>

        {/* Body */}
        {/* Com scrollBody=false o conteúdo controla o próprio layout (corpo
            rolável + rodapé fixo), então o Dialog não impõe padding. */}
        <div className={
          scrollBody
            ? 'scrollbar-thin overflow-y-auto px-[var(--dialog-px)] pb-3.5 pt-3'
            : 'flex flex-col flex-1 min-h-0 overflow-hidden'
        }>{children}</div>
      </div>
    </div>
  );
}
