import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Layers,
  ListPlus,
  LockKeyhole,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  WalletCards,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { SitePageHero } from './components/SitePageHero';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { CookieBanner } from '../../components/CookieBanner';

interface ModuleFeature {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
}

const MODULOS: ModuleFeature[] = [
  {
    icon: ReceiptText,
    title: 'Despesas',
    description: 'Lance despesas simples, parceladas ou recorrentes com categoria, cartão e mês financeiro correto.',
    accent: 'border-rose-100 bg-rose-50 text-rose-600',
  },
  {
    icon: TrendingUp,
    title: 'Receitas',
    description: 'Registre entradas únicas ou recorrentes e acompanhe o histórico por período, perfil e origem.',
    accent: 'border-emerald-100 bg-emerald-50 text-emerald-600',
  },
  {
    icon: PiggyBank,
    title: 'Reservas',
    description: 'Separe metas, caixa de segurança e objetivos sem perder o saldo disponível de vista.',
    accent: 'border-amber-100 bg-amber-50 text-amber-600',
  },
  {
    icon: ListPlus,
    title: 'Cadastro em lote',
    description: 'Registre várias receitas ou despesas de uma vez, ideal para rotinas com maior volume.',
    accent: 'border-sky-100 bg-sky-50 text-sky-600',
  },
  {
    icon: BarChart3,
    title: 'Relatórios',
    description: 'Compare categorias, evolução mensal e resultados para tomar decisões com mais clareza.',
    accent: 'border-indigo-100 bg-indigo-50 text-indigo-600',
  },
  {
    icon: CreditCard,
    title: 'Cartão de crédito',
    description: 'Controle limite real, parcelas abertas e recorrências antes da fatura virar surpresa.',
    accent: 'border-cyan-100 bg-cyan-50 text-cyan-700',
  },
];

const FLUXO = [
  {
    icon: Layers,
    title: 'Separe por perfil',
    description: 'Pessoal, empresa ou CNPJ ficam em ambientes independentes dentro da mesma conta.',
  },
  {
    icon: CalendarClock,
    title: 'Organize por mês',
    description: 'Cada lançamento entra no período certo, com fechamento e reabertura quando precisar.',
  },
  {
    icon: BookOpen,
    title: 'Leia o histórico',
    description: 'Relatórios e reservas mostram o caminho do dinheiro sem depender de planilhas soltas.',
  },
];

const ANTES = [
  'Planilhas desatualizadas',
  'Lançamentos duplicados',
  'Saldo sempre em dúvida',
  'Parcelas perdidas no tempo',
  'Pessoal e empresa misturados',
  'Histórico difícil de consultar',
];

const DEPOIS = [
  'Tudo em um lugar, sempre atualizado',
  'Receitas e despesas com contexto',
  'Saldo calculado automaticamente',
  'Parcelas rastreadas mês a mês',
  'Perfis separados por finalidade',
  'Relatórios prontos para decisão',
];

const SEGURANCA = [
  'TLS/HTTPS',
  'Bcrypt',
  'JWT',
  'Perfis isolados',
  'Sem acesso bancário',
  'Controle manual dos dados',
];

const CHART_BARS = [
  { label: 'Jan', income: 62, expense: 44 },
  { label: 'Fev', income: 66, expense: 48 },
  { label: 'Mar', income: 72, expense: 55 },
  { label: 'Abr', income: 68, expense: 42 },
  { label: 'Mai', income: 82, expense: 58 },
  { label: 'Jun', income: 76, expense: 49 },
  { label: 'Jul', income: 88, expense: 61 },
  { label: 'Ago', income: 80, expense: 52 },
];

function Label({ text }: { text: string }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">{text}</p>;
}

function ModuleCard({ icon: Icon, title, description, accent }: ModuleFeature) {
  return (
    <article className="group min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] transition duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_20px_54px_rgba(15,23,42,0.08)]">
      <span className={['flex h-11 w-11 items-center justify-center rounded-lg border', accent].join(' ')}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-[20px] font-semibold leading-tight text-slate-950">{title}</h2>
      <p className="mt-3 text-[14px] leading-[1.75] text-slate-600">{description}</p>
    </article>
  );
}

