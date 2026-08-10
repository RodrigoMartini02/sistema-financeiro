import { useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

const GAP = 12;
const VIEWPORT_MARGIN = 12;
const ARROW_MARGIN = 20;

function extractWidth(className: string): number {
  const match = className.match(/w-\[min\((\d+(?:\.\d+)?)rem/);
  return match ? parseFloat(match[1]!) * 16 : 320;
}

export function FirstAccessGuideCard({
  description,
  icon: Icon,
  onDismiss,
  className = '',
  align = 'left',
  floating = false,
  placement = 'top',
}: FirstAccessGuideCardProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; arrowLeft: number; width: number; placement: 'top' | 'bottom'; viewportHeight: number } | null>(null);

  const preferredWidth = extractWidth(className);
  const isVerticalPlacement = placement === 'top' || placement === 'bottom';
  const wantsBottom = isVerticalPlacement ? placement === 'bottom' : true;
  const alignRight = align === 'right' || className.includes('right-0');

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    function reposition() {
      const rect = anchor!.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(preferredWidth, vw - VIEWPORT_MARGIN * 2);

      // Decide vertical side, com flip automático se não couber.
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      let vertical: 'top' | 'bottom' = wantsBottom ? 'bottom' : 'top';
      if (vertical === 'bottom' && spaceBelow < 160 && spaceAbove > spaceBelow) vertical = 'top';
      if (vertical === 'top' && spaceAbove < 160 && spaceBelow > spaceAbove) vertical = 'bottom';

      // "top" = topo do balão fica colado em rect.bottom (abre pra baixo).
      // "bottom" = base do balão fica colada em rect.top (abre pra cima, ancorada pelo fundo).
      const top = vertical === 'bottom' ? rect.bottom + GAP : rect.top - GAP;

      // Alinha à direita ou esquerda da âncora, sempre dentro da viewport.
      let left = alignRight ? rect.right - width : rect.left;
      left = Math.min(Math.max(left, VIEWPORT_MARGIN), vw - width - VIEWPORT_MARGIN);
      const anchorCenter = rect.left + rect.width / 2;
      const arrowLeft = Math.min(Math.max(anchorCenter - left, ARROW_MARGIN), width - ARROW_MARGIN);

      setCoords({ top, left, arrowLeft, width, placement: vertical, viewportHeight: vh });
    }

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [wantsBottom, alignRight, preferredWidth]);

  const bubble = coords && (
    <div
      className={[
        'first-access-guide-bubble pointer-events-auto fixed flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 shadow-lg',
        'border-cyan-300 bg-cyan-50 text-slate-800 shadow-cyan-900/10',
        'dark:border-cyan-700/70 dark:bg-cyan-950 dark:text-cyan-50 dark:shadow-black/20',
        'first-access-guide-bubble-' + coords.placement,
      ].join(' ')}
      style={{
        top: coords.placement === 'bottom' ? coords.top : undefined,
        bottom: coords.placement === 'top' ? coords.viewportHeight - coords.top : undefined,
        left: coords.left,
        '--guide-arrow-left': `${coords.arrowLeft}px`,
        width: coords.width,
        zIndex: 9000,
      } as CSSProperties}
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
  );

  if (!floating) {
    // Compatibilidade com os poucos usos não-floating: renderiza inline, sem portal.
    return (
      <div className={['first-access-guide-wrap flex w-full', align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start', className].join(' ')}>
        <div className="first-access-guide-bubble pointer-events-auto relative flex max-w-md items-start gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm leading-6 text-slate-800 shadow-lg shadow-cyan-900/10 dark:border-cyan-700/70 dark:bg-cyan-950 dark:text-cyan-50 dark:shadow-black/20">
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

  return (
    <span ref={anchorRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {bubble && createPortal(bubble, document.body)}
    </span>
  );
}
