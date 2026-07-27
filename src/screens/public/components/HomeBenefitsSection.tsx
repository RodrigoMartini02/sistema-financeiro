import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowRight,
  BellRing,
  Building2,
  CalendarDays,
  Car,
  Clock3,
  CreditCard,
  PieChart,
  Repeat2,
  School,
  TrendingUp,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

type Tone = 'green' | 'blue' | 'coral' | 'cyan' | 'amber' | 'violet';

const toneStyles: Record<Tone, { icon: string; bar: string; border: string; text: string }> = {
  green: {
    icon: 'border-[#26C281]/28 bg-[#26C281]/10 text-[#26C281]',
    bar: 'bg-[#26C281]',
    border: 'border-[#26C281]/55',
    text: 'text-[#26C281]',
  },
  blue: {
    icon: 'border-[#3789F5]/30 bg-[#3789F5]/10 text-[#3789F5]',
    bar: 'bg-[#3789F5]',
    border: 'border-[#3789F5]/55',
    text: 'text-[#3789F5]',
  },
  coral: {
    icon: 'border-[#EF6464]/30 bg-[#EF6464]/10 text-[#EF6464]',
    bar: 'bg-[#EF6464]',
    border: 'border-[#EF6464]/55',
    text: 'text-[#EF6464]',
  },
  cyan: {
    icon: 'border-[#16B9D4]/30 bg-[#16B9D4]/10 text-[#16B9D4]',
    bar: 'bg-[#16B9D4]',
    border: 'border-[#16B9D4]/55',
    text: 'text-[#16B9D4]',
  },
  amber: {
    icon: 'border-[#F6A623]/30 bg-[#F6A623]/10 text-[#F6A623]',
    bar: 'bg-[#F6A623]',
    border: 'border-[#F6A623]/55',
    text: 'text-[#F6A623]',
  },
  violet: {
    icon: 'border-[#825BD8]/30 bg-[#825BD8]/10 text-[#825BD8]',
    bar: 'bg-[#825BD8]',
    border: 'border-[#825BD8]/55',
    text: 'text-[#825BD8]',
  },
};

// Dados meramente demonstrativos para apresentação pública do produto.
const monthlyMetrics: Array<{ label: string; value: string; tone: Tone; icon: LucideIcon }> = [
  { label: 'Recebido', value: 'R$ 8.750,00', tone: 'green', icon: ArrowDownToLine },
  { label: 'Pago', value: 'R$ 5.420,00', tone: 'blue', icon: CreditCard },
  { label: 'Pendente', value: 'R$ 1.280,00', tone: 'coral', icon: Clock3 },
  { label: 'Saldo projetado', value: 'R$ 2.050,00', tone: 'cyan', icon: TrendingUp },
];

const healthRows = [
  { label: 'Receitas recebidas', value: 'R$ 8.750,00', now: 70, tone: 'green' as Tone },
  { label: 'Despesas pagas', value: 'R$ 5.420,00', now: 54, tone: 'blue' as Tone },
  { label: 'Despesas pendentes', value: 'R$ 1.280,00', now: 38, tone: 'coral' as Tone },
];

const categoryRows = [
  { label: 'Moradia', percent: '34%', width: '100%', tone: 'cyan' as Tone },
  { label: 'Alimentação', percent: '22%', width: '65%', tone: 'cyan' as Tone },
  { label: 'Transporte', percent: '15%', width: '44%', tone: 'blue' as Tone },
  { label: 'Saúde', percent: '10%', width: '30%', tone: 'blue' as Tone },
  { label: 'Lazer', percent: '8%', width: '24%', tone: 'blue' as Tone },
  { label: 'Outros', percent: '11%', width: '32%', tone: 'blue' as Tone },
];

const installments = [
  { label: 'Cartão de crédito', date: 'Vence em 10 Ago', value: 'R$ 980,00', icon: CalendarDays, tone: 'green' as Tone },
  { label: 'Seguro do carro', date: 'Vence em 15 Ago', value: 'R$ 320,00', icon: Car, tone: 'amber' as Tone },
  { label: 'Escola', date: 'Vence em 20 Ago', value: 'R$ 650,00', icon: School, tone: 'blue' as Tone },
];

function SectionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(22,185,212,0.30)] bg-[radial-gradient(circle_at_35%_25%,rgba(22,185,212,0.22),rgba(5,29,38,0.74)_70%)] text-site-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <Icon className="h-6 w-6" aria-hidden="true" />
    </span>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-[rgba(22,185,212,0.18)] bg-[rgba(11,43,54,0.56)] px-5 py-2 text-[14px] font-semibold text-site-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {children}
    </span>
  );
}

