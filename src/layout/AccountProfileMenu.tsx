import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LogOut } from 'lucide-react';
import type { AuthUser } from '../types/auth';
import type { Perfil } from '../types/config';
import { logout } from '../services/session';
import { useActiveProfile } from '../hooks/useActiveProfile';
import { formatDocumento } from '../utils/document';
import { Z_DROPDOWN } from '../ui/zIndex';

function getInitials(nome: string): string {
  const words = nome.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'U';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface AccountProfileMenuProps {
  user?: AuthUser;
  isDemoMode?: boolean;
}

export function AccountProfileMenu({ user, isDemoMode = false }: AccountProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loggingOut, setLoggingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const { perfis: data, activeId, activePerfil, select: selectProfile } = useActiveProfile({ enabled: !isDemoMode });

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (activeIndex >= 0) itemRefs.current[activeIndex]?.focus();
  }, [activeIndex]);

  if (isDemoMode) {
    return (
      <div className="flex h-[46px] items-center gap-2.5 rounded-xl px-3 pl-1.5 opacity-90">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#0EC4D8] text-[12px] font-bold text-[#04222b]">
          {getInitials(user?.nome ?? user?.name ?? 'Usuário')}
        </div>
        <div className="hidden min-w-0 flex-col items-start max-[480px]:hidden sm:flex">
          <span className="max-w-[200px] truncate text-[12.5px] font-bold text-[#E8F4F5]">Demonstração</span>
          <span className="truncate text-[10.5px] font-medium text-[rgba(14,196,216,0.55)]">
            {user?.nome ?? user?.name ?? 'Usuário'}
          </span>
        </div>
        <ChevronDown size={14} className="text-[rgba(14,196,216,0.4)]" />
      </div>
    );
  }

  const select = (p: Perfil) => {
    selectProfile(p);
    setOpen(false);
  };

  const handleLogout = () => {
    setLoggingOut(true);
    logout();
    window.location.replace('/index.html');
  };

  const menuItems: Array<{ onSelect: () => void }> = [
    ...(data.length > 1 ? data.map((p) => ({ onSelect: () => select(p) })) : []),
    { onSelect: handleLogout },
  ];

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(0);
    }
  };

  const handleItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((index + 1) % menuItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((index - 1 + menuItems.length) % menuItems.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      menuItems[index]?.onSelect();
    }
  };

  const userInitial = getInitials(user?.nome ?? user?.name ?? 'Usuário');
  const userName = user?.nome ?? user?.name ?? 'Usuário';

  return (
    <>
      {loggingOut && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#040E12]/80 backdrop-blur-sm">
          <p className="text-sm font-semibold text-[#E8F4F5]">Encerrando a sessão…</p>
        </div>
      )}
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            setActiveIndex(-1);
          }}
          onKeyDown={handleTriggerKeyDown}
          className={[
            'flex h-[46px] items-center gap-2.5 rounded-xl border pl-1.5 pr-3 transition',
            open
              ? 'border-[rgba(14,196,216,0.3)] bg-[rgba(14,196,216,0.12)]'
              : 'border-transparent bg-transparent hover:bg-[rgba(14,196,216,0.12)]',
          ].join(' ')}
        >
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#0EC4D8] text-[12px] font-bold text-[#04222b]">
            {activePerfil ? getInitials(activePerfil.nome) : userInitial}
          </div>
          <div className="hidden min-w-0 flex-col items-start max-[480px]:hidden sm:flex">
            <span className="max-w-[200px] truncate text-[12.5px] font-bold text-[#E8F4F5]">
              {activePerfil?.nome ?? userName}
            </span>
            <span className="whitespace-nowrap text-[10.5px] font-medium text-[rgba(14,196,216,0.55)]">
              {userName}
            </span>
          </div>
          <ChevronDown
            size={14}
            className={`shrink-0 text-[rgba(14,196,216,0.7)] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div
            role="menu"
            className={[
              'motion-safe:animate-[account-menu-in_130ms_ease] absolute right-0 top-[60px] w-[296px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[14px] border border-[rgba(14,196,216,0.22)] bg-[#0A2530] shadow-[0_26px_64px_rgba(2,12,17,0.6)]',
              Z_DROPDOWN,
            ].join(' ')}
          >
            {data.length > 1 && (
              <div>
                <p className="px-[14px] pb-[7px] pt-[13px] text-[10px] font-bold uppercase tracking-[0.12em] text-[rgba(14,196,216,0.4)]">
                  Trocar perfil
                </p>
                {data.map((p, i) => {
                  const isActive = String(p.id) === activeId;
                  const documento = p.documento ? formatDocumento(p.documento, p.tipo) : null;
                  return (
                    <button
                      key={p.id}
                      ref={(el) => { itemRefs.current[i] = el; }}
                      role="menuitem"
                      type="button"
                      onClick={() => select(p)}
                      onKeyDown={(e) => handleItemKeyDown(e, i)}
                      className={[
                        'flex min-h-[44px] w-full items-center gap-2.5 px-[14px] py-2 text-left transition',
                        isActive ? 'bg-[rgba(14,196,216,0.10)]' : 'hover:bg-[rgba(14,196,216,0.09)]',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold',
                          isActive ? 'bg-[#0EC4D8] text-[#04222b]' : 'bg-[rgba(14,196,216,0.14)] text-[rgba(14,196,216,0.8)]',
                        ].join(' ')}
                      >
                        {getInitials(p.nome)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={[
                          'truncate text-[12.5px] font-semibold',
                          isActive ? 'text-[#0EC4D8]' : 'text-[#E8F4F5]',
                        ].join(' ')}>
                          {p.nome}
                        </p>
                        {documento && (
                          <p className="truncate text-[10px] text-[rgba(14,196,216,0.45)]">{documento}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full border border-[rgba(14,196,216,0.2)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[rgba(14,196,216,0.7)]">
                        {p.tipo === 'empresa' ? 'PJ' : 'PF'}
                      </span>
                      <span className="flex w-[15px] shrink-0 justify-center">
                        {isActive && <Check size={15} className="text-[#0EC4D8]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="border-t border-[rgba(14,196,216,0.12)] px-[14px] pb-[9px] pt-[11px]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0EC4D8] text-[12px] font-bold text-[#04222b]">
                  {userInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-[#E8F4F5]">{userName}</p>
                  <p className="truncate text-[10.5px] text-[rgba(14,196,216,0.5)]">{user?.email ?? 'Sessão ativa'}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-[rgba(14,196,216,0.12)] p-1.5">
              <button
                ref={(el) => { itemRefs.current[menuItems.length - 1] = el; }}
                role="menuitem"
                type="button"
                onClick={handleLogout}
                onKeyDown={(e) => handleItemKeyDown(e, menuItems.length - 1)}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] font-semibold text-[#f87171] transition hover:bg-[rgba(239,68,68,0.12)]"
              >
                <LogOut size={16} className="shrink-0" />
                <span className="flex-1 text-left">Sair</span>
                <span className="shrink-0 text-[10px] font-semibold text-[rgba(248,113,113,0.5)]">⇧Q</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
