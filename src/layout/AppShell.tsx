import { type ReactNode, useState, useEffect } from 'react';
import {
  BarChart3, Bell, Briefcase, Building2, ChevronDown, ChevronLeft, ChevronRight,
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

export type AppSection =
  | 'painel' | 'receitas' | 'despesas' | 'reservas'
  | 'relatorios' | 'planos' | 'configuracoes';

export type ConfigTab =
  | 'conta' | 'categorias' | 'cartoes' | 'perfis'
  | 'representantes' | 'socios' | 'usuarios' | 'clientes' | 'servicos';

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
      { label: 'Receitas',  icon: TrendingUp,      section: 'receitas' },
      { label: 'Despesas',  icon: TrendingDown,    section: 'despesas' },
      { label: 'Reservas',  icon: Wallet,          section: 'reservas' },
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
  { id: 'clientes',       label: 'Clientes',       icon: Building2 },
  { id: 'servicos',       label: 'Serviços',       icon: Layers },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

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
        <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-xl border border-[rgba(14,196,216,0.22)] bg-[#0A2530] shadow-xl overflow-hidden">
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
      }>>(`/despesas?${params}`);
    },
    staleTime: 60_000,
  });

  const total = data.reduce((s, d) => s + Number(d.valor_final), 0);
  const recentes = data.slice(0, 6);

  return (
    <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[rgba(14,196,216,0.22)] bg-[#0A2530] shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[rgba(14,196,216,0.15)] px-4 py-3 bg-[#0D2E3C]">
        <p className="font-bold text-[#E8F4F5] text-sm">Notificações</p>
        <button onClick={onClose} className="rounded-lg p-1 text-[rgba(14,196,216,0.5)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition">
          <X size={15} />
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-[rgba(14,196,216,0.4)]">Carregando...</div>
      ) : data.length === 0 ? (
        <div className="py-10 text-center text-sm text-[rgba(14,196,216,0.4)]">
          <Bell size={28} className="mx-auto mb-2 text-[rgba(14,196,216,0.2)]" />
          Sem despesas este mês
        </div>
      ) : (
        <div className="divide-y divide-[rgba(14,196,216,0.08)]">
          <div className="flex items-center justify-between px-4 py-2.5 bg-rose-900/20">
            <p className="text-xs font-semibold text-rose-400">
              {data.length} despesa{data.length !== 1 ? 's' : ''} no mês
            </p>
            <p className="text-xs font-bold text-rose-300">
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {recentes.map((d) => (
              <div key={d.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[rgba(14,196,216,0.04)] transition">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-900/30 mt-0.5">
                  <TrendingDown size={13} className="text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-semibold text-[#E8F4F5]">{d.descricao}</p>
                  <p className="text-xs text-[rgba(14,196,216,0.4)]">
                    {d.categoria_nome ?? 'Sem categoria'} · R$ {Number(d.valor_final).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {data.length > 6 && (
            <div className="px-4 py-2 text-center text-xs text-[rgba(14,196,216,0.4)] bg-[#0D2E3C]">
              +{data.length - 6} despesas registradas
            </div>
          )}
        </div>
      )}
    </div>
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
  const userInitial = (user?.nome ?? 'U')[0].toUpperCase();

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
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {/* Main groups */}
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

        {/* Sistema — Configurações accordion */}
        <div>
          <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-[rgba(14,196,216,0.38)]">Sistema</p>
          <div className="space-y-0.5">
            {/* Configurações header */}
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
                'relative flex h-10 w-full items-center gap-3 rounded-lg text-sm font-medium transition',
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
              <span className="flex-1 text-left">Configurações</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${configOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Submenu */}
            {configOpen && (
              <div className="ml-3 space-y-0.5 border-l border-[rgba(14,196,216,0.15)] pl-2.5">
                {CONFIG_SUBS.filter((sub) => {
                  const perfilTipo = localStorage.getItem('perfilAtivoTipo');
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
            <p className="truncate text-sm font-semibold text-[#E8F4F5]">{user?.nome ?? 'Usuário'}</p>
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
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[rgba(14,196,216,0.18)] lg:flex lg:flex-col shadow-sm">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#040E12]/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-[rgba(14,196,216,0.18)] bg-[#0D2E3C]/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] hover:bg-[rgba(14,196,216,0.08)] transition"
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
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgba(14,196,216,0.55)] hover:bg-[rgba(14,196,216,0.08)] hover:text-[#0EC4D8] transition"
              >
                <Bell size={16} />
              </button>
              {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
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
