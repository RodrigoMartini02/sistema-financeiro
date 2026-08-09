import { type ReactNode, useState, useEffect } from 'react';
import {
  Activity, BarChart3, Bell, Briefcase, Building2, ChevronDown, ChevronLeft, ChevronRight,
  ChevronRight as ChevronSubRight, CreditCard, FileText, LayoutDashboard, Layers,
  LogOut, Moon, Plus, Settings, Sun, Tag, TrendingDown, TrendingUp, User,
  UserCheck, Users, Wallet, X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '../types/auth';
import { logout } from '../services/session';
import { apiRequest, getActiveProfileId } from '../services/apiClient';
import { fetchPerfis } from '../services/configService';
import { queryKeys } from '../services/queryKeys';
import { useAppContext } from '../context/AppContext';
import { MONTH_NAMES } from '../types/finance';
import { Z_DROPDOWN, Z_MOBILE_NAV_OVERLAY, Z_SYSTEM_OVERLAY } from '../ui/zIndex';

export type AppSection =
  | 'painel' | 'movimentacoes' | 'reservas'
  | 'relatorios' | 'planos' | 'configuracoes';

export type ConfigTab =
  | 'conta' | 'categorias' | 'cartoes' | 'perfis'
  | 'representantes' | 'socios' | 'usuarios' | 'clientes' | 'servicos' | 'acessos';

interface AppShellProps {
  user?: AuthUser;
  children: ReactNode;
  activeSection?: AppSection;
  onNavigate?: (section: AppSection) => void;
  configTab?: ConfigTab;
  onConfigTab?: (tab: ConfigTab) => void;
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
];

const CONFIG_SUBS: { id: ConfigTab; label: string; icon: React.ElementType }[] = [
  { id: 'conta',          label: 'Minha conta',    icon: User },
  { id: 'categorias',     label: 'Categorias',     icon: Tag },
  { id: 'cartoes',        label: 'Cartões',        icon: CreditCard },
  { id: 'perfis',         label: 'Perfis',         icon: Layers },
  { id: 'representantes', label: 'Representantes', icon: UserCheck },
  { id: 'socios',         label: 'Sócios',         icon: Briefcase },
  { id: 'usuarios',       label: 'Usuários',       icon: Users },
  { id: 'acessos',        label: 'Acessos',        icon: Activity },
  { id: 'clientes',       label: 'Clientes',       icon: Building2 },
  { id: 'servicos',       label: 'Serviços',       icon: Layers },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
const ANALYTICS_ALLOWED_DOCUMENT = '08996441988';

function PerfilSwitcher() {
  const [open, setOpen] = useState(false);
  const perfis = useQuery({ queryKey: queryKeys.perfis, queryFn: fetchPerfis });
  const data = perfis.data ?? [];
  const activeId = localStorage.getItem('perfilAtivoId');
  const activePerfil = data.find((p) => String(p.id) === activeId) ?? data[0];

  useEffect(() => {
    if (activePerfil && !localStorage.getItem('perfilAtivoTipo')) {
      localStorage.setItem('perfilAtivoTipo', activePerfil.tipo);
    }
  }, [activePerfil]);

  if (data.length <= 1) return null;
  const select = (id: number, nome: string, tipo: string) => {
    localStorage.setItem('perfilAtivoId', String(id));
    localStorage.setItem('perfilAtivoNome', nome);
    localStorage.setItem('perfilAtivoTipo', tipo);
    setOpen(false);
    window.location.reload();
  };
  return (
    <div className="relative px-3 pb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-[rgba(14,196,216,0.22)] bg-[rgba(14,196,216,0.07)] px-3 py-2 text-xs font-semibold text-[rgba(14,196,216,0.85)] hover:bg-[rgba(14,196,216,0.12)] transition"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[rgba(14,196,216,0.14)] text-[#0EC4D8]">
          <User size={11} />
        </div>
        <span className="flex-1 truncate text-left">{activePerfil?.nome ?? 'Perfil'}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={['absolute left-3 right-3 top-full mt-1 rounded-xl border border-[rgba(14,196,216,0.22)] bg-[#0A2530] shadow-xl overflow-hidden', Z_DROPDOWN].join(' ')}>
          {data.map((p) => (
            <button
              key={p.id}
              onClick={() => select(p.id, p.nome, p.tipo)}
              className={[
                'flex w-full items-center gap-2 px-3 py-2.5 text-xs transition',
                String(p.id) === activeId
                  ? 'bg-[rgba(14,196,216,0.10)] text-[#0EC4D8] font-semibold'
                  : 'text-[rgba(14,196,216,0.65)] hover:bg-[rgba(14,196,216,0.06)]',
              ].join(' ')}
            >
              <span className="flex-1 text-left font-medium">{p.nome}</span>
              <span className="rounded-full bg-[rgba(14,196,216,0.08)] px-1.5 py-0.5 text-[10px] uppercase text-[rgba(14,196,216,0.5)]">{p.tipo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PeriodSelector() {
  const { month, year, setMonth, setYear } = useAppContext();
  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  return (
    <div className="flex items-center gap-0.5">
      <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgba(14,196,216,0.5)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition">
        <ChevronLeft size={16} />
      </button>
      <div className="min-w-[120px] text-center">
        <span className="text-sm font-bold text-[#E8F4F5]">{MONTH_NAMES[month]}</span>
        <span className="ml-1.5 text-sm font-normal text-[rgba(14,196,216,0.45)]">{year}</span>
      </div>
      <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgba(14,196,216,0.5)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { month, year } = useAppContext();

  const { data = [], isLoading } = useQuery({
    queryKey: ['notif-despesas', month, year],
    queryFn: async () => {
      const params = new URLSearchParams({ mes: String(month), ano: String(year) });
      const profileId = getActiveProfileId();
      if (profileId) params.set('perfil_id', String(profileId));
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

export function AppShell({
  user, children, activeSection = 'painel', onNavigate,
  configTab = 'conta', onConfigTab,
}: AppShellProps) {
  const { theme, toggleTheme, setQuickAction } = useAppContext();
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(activeSection === 'configuracoes');

  useEffect(() => {
    if (activeSection === 'configuracoes') setConfigOpen(true);
  }, [activeSection]);

  const handleLogout = () => { logout(); window.location.replace('/index.html'); };
  const userInitial = (user?.nome ?? user?.name ?? 'U')[0].toUpperCase();
  const userDocument = (user?.documento ?? user?.document ?? '').replace(/\D/g, '');
  const canViewAnalytics = userDocument === ANALYTICS_ALLOWED_DOCUMENT;

  const currentNav = ALL_NAV.find((n) => n.section === activeSection);
  const currentConfigSub = CONFIG_SUBS.find((s) => s.id === configTab);
  const sectionLabel = activeSection === 'configuracoes'
    ? `Config. › ${currentConfigSub?.label ?? ''}`
    : currentNav?.label;

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

      {/* Perfil switcher */}
      <div className="pt-3">
        <PerfilSwitcher />
      </div>

      {/* Navigation */}
      <nav className="sidebar-config-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
        <div className="shrink-0 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-[rgba(14,196,216,0.38)]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
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
          ))}
        </div>

        <div className="mt-4 flex flex-col">
          <p className="mb-1 shrink-0 px-3 text-[10px] font-bold uppercase tracking-widest text-[rgba(14,196,216,0.38)]">Sistema</p>
          <div className="flex flex-col space-y-0.5">
            <button
              onClick={() => {
                const wasOpen = configOpen;
                setConfigOpen((o) => !o);
                if (!wasOpen) {
                  onNavigate?.('configuracoes');
                  setMobileOpen(false);
                }
              }}
              className={[
                'relative flex h-10 w-full shrink-0 items-center gap-3 rounded-lg text-sm font-medium transition',
                activeSection === 'configuracoes'
                  ? 'bg-[rgba(14,196,216,0.10)] text-[#0EC4D8] font-semibold'
                  : 'text-[rgba(14,196,216,0.5)] hover:bg-[rgba(14,196,216,0.06)] hover:text-[#E8F4F5]',
              ].join(' ')}
              style={{
                paddingLeft: activeSection === 'configuracoes' ? '10px' : '12px',
                paddingRight: '12px',
              }}
            >
              {activeSection === 'configuracoes' && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[#0EC4D8]" />
              )}
              <Settings size={17} className={activeSection === 'configuracoes' ? 'text-[#0EC4D8]' : ''} />
              <span className="flex-1 text-left">{'Configura\u00e7\u00f5es'}</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${configOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {configOpen && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-[rgba(14,196,216,0.15)] pl-2.5 pr-1">
                {CONFIG_SUBS.filter((sub) => {
                  const perfilTipo = localStorage.getItem('perfilAtivoTipo');
                  if (sub.id === 'acessos') {
                    return canViewAnalytics;
                  }
                  if (sub.id === 'representantes' || sub.id === 'socios') {
                    return perfilTipo !== 'pessoal';
                  }
                  return true;
                }).map((sub) => {
                  const Icon = sub.icon;
                  const isActiveSub = activeSection === 'configuracoes' && configTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => {
                        onNavigate?.('configuracoes');
                        onConfigTab?.(sub.id);
                        setMobileOpen(false);
                      }}
                      className={[
                        'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-xs font-medium transition',
                        isActiveSub
                          ? 'bg-[rgba(14,196,216,0.10)] text-[#0EC4D8] font-semibold'
                          : 'text-[rgba(14,196,216,0.5)] hover:bg-[rgba(14,196,216,0.06)] hover:text-[#E8F4F5]',
                      ].join(' ')}
                    >
                      <Icon size={14} className={isActiveSub ? 'text-[#0EC4D8]' : 'text-[rgba(14,196,216,0.35)]'} />
                      {sub.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* User footer */}
      <div className="border-t border-[rgba(14,196,216,0.18)] p-4 space-y-2">
        <div className="flex items-center gap-3 rounded-xl bg-[rgba(14,196,216,0.07)] px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0EC4D8] text-xs font-bold text-[#040E12] shadow-sm">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-[#E8F4F5]">{user?.nome ?? user?.name ?? 'Usuário'}</p>
            <p className="truncate text-xs text-[rgba(14,196,216,0.45)]">{user?.email ?? 'Sessão ativa'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[rgba(14,196,216,0.5)] hover:bg-red-900/20 hover:text-red-400 transition"
        >
          <LogOut size={15} />
          Sair da conta
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[rgba(14,196,216,0.18)] lg:flex lg:flex-col shadow-sm">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className={['fixed inset-0 lg:hidden', Z_MOBILE_NAV_OVERLAY].join(' ')}>
          <div className="absolute inset-0 bg-[#040E12]/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-[rgba(14,196,216,0.18)] bg-[#0D2E3C]/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
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
                {activeSection === 'configuracoes' && currentConfigSub
                  ? <currentConfigSub.icon size={16} className="text-[#0EC4D8]" />
                  : currentNav && <currentNav.icon size={16} className="text-[#0EC4D8]" />
                }
                <span className="text-sm font-semibold text-[#E8F4F5]">{sectionLabel}</span>
              </div>
            )}

            <PeriodSelector />
            <div className="flex-1" />

            <button
              onClick={toggleTheme}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition lg:h-8 lg:w-8"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition lg:h-8 lg:w-8"
              >
                <Bell size={16} />
              </button>
            </div>

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0EC4D8] text-xs font-bold text-[#040E12] shadow-sm lg:hidden">
              {userInitial}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
