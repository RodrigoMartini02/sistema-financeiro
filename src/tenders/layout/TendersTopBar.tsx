import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { quickSearchPath } from '../utils/navigation';
import { NotificationsBell } from './NotificationsBell';
import { TendersUserMenu } from './TendersUserMenu';

// Barra superior do módulo (escopo, seção 9.3): título da página, busca
// rápida (atalho "/"), tema, sino com o painel das notificações e menu do usuário.

interface TendersTopBarProps {
  title: string;
  unreadCount: number;
  userName: string;
  accountName: string;
  onOpenMenu: () => void;
}

const iconButton =
  'flex h-11 w-11 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] transition hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0EC4D8] lg:h-9 lg:w-9';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function TendersTopBar({ title, unreadCount, userName, accountName, onOpenMenu }: TendersTopBarProps) {
  const { theme, toggleTheme } = useAppContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Atalho "/": foca a busca rápida (fora de campos de texto); no celular, sem o campo, abre Buscar.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      event.preventDefault();
      const input = searchRef.current;
      if (input && input.offsetParent !== null) {
        input.focus();
        return;
      }
      navigate('/buscar');
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const path = quickSearchPath(query);
    if (!path) return;
    navigate(path);
    setQuery('');
    searchRef.current?.blur();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[rgba(14,196,216,0.18)] bg-[#0D2E3C]/95 backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <button type="button" onClick={onOpenMenu} aria-label="Abrir menu" className={`${iconButton} md:hidden`}>
          <Menu size={18} aria-hidden="true" />
        </button>

        <h1 className="min-w-0 truncate text-sm font-semibold text-[#E8F4F5]">{title}</h1>

        <div className="flex-1" />

        <form role="search" onSubmit={submitSearch} className="hidden w-full max-w-xs items-center sm:flex">
          <label className="relative flex w-full items-center">
            <span className="sr-only">Buscar editais</span>
            <Search size={15} className="pointer-events-none absolute left-3 text-[rgba(14,196,216,0.55)]" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar editais"
              aria-keyshortcuts="/"
              className="h-9 w-full rounded-lg border border-[rgba(14,196,216,0.25)] bg-[rgba(4,14,18,0.35)] pl-9 pr-8 text-sm text-[#E8F4F5] placeholder:text-[rgba(232,244,245,0.45)] focus:border-[#0EC4D8] focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2 rounded border border-[rgba(14,196,216,0.3)] px-1.5 text-[10px] text-[rgba(14,196,216,0.6)]">
              /
            </kbd>
          </label>
        </form>

        <button type="button" onClick={() => navigate('/buscar')} aria-label="Buscar editais" className={`${iconButton} sm:hidden`}>
          <Search size={17} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
          className={iconButton}
        >
          {theme === 'light' ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
        </button>

        <NotificationsBell unreadCount={unreadCount} buttonClassName={iconButton} />

        <span className="h-6 w-px shrink-0 bg-[rgba(14,196,216,0.15)]" aria-hidden="true" />

        <TendersUserMenu userName={userName} accountName={accountName} />
      </div>
    </header>
  );
}