function ProgressBar({ label, now, tone }: { label: string; now: number; tone: Tone }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-[rgba(120,149,157,0.16)]"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={now}
    >
      <div className={['h-full rounded-full', toneStyles[tone].bar].join(' ')} style={{ width: now + '%' }} />
    </div>
  );
}

function MonthlyMetric({ metric }: { metric: (typeof monthlyMetrics)[number] }) {
  const Icon = metric.icon;

  return (
    <li className="relative min-w-0 overflow-hidden rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(11,43,54,0.78)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-3">
        <span className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', toneStyles[metric.tone].icon].join(' ')}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-[14px] leading-tight text-site-text">{metric.label}</span>
      </div>
      <p className="mt-4 whitespace-nowrap text-[20px] font-semibold leading-none text-site-text sm:text-[21px]">{metric.value}</p>
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[rgba(120,149,157,0.14)]">
        <div className={['h-full rounded-r-full', toneStyles[metric.tone].bar].join(' ')} style={{ width: metric.tone === 'coral' ? '82%' : '100%' }} />
      </div>
    </li>
  );
}

function FinancialHealthPanel() {
  return (
    <article className="rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(5,29,38,0.62)] p-4 sm:p-5">
      <h4 className="text-[18px] font-semibold text-site-text">Saúde financeira — Julho</h4>
      <div className="mt-4 grid gap-3">
        {healthRows.map((row) => (
          <div key={row.label}>
            <div className="mb-2 flex items-center justify-between gap-4 text-[14px] sm:text-[15px]">
              <span className="text-site-textSub">{row.label}</span>
              <span className="font-medium text-site-text">{row.value}</span>
            </div>
            <ProgressBar label={row.label + ': ' + row.now + '%'} now={row.now} tone={row.tone} />
          </div>
        ))}
      </div>
    </article>
  );
}

function CommitmentPanel() {
  return (
    <div className="grid gap-3">
      <article className="rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(5,29,38,0.62)] p-4 sm:p-5">
        <h4 className="text-[15px] font-medium text-site-text">Comprometimento do mês</h4>
        <p className="mt-1 text-[clamp(28px,2.1vw,34px)] font-semibold leading-none text-site-text">62%</p>
        <div className="mt-4">
          <ProgressBar label="Comprometimento do mês: 62%" now={62} tone="amber" />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-site-textSub">Percentual das receitas já comprometidas.</p>
      </article>

      <article className="flex items-center gap-4 rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(5,29,38,0.62)] p-4 sm:p-5">
        <BellRing className="h-7 w-7 shrink-0 text-[#F6A623]" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[16px] font-semibold leading-snug text-site-text">
          3 compromissos<br className="hidden sm:block" /> nos próximos 7 dias
        </p>
        <ArrowRight className="h-5 w-5 shrink-0 text-site-textMuted" aria-hidden="true" />
      </article>
    </div>
  );
}

function ExpenseDistribution() {
  return (
    <article className="rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(5,29,38,0.62)] p-4 sm:p-5">
      <h4 className="text-[18px] font-semibold text-site-text">Fixas × Variáveis</h4>
      <div
        className="relative mt-4 flex h-5 overflow-hidden rounded-md bg-[rgba(120,149,157,0.14)]"
        role="progressbar"
        aria-label="Distribuição de despesas fixas e variáveis"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={62}
      >
        <div className="h-full w-[62%] bg-[#3789F5]" />
        <div className="h-full w-[38%] bg-[#825BD8]" />
        <div className="absolute left-[62%] top-0 h-full w-px bg-white/70" aria-hidden="true" />
      </div>
      <div className="mt-2 grid gap-3 text-[14px] text-site-textSub sm:grid-cols-2">
        <div>
          <p className="font-semibold text-site-text">Fixas <span className="text-[#C1A8FF]">62%</span></p>
          <p>R$ 3.360,00</p>
        </div>
        <div className="sm:text-right">
          <p className="font-semibold text-site-text">Variáveis <span className="text-[#C1A8FF]">38%</span></p>
          <p>R$ 2.060,00</p>
        </div>
      </div>
      <p className="mt-2 text-[13px] text-site-textMuted">Entenda como seus gastos estão distribuídos.</p>
    </article>
  );
}

