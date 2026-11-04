import { useEffect, useRef, useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, History, KeyRound, LayoutDashboard, MoreVertical, Plus, UserRound,
} from 'lucide-react';
import { Z_DROPDOWN } from '../../ui/zIndex';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { formatDocumento } from '../../utils/document';
import { ChangePasswordModal } from './ChangePasswordModal';
import type { AssistantFontSize } from './fontSize';

const FONT_SIZE_OPTIONS: Array<{ value: AssistantFontSize; label: string }> = [
  { value: 'small', label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large', label: 'Grande' },
];

type MenuScreen = 'main' | 'font-size' | 'switch-account';

interface AssistantHeaderMenuProps {
  onOpenHistory: () => void;
  onNewConversation: () => void;
  onOpenDashboard?: () => void;
  fontSize: AssistantFontSize;
  onFontSizeChange: (value: AssistantFontSize) => void;
}

export function AssistantHeaderMenu({
  onOpenHistory, onNewConversation, onOpenDashboard, fontSize, onFontSizeChange,
}: AssistantHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<MenuScreen>('main');
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { contas, activeId, select: selectAccount } = useActiveAccount();

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    setScreen('main');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Mais opções"
        title="Mais opções"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cyan-100/75 transition hover:bg-white/10 hover:text-white"
      >
        <MoreVertical size={18} />
      </button>

      {open && (
        <div className={['absolute right-0 top-full mt-1 min-w-[240px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800', Z_DROPDOWN].join(' ')}>
          {screen === 'main' && (
            <div className="py-1.5">
              <button
                type="button"
                onClick={() => { closeMenu(); onOpenHistory(); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <History size={17} className="shrink-0 text-slate-400 dark:text-slate-500" />
                Conversas anteriores
              </button>
              <button
                type="button"
                onClick={() => { closeMenu(); onNewConversation(); }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus size={17} className="shrink-0 text-slate-400 dark:text-slate-500" />
                Nova conversa
              </button>
              {onOpenDashboard && (
                <button
                  type="button"
                  onClick={() => { closeMenu(); onOpenDashboard(); }}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <LayoutDashboard size={17} className="shrink-0 text-slate-400 dark:text-slate-500" />
                  Abrir painel financeiro
                </button>
              )}
              {contas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setScreen('switch-account')}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-5 py-3.5 text-left text-[15px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <UserRound size={17} className="shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="flex-1">Alterar conta</span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400" />
                </button>
              )}
              <button
                type="button"
                onClick={() => { closeMenu(); setChangePasswordOpen(true); }}
                className="flex w-full items-center gap-3 border-t border-slate-100 px-5 py-3.5 text-left text-[15px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <KeyRound size={17} className="shrink-0 text-slate-400 dark:text-slate-500" />
                Redefinir senha
              </button>
              <button
                type="button"
                onClick={() => setScreen('font-size')}
                className="flex w-full items-center gap-3 border-t border-slate-100 px-5 py-3.5 text-left text-[15px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span className="flex-1">Tamanho da letra</span>
                <ChevronRight size={16} className="shrink-0 text-slate-400" />
              </button>
            </div>
          )}

          {screen === 'switch-account' && (
            <div className="py-1.5">
              <button
                type="button"
                onClick={() => setScreen('main')}
                className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-3 text-left text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ChevronLeft size={18} className="shrink-0" />
                Alterar conta
              </button>
              {contas.map((c) => {
                const isActive = String(c.id) === activeId;
                const documento = c.documento ? formatDocumento(c.documento, c.tipo) : null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { selectAccount(c); closeMenu(); }}
                    className={[
                      'flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] transition',
                      isActive
                        ? 'font-semibold text-[#0891b2] dark:text-cyan-300'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700',
                    ].join(' ')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{c.nome}</p>
                      {documento && (
                        <p className="truncate text-xs font-normal text-slate-400 dark:text-slate-500">{documento}</p>
                      )}
                    </div>
                    {isActive && <Check size={16} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {screen === 'font-size' && (
            <div className="py-1.5">
              <button
                type="button"
                onClick={() => setScreen('main')}
                className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-3 text-left text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ChevronLeft size={18} className="shrink-0" />
                Tamanho da letra
              </button>
              {FONT_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { onFontSizeChange(option.value); closeMenu(); }}
                  className={[
                    'flex w-full items-center px-5 py-3 text-left text-[15px] transition',
                    fontSize === option.value
                      ? 'font-semibold text-[#0891b2] dark:text-cyan-300'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </div>
  );
}
