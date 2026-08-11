import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

interface SiteHeaderProps {
  onOpenLogin: () => void;
  tone?: 'dark' | 'light';
}

const NAV = [
  { label: 'Home', to: '/' },
  { label: 'Funcionalidades', to: '/funcionalidades/' },
  { label: 'Planos', to: '/planos/' },
  { label: 'Sobre', to: '/sobre/' },
  { label: 'Contato', to: '/contato/' },
];

export function SiteHeader({ onOpenLogin, tone = 'dark' }: SiteHeaderProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const isLight = tone === 'light';

  useEffect(() => {
    if (!menuOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = menuPanelRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])');
      firstFocusable?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab' || !menuPanelRef.current) return;

      const focusable = Array.from(
        menuPanelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const openLogin = () => {
    closeMenu();
    onOpenLogin();
  };

  const normalizePath = (value: string) => (value !== '/' && value.endsWith('/') ? value.slice(0, -1) : value);
  const isActive = (to: string) => normalizePath(pathname) === normalizePath(to);
  const focusOffsetClass = isLight ? 'focus-visible:ring-offset-white' : 'focus-visible:ring-offset-[#03161D]';

  return (
    <header className={[
      'sticky inset-x-0 top-0 z-50 border-b backdrop-blur-xl',
      isLight
        ? 'border-slate-200/80 bg-white/90 shadow-[0_8px_28px_rgba(15,23,42,0.04)]'
        : 'border-[rgba(30,196,220,0.12)] bg-[#03161D]/88',
    ].join(' ')}>
      <a
        href="#conteudo-principal"
        className={[
          'sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:border focus:border-site-accent focus:px-4 focus:py-3 focus:text-sm',
          isLight ? 'focus:bg-white focus:text-slate-950' : 'focus:bg-[#06232C] focus:text-site-text',
        ].join(' ')}
      >
        Pular para o conteúdo
      </a>

      <div className="mx-auto flex h-[76px] max-w-[1760px] items-center justify-between gap-5 px-5 sm:px-8 xl:px-10">
        <Link
          to="/"
          className={[
            'flex min-w-0 items-center gap-4 rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-site-accent/70 focus-visible:ring-offset-4 motion-reduce:transition-none',
            focusOffsetClass,
          ].join(' ')}
          aria-label="Ir para a Home do FINGERENCE"
        >
          <img
            src="/icons/logo.png"
            alt="FINGERENCE"
            width={72}
            height={72}
            className="h-[52px] w-[52px] shrink-0 object-contain sm:h-[60px] sm:w-[60px]"
          />
          <span className="min-w-0">
            <span
              className={[
                'block truncate text-[14px] font-semibold uppercase leading-none tracking-[0.22em]',
                isLight ? 'text-slate-950' : 'text-site-text',
              ].join(' ')}
              style={{ fontFamily: "'Cinzel', serif", fontStyle: 'italic' }}
            >
              FINGERENCE
            </span>
            <span className={['mt-1.5 block text-[11px] leading-none', isLight ? 'text-slate-500' : 'text-site-textSub'].join(' ')}>Sistema financeiro</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-9 lg:flex" aria-label="Navegação principal">
          {NAV.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className={[
                'rounded-lg px-1 py-2 text-[15px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-site-accent/70 focus-visible:ring-offset-4 motion-reduce:transition-none',
                focusOffsetClass,
                isActive(to)
                  ? isLight ? 'text-brand-700' : 'text-site-text'
                  : isLight ? 'text-slate-600 hover:text-slate-950' : 'text-site-textSub hover:text-site-text',
              ].join(' ')}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <button
            type="button"
            onClick={openLogin}
            className={[
              isLight ? 'site-neon-light-text-button text-slate-600' : 'site-neon-text-button text-site-textSub',
              'rounded-lg px-2 py-2 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-site-accent/70 focus-visible:ring-offset-4',
              focusOffsetClass,
            ].join(' ')}
          >
            Entrar
          </button>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className={[
            isLight ? 'site-neon-light-icon-button border-slate-200 bg-white' : 'site-neon-icon-button',
            'flex h-11 w-11 items-center justify-center rounded-xl border lg:hidden',
          ].join(' ')}
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-controls="site-mobile-menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {menuOpen && (
        <div
          id="site-mobile-menu"
          ref={menuPanelRef}
          role="dialog"
          aria-label="Menu principal"
          className={[
            'border-t px-5 py-5 lg:hidden',
            isLight
              ? 'border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.14)]'
              : 'border-[rgba(30,196,220,0.12)] bg-[#03161D] shadow-[0_28px_80px_rgba(0,0,0,0.45)]',
          ].join(' ')}
        >
          <nav className="grid gap-1" aria-label="Navegação principal móvel">
            {NAV.map(({ label, to }) => (
              <Link
                key={to}
                to={to}
                onClick={closeMenu}
                className={[
                  'min-h-11 rounded-xl px-3 py-3 text-[14px] font-medium outline-none transition hover:bg-[rgba(14,196,216,0.08)] focus-visible:ring-2 focus-visible:ring-site-accent/70 motion-reduce:transition-none',
                  isActive(to)
                    ? isLight ? 'text-brand-700' : 'text-site-text'
                    : isLight ? 'text-slate-600 hover:text-slate-950' : 'text-site-textSub hover:text-site-text',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid gap-3">
            <button
              type="button"
              onClick={openLogin}
              className={[
                isLight ? 'site-neon-light-button-subtle' : 'site-neon-button site-neon-button-subtle',
                'min-h-11 rounded-xl border px-5 text-[13px] font-semibold',
              ].join(' ')}
            >
              Entrar
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