function ProductPreview() {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]"
      aria-label="Prévia visual do painel financeiro do FINGERENCE com dados fictícios"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <WalletCards className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-950">Julho 2026</p>
            <p className="truncate text-[11px] text-slate-500">Perfil empresarial</p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
          Mês aberto
        </span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Saldo</p>
          <p className="mt-2 text-[22px] font-semibold leading-none text-slate-950">R$ 18.540</p>
          <p className="mt-2 text-[12px] font-medium text-emerald-600">+12,4% no mês</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Receitas</p>
          <p className="mt-2 text-[22px] font-semibold leading-none text-emerald-700">R$ 32.680</p>
          <p className="mt-2 text-[12px] text-slate-500">8 entradas</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Despesas</p>
          <p className="mt-2 text-[22px] font-semibold leading-none text-rose-600">R$ 14.139</p>
          <p className="mt-2 text-[12px] text-slate-500">21 lançamentos</p>
        </div>
      </div>

      <div className="grid gap-4 p-4 pt-0 lg:grid-cols-[1fr_250px]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[14px] font-semibold text-slate-900">Receitas e despesas</h3>
            <div className="flex items-center gap-3 text-[11px] text-slate-500" aria-hidden="true">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Receitas</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />Despesas</span>
            </div>
          </div>
          <div className="mt-5 flex h-[176px] items-end gap-2 border-b border-slate-200 px-1">
            {CHART_BARS.map((bar) => (
              <div key={bar.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div className="flex h-full items-end gap-1">
                  <span className="w-full rounded-t bg-emerald-400" style={{ height: `${bar.income}%` }} />
                  <span className="w-full rounded-t bg-rose-400" style={{ height: `${bar.expense}%` }} />
                </div>
                <span className="mt-2 text-center text-[10px] text-slate-500">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-[14px] font-semibold text-slate-900">Próximos compromissos</h3>
          <div className="mt-4 grid gap-3">
            {[
              { label: 'Aluguel', date: '10 Jul', value: '-R$ 2.500', tone: 'expense' },
              { label: 'Cliente Alfa', date: '18 Jul', value: 'R$ 4.850', tone: 'income' },
              { label: 'Cartão', date: '22 Jul', value: '-R$ 1.280', tone: 'expense' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className={item.tone === 'income' ? 'h-2.5 w-2.5 rounded-full bg-emerald-500' : 'h-2.5 w-2.5 rounded-full bg-rose-500'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-slate-900">{item.label}</span>
                  <span className="block text-[11px] text-slate-500">{item.date}</span>
                </span>
                <span className={item.tone === 'income' ? 'text-[12px] font-semibold text-emerald-700' : 'text-[12px] font-semibold text-rose-600'}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FuncionalidadesPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login');
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);

  const openLogin = () => {
    setLoginMode('login');
    setLoginOpen(true);
  };

  const openRegister = () => {
    setLoginMode('register');
    setLoginOpen(true);
  };

  const closeLogin = () => {
    setLoginOpen(false);
    setLoginMode('login');
  };

  return (
    <div className="min-h-screen bg-[#f8fbfb] text-slate-950">
      <SiteHeader tone="light" onOpenLogin={openLogin} />

      <SitePageHero
        tone="light"
        label="FUNCIONALIDADES"
        title="Funcionalidades do FINGERENCE"
        description="Uma visão clara para registrar, acompanhar e analisar sua rotina financeira sem depender de planilhas espalhadas."
      />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1800px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] xl:px-10 xl:py-16">
          <div className="min-w-0">
            <Label text="Rotina financeira" />
            <h2 className="mt-5 text-[clamp(28px,2.5vw,46px)] font-light leading-[1.14] tracking-[0.02em] text-slate-950">
              Do lançamento ao relatório, tudo fica conectado.
            </h2>
            <p className="mt-5 max-w-[680px] text-[15px] leading-[1.8] text-slate-600">
              Controle lançamentos, cartões, reservas e relatórios em uma sequência simples, com dados separados por perfil e sempre prontos para consulta.
            </p>
            <div className="mt-8 grid gap-4">
              {FLUXO.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[16px] font-semibold text-slate-950">{title}</span>
                    <span className="mt-1 block text-[14px] leading-[1.65] text-slate-600">{description}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#f8fbfb]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-16">
          <div className="max-w-[760px]">
            <Label text="Módulos principais" />
            <h2 className="mt-5 text-[clamp(28px,2.3vw,44px)] font-light leading-[1.16] text-slate-950">
              Recursos para finanças pessoais e empresariais.
            </h2>
            <p className="mt-4 text-[15px] leading-[1.75] text-slate-600">
              As principais áreas do sistema trabalham juntas para reduzir retrabalho e deixar o saldo mais confiável no dia a dia.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {MODULOS.map((modulo) => (
              <ModuleCard key={modulo.title} {...modulo} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-16">
          <Label text="Antes e depois" />
          <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-[24px] font-light leading-tight text-slate-950">Sem o FINGERENCE</h3>
              <ul className="mt-5 grid gap-3 text-[14px] text-slate-600">
                {ANTES.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <XCircle className="h-4 w-4 shrink-0 text-rose-500" strokeWidth={1.9} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <div className="flex items-center justify-center text-brand-700">
              <div className="h-px w-12 bg-brand-200 lg:hidden" />
              <ArrowRight className="hidden h-7 w-7 lg:block" aria-hidden="true" />
            </div>

            <article className="rounded-lg border border-brand-200 bg-brand-50/55 p-6">
              <h3 className="text-[24px] font-light leading-tight text-slate-950">Com o FINGERENCE</h3>
              <ul className="mt-5 grid gap-3 text-[14px] text-slate-700">
                {DEPOIS.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-700" strokeWidth={1.9} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#eef8f9]">
        <div className="mx-auto grid max-w-[1800px] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center xl:px-10 xl:py-16">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#08343d] text-white">
              <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <Label text="Segurança e privacidade" />
              <h2 className="mt-4 text-[clamp(28px,2.2vw,42px)] font-light leading-[1.15] text-slate-950">
                Controle financeiro sem abrir sua conta bancária.
              </h2>
              <p className="mt-4 text-[15px] leading-[1.78] text-slate-600">
                O FINGERENCE trabalha com registros manuais, autenticação segura e separação de perfis. Você decide o que entra no sistema.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SEGURANCA.map((item) => (
              <div key={item} className="flex min-h-14 items-center gap-3 rounded-lg border border-white bg-white px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
                <LockKeyhole className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#08343d] text-white">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-5 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between xl:px-10">
          <div className="max-w-[760px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">Comece agora</p>
            <h2 className="mt-4 text-[clamp(26px,2.2vw,42px)] font-light leading-[1.16]">
              Abra sua conta e acompanhe sua rotina financeira com mais clareza desde o primeiro mês.
            </h2>
          </div>
          <button
            type="button"
            onClick={openRegister}
            className="site-neon-button inline-flex h-12 w-full items-center justify-center rounded-xl border px-7 text-[12px] font-semibold uppercase tracking-[0.14em] sm:w-auto"
          >
            Testar grátis
          </button>
        </div>
      </section>

      <SiteFooter
        tone="light"
        onOpenTermos={() => setModalAberto('termos')}
        onOpenPrivacidade={() => setModalAberto('privacidade')}
      />

      <LoginModal isOpen={loginOpen} onClose={closeLogin} initialMode={loginMode} tone="light" />
      <TermosModal open={modalAberto !== null} tipo={modalAberto ?? 'termos'} onClose={() => setModalAberto(null)} />
      {!loginOpen && modalAberto === null && <CookieBanner />}
    </div>
  );
}
