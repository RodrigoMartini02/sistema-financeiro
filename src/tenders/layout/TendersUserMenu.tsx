import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronDown, LogOut } from 'lucide-react';
import { logout } from '../../services/session';
import { Z_DROPDOWN } from '../../ui/zIndex';
import { TENDERS_APP_BASE } from '../utils/modulePaths';

// Menu do usuário: nome e conta, troca de módulo (só para quem também usa o
// app de finanças) e sair.

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'U';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
}

interface TendersUserMenuProps {
  userName: string;
  accountName: string;
  showFinanceLink: boolean;
}

export function TendersUserMenu({ userName, accountName, showFinanceLink }: TendersUserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const signOut = () => {
    logout();
    window.location.replace(TENDERS_APP_BASE);
  };

  const itemClass =
    'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu de ${userName}`}
        className="flex h-11 items-center gap-2.5 rounded-xl px-2 transition hover:bg-[rgba(14,196,216,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0EC4D8]"
      >
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#0EC4D8] text-[12px] font-bold text-[#04222b]">
          {initials(userName)}
        </span>
        <span className="hidden min-w-0 flex-col items-start sm:flex">
          <span className="max-w-[180px] truncate text-[12.5px] font-bold text-[#E8F4F5]">{userName}</span>
          <span className="max-w-[180px] truncate text-[10.5px] font-medium text-[rgba(14,196,216,0.55)]">{accountName}</span>
        </span>
        <ChevronDown size={14} className="text-[rgba(14,196,216,0.4)]" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${Z_DROPDOWN}`}
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{userName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{accountName}</p>
          </div>
          {showFinanceLink && (
            <a role="menuitem" href="/app.html" className={itemClass}>
              <ArrowLeftRight size={16} aria-hidden="true" />
              Controle financeiro
            </a>
          )}
          <button role="menuitem" type="button" onClick={signOut} className={itemClass}>
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
