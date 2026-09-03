import { type ReactNode, useEffect, useState } from 'react';
import {
  BarChart3, Bell, Building2, FileText, LayoutDashboard,
  Moon, Settings, Sun, TrendingDown, Wallet, X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '../types/auth';
import { apiRequest, getActiveAccountId } from '../services/apiClient';
import { useAppContext } from '../context/AppContext';
import { Z_MOBILE_NAV_OVERLAY, Z_SYSTEM_OVERLAY } from '../ui/zIndex';
import { FinancialAssistant } from '../components/financial-assistant/FinancialAssistant';
import { AccountMenu } from './AccountMenu';
import { ConfigPanel, type ConfigItemId } from './ConfigPanel';

export type AppSection =
  | 'painel' | 'movimentacoes' | 'reservas'
  | 'relatorios' | 'planos' | 'clientes';

interface AppShellProps {
  user?: AuthUser;
  children: ReactNode;
  activeSection?: AppSection;
  onNavigate?: (section: AppSection) => void;
  // Pulso externo para abrir o drawer de Configurações num item específico (ex.: a partir
  // do checklist de onboarding). Incrementar `token` a cada disparo reabre mesmo se `item`
  // não mudar entre um clique e outro.
  openConfigRequest?: { token: number; item: ConfigItemId };
  // Faz o <main> ocupar exatamente a altura restante da viewport (sem scroll
  // de página), com o próprio conteúdo controlando seu scroll interno.
  // Usado por telas que precisam caber inteiras na tela, como o calendário.
  fillViewport?: boolean;
  // Renderizado dentro da seção de demonstração pública: desabilita logout real,
  // notificações reais, troca de conta e o assistente financeiro (fora do escopo
  // da demonstração), mantendo a mesma moldura visual do app real.
  isDemoMode?: boolean;
}

const NAV_GROUPS: { label: string; items: { label: string; icon: React.ElementType; section: AppSection }[] }[] = [
  {
    label: 'Finanças',
    items: [
      { label: 'Painel',    icon: LayoutDashboard, section: 'painel' },
      { label: 'Movimenta\u00e7\u00f5es', icon: Wallet, section: 'movimentacoes' },
    ],
  },
  {
    label: 'Análise',
    items: [
      { label: 'Relatórios', icon: BarChart3, section: 'relatorios' },
      { label: 'Planos',     icon: FileText,  section: 'planos' },
    ],
  },
  {
    label: 'Consultoria',
    items: [
      { label: 'Clientes', icon: Building2, section: 'clientes' },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const { data = [], isLoading } = useQuery({
    queryKey: ['notif-despesas', month, year],
    queryFn: async () => {
      const params = new URLSearchParams({ mes: String(month), ano: String(year) });
      const accountId = getActiveAccountId();
      if (accountId) params.set('conta_id', String(accountId));
      return apiRequest<Array<{
        id: number; descricao: string; valor_final: number;
        categoria_nome?: string; forma_pagamento?: string;
      }>>('/despesas?' + params);
    },
    staleTime: 60_000,
  });

  const total = data.reduce((s, d) => s + Number(d.valor_final), 0);
  const recentes = data.slice(0, 12);

  return (
    <>
      <div className={['fixed inset-0 bg-slate-950/15 backdrop-blur-[1px]', Z_SYSTEM_OVERLAY].join(' ')} onClick={onClose} />
      <aside
        className={['fixed inset-y-0 right-0 flex w-[min(100vw,410px)] flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/25 dark:border-slate-800 dark:bg-slate-950', Z_SYSTEM_OVERLAY].join(' ')}
        role="dialog"
        aria-label={'Notifica\u00e7\u00f5es'}
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 dark:border-slate-800">
          <div>
            <p className="text-base font-bold text-slate-950 dark:text-white">{'Notifica\u00e7\u00f5es'}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{'Resumo do m\u00eas selecionado'}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-white"
            aria-label={'Fechar notifica\u00e7\u00f5es'}
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              {'Carregando notifica\u00e7\u00f5es...'}
            </div>
          ) : data.length === 0 ? (
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 py-10 text-center text-sm text-slate-600 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100">
              <Bell size={30} className="mx-auto mb-3 text-cyan-500" />
              {'Sem despesas neste m\u00eas'}
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 dark:border-rose-900/70 dark:bg-rose-950/40">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                    {data.length} despesa{data.length !== 1 ? 's' : ''} {'no m\u00eas'}
                  </p>
                  <p className="text-sm font-bold text-rose-700 dark:text-rose-200">
                    R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="grid gap-2">
                {recentes.map((d) => (
                  <div key={d.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900">
                      <TrendingDown size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{d.descricao}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {d.categoria_nome ?? 'Sem categoria'} {'\u00b7'} R$ {Number(d.valor_final).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {data.length > recentes.length && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  +{data.length - recentes.length} despesas registradas
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

const CONFIG_ITEM_IDS: ConfigItemId[] = [
  'seguranca', 'contas', 'categorias', 'cartoes', 'servicos',
  'representantes', 'socios', 'usuarios', 'acessos', 'integracoes-ia',
];

function readConfigParam(): ConfigItemId | undefined {
  const value = new URLSearchParams(window.location.search).get('config');
  return CONFIG_ITEM_IDS.includes(value as ConfigItemId) ? (value as ConfigItemId) : undefined;
}

export function AppShell({
  user, children, activeSection = 'painel', onNavigate,
  openConfigRequest, fillViewport = false, isDemoMode = false,
}: AppShellProps) {
  const { theme, toggleTheme } = useAppContext();
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [configPanel, setConfigPanel] = useState<{ open: boolean; item?: ConfigItemId }>(() => {
    const item = isDemoMode ? undefined : readConfigParam();
    return { open: !!item, item };
  });

  const openConfig = (item?: ConfigItemId) => {
    setConfigPanel({ open: true, item });
    setMobileOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('config', item ?? 'contas');
    window.history.pushState({ fingerenceConfig: true }, '', url);
  };

  const closeConfig = () => {
    setConfigPanel({ open: false });
    if (new URLSearchParams(window.location.search).has('config')) {
      window.history.back();
    }
  };

  useEffect(() => {
    if (openConfigRequest) openConfig(openConfigRequest.item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openConfigRequest?.token]);

  useEffect(() => {
    if (isDemoMode) return;
    const handlePopState = () => {
      const item = readConfigParam();
      setConfigPanel({ open: !!item, item });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDemoMode]);

  const currentNav = ALL_NAV.find((n) => n.section === activeSection);
  const sectionLabel = currentNav?.label;

  const sidebar = (
    <div className="flex h-full flex-col bg-[#0D2E3C]">
      {/* Logo */}
      <div className="border-b border-[rgba(14,196,216,0.15)] bg-[#0A2530] px-5 py-5">
        <div className="flex items-center gap-3">
          <img src="/icons/logo.png" alt="FINGERENCE" className="h-12 w-12 shrink-0 object-contain" />
          <div>
            <p className="leading-none tracking-[0.22em] text-[#E8F4F5]" style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, fontStyle: 'italic' }}>FINGERENCE</p>
            <p className="mt-1 text-[10px] font-medium text-[rgba(14,196,216,0.55)]">Sistema financeiro</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-config-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
        <div className="shrink-0 space-y-4">
          {NAV_GROUPS.map((group) => {
            const items = isDemoMode ? group.items.filter((item) => item.section !== 'planos') : group.items;
            if (items.length === 0) return null;
            return (
            <div key={group.label}>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-[rgba(14,196,216,0.38)]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.section;
                  return (
                    <button
                      key={item.section}
                      onClick={() => { onNavigate?.(item.section); setMobileOpen(false); }}
                      className={[
                        'relative flex h-10 w-full items-center gap-3 rounded-lg text-sm font-medium transition',
                        isActive
                          ? 'bg-[rgba(14,196,216,0.10)] text-[#0EC4D8] font-semibold'
                          : 'text-[rgba(14,196,216,0.5)] hover:bg-[rgba(14,196,216,0.06)] hover:text-[#E8F4F5]',
                      ].join(' ')}
                      style={{ paddingLeft: isActive ? '10px' : '12px', paddingRight: '12px' }}
                    >
                      {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[#0EC4D8]" />}
                      <Icon size={17} className={isActive ? 'text-[#0EC4D8]' : ''} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>

        {!isDemoMode && (
        <div className="mt-4 flex flex-col">
          <p className="mb-1 shrink-0 px-3 text-[10px] font-bold uppercase tracking-widest text-[rgba(14,196,216,0.38)]">Sistema</p>
          <button
            onClick={() => openConfig()}
            className="relative flex h-10 w-full shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[rgba(14,196,216,0.5)] transition hover:bg-[rgba(14,196,216,0.06)] hover:text-[#E8F4F5]"
          >
            <Settings size={17} />
            <span className="flex-1 text-left">{'Configura\u00e7\u00f5es'}</span>
          </button>
        </div>
        )}
      </nav>

      {/* App version */}
      <div className="border-t border-[rgba(14,196,216,0.12)] px-4 py-3">
        <p className="text-[10.5px] text-[rgba(14,196,216,0.3)]">FINGERENCE</p>
      </div>
    </div>
  );

  return (
    <div className={isDemoMode
      ? 'relative h-screen overflow-hidden bg-slate-50 dark:bg-slate-900'
      : 'min-h-screen bg-slate-50 dark:bg-slate-900'}>
      {!isDemoMode && notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
      <aside className={['left-0 hidden w-64 border-r border-[rgba(14,196,216,0.18)] lg:flex lg:flex-col shadow-sm', isDemoMode ? 'absolute inset-y-0' : 'fixed inset-y-0'].join(' ')}>
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className={[isDemoMode ? 'absolute inset-0' : 'fixed inset-0', 'lg:hidden', Z_MOBILE_NAV_OVERLAY].join(' ')}>
          <div className="absolute inset-0 bg-[#040E12]/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className={isDemoMode ? 'h-full overflow-y-auto lg:pl-64' : 'lg:pl-64'}>
        <header className="sticky top-0 z-30 border-b border-[rgba(14,196,216,0.18)] bg-[#0D2E3C]/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              className="lg:hidden flex h-11 w-11 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] hover:bg-[rgba(14,196,216,0.08)] transition"
              onClick={() => setMobileOpen(true)}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {sectionLabel && (
              <div className="hidden lg:flex items-center gap-2 border-r border-[rgba(14,196,216,0.15)] pr-4">
                {currentNav && <currentNav.icon size={16} className="text-[#0EC4D8]" />}
                <span className="text-sm font-semibold text-[#E8F4F5]">{sectionLabel}</span>
              </div>
            )}

            <div className="flex-1" />

            {isDemoMode && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F6A623]/40 bg-[#F6A623]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#F6A623]">
                Demonstração
              </span>
            )}

            <button
              onClick={toggleTheme}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition lg:h-8 lg:w-8"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            {!isDemoMode && (
              <div className="relative">
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition lg:h-8 lg:w-8"
                >
                  <Bell size={16} />
                </button>
              </div>
            )}

            <span className="h-6 w-px shrink-0 bg-[rgba(14,196,216,0.15)]" style={{ margin: '0 6px' }} />

            <AccountMenu user={user} isDemoMode={isDemoMode} onOpenConfig={isDemoMode ? undefined : openConfig} />
          </div>
        </header>

        <main
          className={fillViewport
            ? ['flex flex-col overflow-hidden px-4 py-4 sm:px-6 lg:px-8', isDemoMode ? 'h-[calc(100%-64px)]' : 'h-[calc(100vh-64px)]'].join(' ')
            : 'px-4 py-6 sm:px-6 lg:px-8'}
        >
          {children}
        </main>
      </div>
      {!isDemoMode && <FinancialAssistant />}
      {!isDemoMode && (
        <ConfigPanel
          open={configPanel.open}
          initialItem={configPanel.item}
          onClose={closeConfig}
          onItemChange={(item) => {
            const url = new URL(window.location.href);
            url.searchParams.set('config', item);
            window.history.replaceState(window.history.state, '', url);
          }}
        />
      )}
    </div>
  );
}
