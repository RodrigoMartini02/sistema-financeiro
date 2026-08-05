import type { ElementType, ReactNode } from 'react';
import { X } from 'lucide-react';

export interface FirstAccessGuideAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
}

type GuidePlacement = 'top' | 'bottom' | 'left' | 'right';

interface FirstAccessGuideCardProps {
  eyebrow?: string;
  title?: string;
  description: string;
  icon?: ElementType;
  steps?: string[];
  actions?: FirstAccessGuideAction[];
  onDismiss?: () => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
  floating?: boolean;
  placement?: GuidePlacement;
}

const alignClasses: Record<NonNullable<FirstAccessGuideCardProps['align']>, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

export function FirstAccessGuideCard({
  description,
  icon: Icon,
  onDismiss,
  className = '',
  align = 'left',
  floating = false,
  placement = 'top',
}: FirstAccessGuideCardProps) {
  const wrapClassName = floating
    ? ['first-access-guide-wrap pointer-events-none', className].join(' ')
    : ['first-access-guide-wrap flex w-full', alignClasses[align], className].join(' ');

  return (
    <div className={wrapClassName}>
      <div
        className={[
          'first-access-guide-bubble pointer-events-auto relative flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 shadow-lg',
          'border-cyan-300 bg-cyan-50 text-slate-800 shadow-cyan-900/10',
          'dark:border-cyan-700/70 dark:bg-cyan-950 dark:text-cyan-50 dark:shadow-black/20',
          'first-access-guide-bubble-' + placement,
        ].join(' ')}
      >
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-200 dark:bg-cyan-900 dark:text-cyan-100 dark:ring-cyan-700" aria-hidden="true">
            <Icon size={17} strokeWidth={1.9} />
          </span>
        )}

        <p className="min-w-0 flex-1 pr-1 font-normal">{description}</p>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-cyan-700/60 transition hover:bg-white hover:text-cyan-900 dark:text-cyan-100/70 dark:hover:bg-cyan-900 dark:hover:text-white"
            aria-label="Ocultar guia"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
