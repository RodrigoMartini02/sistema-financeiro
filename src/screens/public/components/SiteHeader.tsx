import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { COMPANY_NAME, SOLUTION_NAMES, type SiteSolution } from '../../../brand';
import { isProductsArea, PRODUCTS_PATH, publicPageFor } from '../../../utils/publicPages';
import { usePublicSite } from './publicSiteContext';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SITE_CONTAINER } from './siteStyles';

const NAV_LINKS = [
  { label: 'Início', to: '/' },
  { label: 'Produtos', to: PRODUCTS_PATH },
  { label: 'Sobre', to: '/sobre/' },
  { label: 'Contato', to: '/contato/' },
];

const FOCUSABLE = 'a[href], button:not([disabled])';

interface SiteHeaderProps {
  /**
   * Solução da página aberta: "Entrar" e "Começar grátis" dela. As páginas da
   * empresa (sem solução) não têm atalho de login: entra-se pela página da solução.
   */
  pageSolution: SiteSolution | null;
}

export function SiteHeader({ pageSolution }: SiteHeaderProps) {
  const { pathname } = useLocation();
  const { enter, startFree } = usePublicSite();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const currentPath = publicPageFor(pathname).path;
  const inProducts = isProductsArea(pathname);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Menu do celular: foco preso no painel enquanto aberto; Esc fecha.
  useEffect(() => {
    if (!menuOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      menuPanelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !menuPanelRef.current) return;

      const focusable = Array.from(menuPanelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

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

  const isActive = (to: string) => (to === PRODUCTS_PATH ? inProducts : currentPath === to);
  const navLinkClass = (to: string) =>
    [
      'rounded-lg px-1 py-2 text-[15px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400 motion-reduce:transition-none',
      isActive(to) ? 'text-brand-700' : 'text-slate-600 hover:text-slate-950',
    ].join(' ');

  return (
    <header className="sticky inset-x-0 top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:border focus:border-site-accent focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:text-slate-950"
      >
        Pular para o conteúdo
      </a>

      <div className={`${SITE_CONTAINER} flex h-[72px] items-center justify-between gap-5`}>
        <Link
          to="/"
          className="flex min-w-0 items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-4"
          aria-label={`${COMPANY_NAME}: página inicial`}
        >
          <img src="/icons/fingerence-logo.webp" alt="" width={48} height={48} className="h-11 w-11 shrink-0 object-contain" />
          <span
            className="block truncate text-[14px] font-semibold uppercase leading-none tracking-[0.22em] text-slate-950"
            style={{ fontFamily: "'Cinzel', serif", fontStyle: 'italic' }}
          >
            {COMPANY_NAME}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Navegação principal">
          {NAV_LINKS.map(({ label, to }) => (
            <Link key={to} to={to} className={navLinkClass(to)} aria-current={isActive(to) ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          {pageSolution && (
            <>
              <button
                type="button"
                onClick={() => enter(pageSolution)}
                aria-label={`Entrar no ${SOLUTION_NAMES[pageSolution]}`}
                className="site-neon-light-text-button rounded-lg px-2 py-2 text-[15px] font-medium text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Entrar
              </button>
              <button type="button" onClick={() => startFree(pageSolution)} className={`${PRIMARY_BUTTON} min-h-11 px-5`}>
                Começar grátis
              </button>
            </>
          )}
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="site-neon-light-icon-button flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white lg:hidden"
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
          className="max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-slate-200 bg-white px-5 py-5 shadow-[0_28px_80px_rgba(15,23,42,0.14)] lg:hidden"
        >
          <nav className="grid gap-1" aria-label="Navegação principal no celular">
            {NAV_LINKS.map(({ label, to }) => (
              <Link
                key={to}
                to={to}
                aria-current={isActive(to) ? 'page' : undefined}
                className={[
                  'min-h-11 rounded-xl px-3 py-3 text-[15px] font-medium outline-none transition hover:bg-[#f1f9fa] focus-visible:ring-2 focus-visible:ring-brand-400 motion-reduce:transition-none',
                  isActive(to) ? 'text-brand-700' : 'text-slate-700',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </nav>
          {pageSolution && (
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => startFree(pageSolution)} className={PRIMARY_BUTTON}>
                Começar grátis
              </button>
              <button
                type="button"
                onClick={() => enter(pageSolution)}
                aria-label={`Entrar no ${SOLUTION_NAMES[pageSolution]}`}
                className={SECONDARY_BUTTON}
              >
                Entrar
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
