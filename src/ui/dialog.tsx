import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg';
}

export function Dialog({ open, title, description, onClose, children, size = 'md' }: DialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;

  const maxW = size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  const minH = size === 'lg' ? 'min-h-[560px]' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={[
        'relative z-10 w-full flex flex-col max-h-[90vh]',
        'rounded-[28px] bg-white shadow-[0_32px_80px_-12px_rgba(15,23,42,0.45)]',
        'dark:bg-slate-800 dark:shadow-[0_32px_80px_-12px_rgba(0,0,0,0.7)]',
        maxW, minH,
      ].join(' ')}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 shrink-0 border-b border-slate-100 dark:border-slate-700">
          <div>
            <p className="text-base font-black tracking-tight text-slate-950 dark:text-white">{title}</p>
            {description && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition dark:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <X size={15} />
          </button>
        </div>
        {/* Scrollable body */}
        <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
