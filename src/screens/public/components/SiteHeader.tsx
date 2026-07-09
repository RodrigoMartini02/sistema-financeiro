import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

interface SiteHeaderProps {
  onOpenLogin: () => void;
}

const NAV = [
  { label: 'Funcionalidades', to: '/funcionalidades' },
  { label: 'Planos', to: '/planos' },
  { label: 'Sobre', to: '/sobre' },
  { label: 'Contato', to: '/contato' },
];

export function SiteHeader({ onOpenLogin }: SiteHeaderProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(14,196,216,0.12)] bg-[#040E12]/90 backdrop-blur-lg overflow-visible">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between px-5 sm:px-8 xl:px-10">

        <Link to="/" className="flex items-center gap-3">
          <img src="/icons/logo.png" alt="FINGERENCE" className="h-24 w-24 object-contain -my-4" />
          <div>
            <p
              className="leading-none tracking-[0.22em] text-site-text"
              style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, fontStyle: 'italic' }}
            >
              FINGERENCE
            </p>
            <p className="mt-0.5 text-[10px] font-medium leading-none text-site-textMuted">
              Sistema financeiro
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className={`text-[12px] uppercase tracking-[0.18em] transition duration-300 ${
                pathname === to
                  ? 'text-site-text'
                  : 'text-site-textMuted hover:text-site-text'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenLogin}
            className="hidden h-9 items-center rounded-xl border border-[rgba(14,196,216,0.30)] px-5 text-[11px] uppercase tracking-[0.14em] text-site-text transition duration-300 hover:border-site-accent hover:bg-[rgba(14,196,216,0.06)] hover:shadow-[0_0_20px_rgba(14,196,216,0.14)] md:inline-flex"
          >
            Entrar
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(14,196,216,0.18)] text-site-textMuted transition hover:border-site-accent hover:text-site-text md:hidden"
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-[rgba(14,196,216,0.10)] bg-[#040E12] px-5 pb-4 pt-3 md:hidden">
          {NAV.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className="block py-2.5 text-[12px] uppercase tracking-[0.18em] text-site-textSub"
            >
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => { setMenuOpen(false); onOpenLogin(); }}
            className="mt-3 w-full rounded-xl border border-[rgba(14,196,216,0.30)] py-2.5 text-[11px] uppercase tracking-[0.14em] text-site-text"
          >
            Entrar
          </button>
        </div>
      )}
    </header>
  );
}