function MonthlyControlCard() {
  return (
    <article className="relative overflow-hidden rounded-[24px] border border-[rgba(24,190,217,0.50)] bg-[rgba(5,29,38,0.88)] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[rgba(22,185,212,0.08)] blur-3xl" aria-hidden="true" />
      <header className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <SectionIcon icon={CalendarDays} />
          <div className="min-w-0">
            <h3 className="text-[clamp(22px,1.55vw,25px)] font-semibold leading-tight text-site-text">Seu mês sob controle</h3>
            <p className="mt-2 max-w-[520px] text-[15px] leading-relaxed text-site-textSub sm:text-[16px]">
              Veja o que já entrou, o que foi pago e o que ainda está por vencer antes de tomar qualquer decisão.
            </p>
          </div>
        </div>
        <Pill>Saúde financeira</Pill>
      </header>

      <ul className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {monthlyMetrics.map((metric) => (
          <MonthlyMetric key={metric.label} metric={metric} />
        ))}
      </ul>

      <div className="relative mt-4 grid gap-4 lg:grid-cols-[1fr_0.72fr]">
        <FinancialHealthPanel />
        <CommitmentPanel />
      </div>

      <div className="relative mt-4">
        <ExpenseDistribution />
      </div>
    </article>
  );
}

function CategoryBar({ item }: { item: (typeof categoryRows)[number] }) {
  return (
    <li className="grid grid-cols-[72px_1fr_38px] items-center gap-3 text-[13px] text-site-textSub">
      <span>{item.label}</span>
      <div
        className="h-2 overflow-hidden rounded-full bg-[rgba(120,149,157,0.16)]"
        role="progressbar"
        aria-label={item.label + ': ' + item.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(item.percent.replace('%', ''))}
      >
        <div className={['h-full rounded-full', toneStyles[item.tone].bar].join(' ')} style={{ width: item.width }} />
      </div>
      <span className="text-right text-site-text">{item.percent}</span>
    </li>
  );
}

