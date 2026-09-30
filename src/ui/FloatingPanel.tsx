import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type ReactNode, type RefObject,
} from 'react';

const WIDE_SCREEN_QUERY = '(min-width: 1024px)';
const ANCHOR_GAP = 6;
const VIEWPORT_EDGE = 8;

function subscribeToScreenWidth(notify: () => void) {
  const query = window.matchMedia(WIDE_SCREEN_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}

/** true a partir de 1024px, onde os painéis abrem junto do campo. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribeToScreenWidth, () => window.matchMedia(WIDE_SCREEN_QUERY).matches, () => true);
}

interface AnchoredPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface FloatingPanelProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Nome do painel para leitores de tela. */
  label: string;
  children: ReactNode;
  /** Largura fixa no desktop. Sem ela, a do campo (nunca menor que `minWidth`). */
  width?: number;
  minWidth?: number;
  /** Alinha pela esquerda (padrão) ou pela direita do campo. */
  align?: 'start' | 'end';
  padding?: number;
  /** Abaixo de 1024px vira painel inferior. O autocomplete desliga isso para não cobrir o campo em que se digita. */
  sheetOnSmallScreens?: boolean;
  /** Não tira o foco do campo ao clicar num item (autocomplete). */
  keepAnchorFocus?: boolean;
}

/**
 * Painel flutuante dos seletores (popover). Fica em posição fixa, abaixo do campo
 * ou acima dele quando falta espaço, e por isso não é cortado pelo corpo
 * rolável do modal. Fecha ao clicar fora e ao rolar a página.
 *
 * O Esc é tratado aqui antes de chegar ao modal: fecha só o painel, e o modal
 * fecha num segundo Esc. Um campo dentro do painel que trate o próprio Esc
 * chama preventDefault e o painel continua aberto.
 */
export function FloatingPanel({
  open, anchorRef, onClose, label, children, width, minWidth = 0, align = 'start', padding = 12,
  sheetOnSmallScreens = true, keepAnchorFocus = false,
}: FloatingPanelProps) {
  const wideScreen = useWideScreen();
  const asSheet = sheetOnSmallScreens && !wideScreen;
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<AnchoredPosition | null>(null);

  const closeAndReturnFocus = useCallback(() => {
    onClose();
    anchorRef.current?.focus();
  }, [onClose, anchorRef]);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const panelWidth = Math.min(width ?? Math.max(rect.width, minWidth), window.innerWidth - VIEWPORT_EDGE * 2);
    const spaceBelow = window.innerHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_EDGE;
    const spaceAbove = rect.top - ANCHOR_GAP - VIEWPORT_EDGE;
    const openAbove = panel.scrollHeight > spaceBelow && spaceAbove > spaceBelow;
    const preferredLeft = align === 'end' ? rect.right - panelWidth : rect.left;
    const left = Math.max(VIEWPORT_EDGE, Math.min(preferredLeft, window.innerWidth - panelWidth - VIEWPORT_EDGE));
    setPosition(openAbove
      ? { bottom: window.innerHeight - rect.top + ANCHOR_GAP, left, width: panelWidth, maxHeight: spaceAbove }
      : { top: rect.bottom + ANCHOR_GAP, left, width: panelWidth, maxHeight: spaceBelow });
  }, [anchorRef, width, minWidth, align]);

  useLayoutEffect(() => {
    if (!open || asSheet) {
      setPosition(null);
      return;
    }
    place();
  }, [open, asSheet, place]);

  useEffect(() => {
    if (!open) return;
    const isInsidePanel = (target: EventTarget | null) => target instanceof Node && !!panelRef.current?.contains(target);

    // Esc com o foco fora do painel (no campo que o abriu, por exemplo).
    // Dentro do painel quem trata é o onKeyDown abaixo, depois dos campos.
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || isInsidePanel(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      closeAndReturnFocus();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    if (asSheet) {
      return () => document.removeEventListener('keydown', handleKeyDown, true);
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (isInsidePanel(event.target)) return;
      if (event.target instanceof Node && anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    const handleScroll = (event: Event) => {
      if (!isInsidePanel(event.target)) onClose();
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, asSheet, onClose, closeAndReturnFocus, anchorRef, place]);

  if (!open) return null;

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    closeAndReturnFocus();
  };

  if (asSheet) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-slate-950/30" onClick={onClose} aria-hidden="true" />
        <div
          ref={panelRef}
          data-floating-panel=""
          role="dialog"
          aria-label={label}
          onKeyDown={handlePanelKeyDown}
          className="fixed inset-x-0 bottom-0 z-40 flex max-h-[80vh] flex-col gap-2.5 overflow-y-auto rounded-t-2xl bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.18)]"
          style={{ padding, paddingBottom: `calc(${padding}px + env(safe-area-inset-bottom, 0px))` }}
        >
          <div className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-slate-200" aria-hidden="true" />
          {children}
        </div>
      </>
    );
  }

  return (
    <div
      ref={panelRef}
      data-floating-panel=""
      role="dialog"
      aria-label={label}
      onKeyDown={handlePanelKeyDown}
      onMouseDown={keepAnchorFocus ? (event) => event.preventDefault() : undefined}
      className="fixed z-40 flex flex-col gap-2.5 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(20,22,30,0.16)]"
      style={position ? {
        padding,
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
      } : {
        // Primeira montagem, transparente (e não oculta, para o autoFocus dos campos
        // funcionar): só mede a altura antes de decidir se abre para cima.
        padding, top: 0, left: 0, width, opacity: 0,
      }}
    >
      {children}
    </div>
  );
}
