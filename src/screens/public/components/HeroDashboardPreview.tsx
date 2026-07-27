import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Home,
  ReceiptText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

const chartData = [
  { month: 'Jan', receitas: 26000, despesas: 17600, saldo: 8400 },
  { month: 'Fev', receitas: 28600, despesas: 19000, saldo: 9600 },
  { month: 'Mar', receitas: 31800, despesas: 22000, saldo: 9800 },
  { month: 'Abr', receitas: 30200, despesas: 18600, saldo: 11600 },
  { month: 'Mai', receitas: 36400, despesas: 23200, saldo: 13200 },
  { month: 'Jun', receitas: 32600, despesas: 20100, saldo: 12500 },
  { month: 'Jul', receitas: 38200, despesas: 24800, saldo: 13400 },
  { month: 'Ago', receitas: 34200, despesas: 21400, saldo: 12800 },
  { month: 'Set', receitas: 33600, despesas: 20500, saldo: 13100 },
  { month: 'Out', receitas: 36800, despesas: 22600, saldo: 14200 },
  { month: 'Nov', receitas: 33100, despesas: 19600, saldo: 13500 },
  { month: 'Dez', receitas: 30600, despesas: 18200, saldo: 12400 },
];

const menuItems = [
  { label: 'Painel', icon: BarChart3, active: true },
  { label: 'Receitas', icon: TrendingUp },
  { label: 'Despesas', icon: TrendingDown },
  { label: 'Reservas', icon: WalletCards },
  { label: 'Relatórios', icon: FileText },
];

const commitments = [
  { label: 'Aluguel', date: '10 Jul 2026', value: '-R$ 2.500,00', tone: 'expense', icon: Home },
  { label: 'Fornecedores', date: '15 Jul 2026', value: '-R$ 1.340,00', tone: 'expense', icon: BriefcaseBusiness },
  { label: 'Assinatura do sistema', date: '18 Jul 2026', value: '-R$ 189,00', tone: 'expense', icon: ReceiptText },
  { label: 'Salário', date: '25 Jul 2026', value: 'R$ 6.200,00', tone: 'income', icon: WalletCards },
  { label: 'Recebimento de cliente', date: '28 Jul 2026', value: 'R$ 4.850,00', tone: 'income', icon: TrendingUp },
];

interface MetricCardProps {
  label: string;
  value: string;
  delta: string;
  tone: 'income' | 'expense';
}