function VisibilityCard() {
  return (
    <article className="relative overflow-hidden rounded-[24px] border border-[rgba(24,190,217,0.50)] bg-[rgba(5,29,38,0.88)] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <SectionIcon icon={PieChart} />
          <div className="min-w-0">
            <h3 className="text-[clamp(22px,1.45vw,25px)] font-semibold leading-tight text-site-text">Visibilidade real</h3>
            <p className="mt-2 max-w-[500px] text-[15px] leading-relaxed text-site-textSub sm:text-[16px]">
              Veja categorias, formas de pagamento e parcelas futuras sem depender de planilhas.
            </p>
          </div>
        </div>
        <Pill>Tudo em um só lugar</Pill>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(11,43,54,0.62)] p-4">
          <h4 className="text-[12px] font-semibold uppercase text-site-text">Despesas por categoria</h4>
          <ul className="mt-4 grid gap-4">
            {categoryRows.map((item) => (
              <CategoryBar key={item.label} item={item} />
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-[rgba(74,153,173,0.20)] bg-[rgba(11,43,54,0.62)] p-4">
          <h4 className="text-[12px] font-semibold uppercase text-site-text">Parcelas futuras</h4>
          <ul className="mt-3 grid gap-2">
            {installments.map(({ label, date, value, icon: Icon, tone }) => (
              <li key={label} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-xl border border-[rgba(74,153,173,0.12)] bg-[rgba(5,29,38,0.36)] p-3">
                <span className={['flex h-9 w-9 items-center justify-center rounded-lg border', toneStyles[tone].icon].join(' ')}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-site-text">{label}</span>
                  <span className="block truncate text-[12px] text-site-textMuted">{date}</span>
                </span>
                <span className="text-[13px] font-semibold text-[#EF6464]">{value}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/funcionalidades"
            className="site-neon-text-button mt-3 inline-flex items-center gap-2 rounded-lg py-1 text-[14px] text-site-accent outline-none focus-visible:ring-2 focus-visible:ring-site-accent/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#051D26]"
          >
            Ver todas as parcelas
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </article>
      </div>
    </article>
  );
}

function ProfileSummary({
  title,
  value,
  delta,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  delta: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  return (
    <article className={['min-w-0 rounded-xl border bg-[rgba(5,29,38,0.42)] p-4', toneStyles[tone].border].join(' ')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={['flex h-9 w-9 shrink-0 items-center justify-center rounded-full border', toneStyles[tone].icon].join(' ')}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <h4 className="truncate text-[18px] font-semibold text-site-text">{title}</h4>
        </div>
        <span className="inline-flex items-center gap-2 text-[13px] text-[#26C281]">
          <span className="h-2 w-2 rounded-full bg-[#26C281]" aria-hidden="true" />
          Ativo
        </span>
      </div>
      <div className="mt-3 border-t border-[rgba(74,153,173,0.16)] pt-3">
        <p className="text-[13px] text-site-textSub">Saldo projetado</p>
        <div className="mt-1 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[clamp(24px,1.9vw,30px)] font-semibold leading-tight text-site-text">{value}</p>
            <p className="mt-1 text-[13px] font-semibold text-[#26C281]">{delta}</p>
          </div>
          <span className={['flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tone === 'green' ? 'bg-[#26C281]/10 text-[#26C281]' : 'bg-[#3789F5]/10 text-[#3789F5]'].join(' ')}>
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  );
}

function ProfilesCard() {
  return (
    <article className="relative overflow-hidden rounded-[24px] border border-[rgba(24,190,217,0.50)] bg-[rgba(5,29,38,0.88)] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <SectionIcon icon={UsersRound} />
          <div className="min-w-0">
            <h3 className="text-[clamp(22px,1.45vw,25px)] font-semibold leading-tight text-site-text">Perfis completamente separados</h3>
            <p className="mt-2 max-w-[520px] text-[15px] leading-relaxed text-site-textSub sm:text-[16px]">
              Mantenha sua vida pessoal e sua empresa organizadas em contextos independentes.
            </p>
          </div>
        </div>
        <Pill>Pessoal + Empresa</Pill>
      </header>

      <div className="mt-5 grid items-center gap-4 lg:grid-cols-[1fr_54px_1fr]">
        <ProfileSummary title="Pessoal" value="R$ 2.050,00" delta="↑ 8,4% vs. Jun/2026" icon={UserRound} tone="green" />
        <div className="relative mx-auto hidden h-full min-h-[88px] w-[54px] items-center justify-center lg:flex" aria-hidden="true">
          <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-[rgba(22,185,212,0.22)]" />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(22,185,212,0.26)] bg-[rgba(5,29,38,0.92)] text-site-textSub">
            <Repeat2 className="h-5 w-5" />
          </span>
        </div>
        <div className="flex justify-center lg:hidden" aria-hidden="true">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(22,185,212,0.22)] bg-[rgba(5,29,38,0.72)] text-site-textSub">
            <Repeat2 className="h-5 w-5" />
          </span>
        </div>
        <ProfileSummary title="Empresa" value="R$ 6.400,00" delta="↑ 12,7% vs. Jun/2026" icon={Building2} tone="blue" />
      </div>
    </article>
  );
}

export function HomeBenefitsSection() {
  return (
    <section
      id="beneficios"
      aria-labelledby="beneficios-title"
      className="relative isolate -mt-px overflow-hidden bg-[#041A22] pb-12 pt-7 sm:pb-14 sm:pt-9 xl:pb-16 xl:pt-9"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#03161D] via-[#041A22]/92 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_3%,rgba(22,185,212,0.14),transparent_26%),radial-gradient(circle_at_7%_70%,rgba(22,185,212,0.08),transparent_30%),radial-gradient(circle_at_90%_45%,rgba(22,185,212,0.06),transparent_30%)]" />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(93,217,234,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(93,217,234,0.18) 1px, transparent 1px)',
            backgroundSize: '88px 88px',
          }}
        />
        <div className="absolute -left-[11%] top-[18%] h-[620px] w-[620px] rounded-full border border-[rgba(22,185,212,0.09)]" />
        <div className="absolute -right-[8%] top-[6%] h-[720px] w-[720px] rounded-full border border-[rgba(22,185,212,0.07)]" />
      </div>

      <div className="relative mx-auto max-w-[1520px] px-5 sm:px-8 xl:px-10">
        <header className="mx-auto max-w-[1220px] text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.34em] text-site-accent">POR QUE USAR O FINGERENCE</p>
          <h2
            id="beneficios-title"
            className="mx-auto mt-5 max-w-[1320px] text-[clamp(32px,3.25vw,50px)] font-semibold leading-[1.08] tracking-[-0.02em] text-site-text text-balance"
          >
            Mais clareza para entender e controlar suas finanças.
          </h2>
          <p className="mx-auto mt-4 max-w-[1120px] text-[clamp(16px,1.25vw,19px)] leading-relaxed text-site-textSub">
            Informações organizadas para você saber o que aconteceu, o que está por vir e onde cada valor está.
          </p>
        </header>

        <div className="mt-8 grid items-stretch gap-5 xl:grid-cols-[1.06fr_0.94fr]">
          <MonthlyControlCard />
          <div className="grid gap-5">
            <VisibilityCard />
            <ProfilesCard />
          </div>
        </div>

        <div className="mt-5 flex justify-center">
          <Link
            to="/funcionalidades"
            className="site-neon-text-button inline-flex items-center gap-3 rounded-xl px-3 py-2 text-[18px] text-site-accent outline-none focus-visible:ring-2 focus-visible:ring-site-accent/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#041A22]"
          >
            Conhecer todas as funcionalidades
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