function MetricCard({ label, value, delta, tone }: MetricCardProps) {
  const isIncome = tone === 'income';
  const Icon = isIncome ? TrendingUp : TrendingDown;
  const deltaClass = isIncome ? 'text-[#37D598]' : 'text-[#FF6B6B]';
  const iconClass = isIncome
    ? 'bg-emerald-400/10 text-[#37D598]'
    : 'bg-red-400/10 text-[#FF6B6B]';

  return (
    <div className="min-w-0 rounded-xl border border-[rgba(30,196,220,0.13)] bg-[rgba(8,42,52,0.72)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-site-textMuted">{label}</p>
          <p className="mt-1.5 truncate text-[18px] font-semibold leading-none text-site-text">{value}</p>
          <p className={['mt-2 text-[11px] font-semibold', deltaClass].join(' ')}>{delta}</p>
        </div>
        <span className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconClass].join(' ')}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function CommitmentList() {
  return (
    <div className="rounded-2xl border border-[rgba(30,196,220,0.13)] bg-[rgba(8,42,52,0.66)] p-3.5">
      <h3 className="text-[14px] font-semibold text-site-text">Próximos compromissos</h3>
      <div className="mt-3 grid gap-2.5">
        {commitments.map(({ label, date, value, tone, icon: Icon }, index) => (
          <div
            key={label}
            className={index > 1 ? 'hidden items-center gap-3 xl:flex' : 'flex items-center gap-3'}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(30,196,220,0.22)] bg-[rgba(14,196,216,0.05)] text-site-accent">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-site-text">{label}</span>
              <span className="block text-[10px] text-site-textMuted">{date}</span>
            </span>
            <span className={tone === 'income' ? 'text-[11px] font-semibold text-[#37D598]' : 'text-[11px] font-semibold text-[#FF6B6B]'}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroDashboardPreview() {
  return (
    <div
      className="relative mx-auto mt-5 w-full max-w-[1320px] sm:mt-6 lg:mt-7"
      aria-label="Prévia demonstrativa do painel financeiro do FINGERENCE com dados fictícios"
    >
      <div className="pointer-events-none absolute -bottom-8 left-[6%] right-[6%] h-20 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(20,184,212,0.36),rgba(20,184,212,0.10)_42%,transparent_72%)] blur-xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-4 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-site-accent/70 to-transparent shadow-[0_0_24px_rgba(20,184,212,0.55)]" aria-hidden="true" />
      <div className="relative flex min-h-[310px] overflow-hidden rounded-[28px] border border-[rgba(30,196,220,0.30)] bg-[linear-gradient(135deg,rgba(6,35,44,0.92),rgba(3,22,29,0.90))] shadow-[0_0_46px_rgba(14,196,216,0.16),0_34px_110px_rgba(0,0,0,0.48)]">
        <aside className="hidden w-[206px] shrink-0 border-r border-[rgba(30,196,220,0.14)] bg-[rgba(3,22,29,0.74)] p-3.5 lg:block">
          <div className="flex items-center gap-3">
            <img src="/icons/logo.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" aria-hidden="true" />
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.20em] text-site-text"
                style={{ fontFamily: "'Cinzel', serif", fontStyle: 'italic' }}
              >
                FINGERENCE
              </p>
              <p className="mt-1 text-[9px] text-site-textMuted">Sistema financeiro</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-[rgba(30,196,220,0.12)] bg-[rgba(3,22,29,0.58)] p-1">
            <span className="rounded-lg bg-site-accent/80 px-3 py-2 text-center text-[11px] font-semibold text-white">Pessoal</span>
            <span className="rounded-lg px-3 py-2 text-center text-[11px] text-site-textMuted">Empresa</span>
          </div>

          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-site-textMuted">Finanças</p>
          <nav className="mt-3 grid gap-1" aria-label="Menu demonstrativo do painel">
            {menuItems.map(({ label, icon: Icon, active }) => (
              <span
                key={label}
                className={active
                  ? 'flex items-center gap-3 rounded-xl bg-[rgba(14,196,216,0.13)] px-3 py-2.5 text-[12px] font-semibold text-site-text'
                  : 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] text-site-textSub'}
              >
                <Icon className="h-4 w-4 text-site-accent" aria-hidden="true" />
                {label}
              </span>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(30,196,220,0.10)] pb-3">
            <div className="flex items-center gap-3 text-site-textSub">
              <CalendarDays className="h-4 w-4 text-site-accent" aria-hidden="true" />
              <span className="text-[13px] font-semibold text-site-text">Julho 2026</span>
              <span className="rounded-full border border-[rgba(30,196,220,0.18)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-site-textMuted">
                Simulação visual
              </span>
            </div>
            <div className="flex items-center gap-3 text-site-textMuted">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <Bell className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Saldo disponível" value="R$ 18.540,80" delta="+12,4% vs. Jun/2026" tone="income" />
            <MetricCard label="Receitas" value="R$ 32.680,00" delta="+18,7% vs. Jun/2026" tone="income" />
            <MetricCard label="Despesas" value="R$ 14.139,20" delta="-6,3% vs. Jun/2026" tone="expense" />
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_280px]">
            <div className="min-w-0 rounded-2xl border border-[rgba(30,196,220,0.13)] bg-[rgba(3,22,29,0.50)] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-site-text">Receitas × Despesas × Saldo — 2026</h3>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-site-textMuted" aria-hidden="true">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#37D598]" />Receitas</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FF6B6B]" />Despesas</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2EA7FF]" />Saldo</span>
                </div>
              </div>
              <div
                className="mt-3 h-[170px] sm:h-[190px]"
                role="img"
                aria-label="Gráfico demonstrativo de receitas, despesas e saldo de janeiro a dezembro de 2026"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="heroReceitas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#37D598" stopOpacity={0.20} />
                        <stop offset="100%" stopColor="#37D598" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="heroDespesas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF6B6B" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#FF6B6B" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="heroSaldo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2EA7FF" stopOpacity={0.14} />
                        <stop offset="100%" stopColor="#2EA7FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(175,195,201,0.10)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#AFC3C9', fontSize: 11 }} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#7A9099', fontSize: 10 }}
                      tickFormatter={(value: number) => 'R$ ' + (value / 1000).toFixed(0) + 'k'}
                    />
                    <ReferenceLine x="Jul" stroke="#14B8D4" strokeDasharray="4 4" strokeOpacity={0.55} />
                    <Area isAnimationActive={false} type="monotone" dataKey="receitas" stroke="#37D598" strokeWidth={2} fill="url(#heroReceitas)" dot={{ r: 2 }} />
                    <Area isAnimationActive={false} type="monotone" dataKey="despesas" stroke="#FF6B6B" strokeWidth={2} fill="url(#heroDespesas)" dot={{ r: 2 }} />
                    <Area isAnimationActive={false} type="monotone" dataKey="saldo" stroke="#2EA7FF" strokeWidth={2} fill="url(#heroSaldo)" dot={{ r: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <CommitmentList />
          </div>
        </div>
      </div>
    </div>
  );
}
