import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, BarChart3, BookOpen, Calendar, CheckCircle2, ChevronDown,
  CreditCard, LayoutDashboard, Layers, Lock, ShieldCheck,
  Star, TrendingDown, TrendingUp, UserPlus,
} from 'lucide-react';
import { LoginPage } from './LoginPage';
import { TermosModal } from './TermosModal';
import { CookieBanner } from '../../components/CookieBanner';
import { apiRequest } from '../../services/apiClient';

interface LandingPageProps {
  notice?: string;
}

interface Avaliacao {
  id: number;
  autor: string;
  estrelas: number;
  comentario: string;
  data_criacao: string;
}

const HERO_BENEFITS = [
  'Abra e feche meses com saldo calculado automaticamente',
  'Controle cartões, parcelas e recorrências em um lugar',
  'Separe finanças pessoais das empresariais com perfis independentes',
  'Visualize sua saúde financeira com relatórios e gráficos',
];

const BENTO_CHART = [
  { label: 'Alimentação', pct: 62 },
  { label: 'Transporte', pct: 38 },
  { label: 'Casa', pct: 84 },
  { label: 'Lazer', pct: 28 },
  { label: 'Saúde', pct: 50 },
];

const COMO_FUNCIONA = [
  {
    icon: UserPlus,
    num: '01',
    title: 'Crie sua conta grátis',
    desc: 'Sem cartão de crédito. Nome, e-mail e pronto — menos de 1 minuto e você já está dentro.',
  },
  {
    icon: Layers,
    num: '02',
    title: 'Configure seus perfis',
    desc: 'Adicione perfis para finanças pessoais e cada empresa. Cartões, categorias e recorrências em minutos.',
  },
  {
    icon: BarChart3,
    num: '03',
    title: 'Registre e acompanhe',
    desc: 'Lance receitas, despesas e reservas. Veja o saldo em tempo real e relatórios por categoria.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'O FINGERENCE é gratuito?',
    a: 'Sim, o FINGERENCE é gratuito para começar. Crie sua conta sem cartão de crédito e comece a controlar suas finanças hoje mesmo.',
  },
  {
    q: 'Posso separar finanças pessoais das empresariais?',
    a: 'Sim. O FINGERENCE permite criar perfis independentes — um para uso pessoal e outros para cada empresa ou CNPJ. Os dados de cada perfil são completamente separados.',
  },
  {
    q: 'Como funciona o controle por mês?',
    a: 'Você abre um mês, registra receitas e despesas ao longo do período e fecha ao final. O saldo final fica registrado e serve de base para o mês seguinte.',
  },
  {
    q: 'O FINGERENCE acessa minha conta bancária?',
    a: 'Não. O FINGERENCE não acessa sua conta bancária. Você registra os lançamentos manualmente, mantendo total controle e privacidade sobre seus dados.',
  },
  {
    q: 'Meus dados financeiros ficam seguros?',
    a: 'Sim. Seus dados são armazenados com criptografia TLS/HTTPS, senhas com hash bcrypt e sessões autenticadas via JWT. Nunca compartilhamos suas informações com terceiros.',
  },
  {
    q: 'Posso usar em vários dispositivos ao mesmo tempo?',
    a: 'Sim. O FINGERENCE funciona no navegador de qualquer dispositivo — computador, celular ou tablet. Basta acessar com sua conta e os dados ficam sincronizados.',
  },
];

function StarRating({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={13}
          className={i < n ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}
        />
      ))}
    </div>
  );
}

export function LandingPage({ notice }: LandingPageProps) {
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login');
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const avaliacoesQ = useQuery({
    queryKey: ['avaliacoes-public'],
    queryFn: () => apiRequest<{ success: boolean; data: { avaliacoes: Avaliacao[]; media: number; total: number } }>('/avaliacoes'),
    staleTime: 10 * 60 * 1000,
  });
  const avaliacoes = (avaliacoesQ.data as any)?.data?.avaliacoes ?? [];
  const media = (avaliacoesQ.data as any)?.data?.media ?? 0;
  const totalAval = (avaliacoesQ.data as any)?.data?.total ?? 0;

  const openRegister = () => {
    setLoginMode('register');
    document.getElementById('login-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/icons/logo.png" alt="FINGERENCE" className="h-20 w-20 object-contain" />
            <div>
              <p className="leading-none tracking-[0.22em] text-white" style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, fontStyle: 'italic' }}>FINGERENCE</p>
              <p className="text-[10px] font-medium leading-none text-slate-400 mt-0.5">Sistema financeiro</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <button onClick={() => scrollTo('funcionalidades')} className="hover:text-white transition">Funcionalidades</button>
            <button onClick={() => scrollTo('como-funciona')} className="hover:text-white transition">Como Funciona</button>
            <button onClick={() => scrollTo('faq')} className="hover:text-white transition">FAQ</button>
            <button onClick={() => scrollTo('contato')} className="hover:text-white transition">Contato</button>
          </nav>
          <button
            onClick={() => {
              setLoginMode('login');
              document.getElementById('login-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            Entrar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Hero + Login */}
        <div className="grid gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-16 lg:py-20">
          {/* Hero */}
          <section>
            {notice && (
              <div className="mb-6 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {notice}
              </div>
            )}

            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3.5 py-1 text-xs font-semibold text-cyan-300">
              <CheckCircle2 size={13} />
              Gestão financeira completa
            </div>

            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Controle total das{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                suas finanças
              </span>
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-400">
              Organize meses, acompanhe saldos, registre lançamentos e visualize sua saúde financeira com gráficos e relatórios detalhados.
            </p>

            <ul className="mt-6 space-y-2.5">
              {HERO_BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-cyan-400" />
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={openRegister}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-600/30 hover:opacity-90 transition"
              >
                <ArrowRight size={17} />
                Criar conta grátis
              </button>
              <a
                href="#login-panel"
                className="sm:hidden inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition"
              >
                Entrar na minha conta
              </a>
            </div>
          </section>

          {/* Login panel */}
          <section
            id="login-panel"
            className="rounded-2xl border border-white/10 bg-white p-5 sm:p-7 text-slate-950 shadow-2xl shadow-black/40 lg:sticky lg:top-24"
          >
            <LoginPage key={loginMode} initialMode={loginMode} />
          </section>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-3 border-t border-white/8 py-10 sm:grid-cols-4">
          {totalAval > 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-xl border border-white/8 bg-white/4 py-4 px-3 text-center">
              <span className="text-2xl font-black text-white">
                {Number(media).toFixed(1)}<span className="text-amber-400 text-lg ml-0.5">★</span>
              </span>
              <span className="text-xs text-slate-500">{totalAval} avaliações</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 rounded-xl border border-white/8 bg-white/4 py-4 px-3 text-center">
              <Lock size={20} className="text-cyan-400 mb-1" />
              <span className="text-sm font-bold text-white">Acesso seguro</span>
              <span className="text-xs text-slate-500">JWT e sessões criptografadas</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1 rounded-xl border border-white/8 bg-white/4 py-4 px-3 text-center">
            <CheckCircle2 size={20} className="text-cyan-400 mb-1" />
            <span className="text-sm font-bold text-white">Controle total</span>
            <span className="text-xs text-slate-500">Receitas, despesas e reservas</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl border border-white/8 bg-white/4 py-4 px-3 text-center">
            <Layers size={20} className="text-cyan-400 mb-1" />
            <span className="text-sm font-bold text-white">Multi-empresa</span>
            <span className="text-xs text-slate-500">Perfis separados por CNPJ</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl border border-white/8 bg-white/4 py-4 px-3 text-center">
            <ShieldCheck size={20} className="text-cyan-400 mb-1" />
            <span className="text-sm font-bold text-white">LGPD compliant</span>
            <span className="text-xs text-slate-500">Dados protegidos por lei</span>
          </div>
        </div>

        {/* Features Bento Grid */}
        <section id="funcionalidades" className="border-t border-white/8 py-14">
          <div className="mb-10 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Funcionalidades</p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Tudo que você precisa</h2>
            <p className="mt-3 text-slate-400">Um sistema completo para gerenciar finanças pessoais e empresariais.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

            {/* Wide: Controle mensal */}
            <div className="sm:col-span-2 rounded-2xl bg-teal-900/50 border border-cyan-500/20 p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20">
                  <Calendar size={17} className="text-cyan-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Controle por mês</p>
                  <p className="text-xs text-slate-400">Abra e feche períodos com saldo automático</p>
                </div>
              </div>
              <div className="grid gap-1.5 mb-4">
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={13} className="text-emerald-400" />
                    <span className="text-xs text-slate-300">Salário</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">+ R$ 5.200,00</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <TrendingDown size={13} className="text-red-400" />
                    <span className="text-xs text-slate-300">Aluguel</span>
                  </div>
                  <span className="text-xs font-bold text-red-400">- R$ 1.800,00</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <TrendingDown size={13} className="text-red-400" />
                    <span className="text-xs text-slate-300">Supermercado</span>
                  </div>
                  <span className="text-xs font-bold text-red-400">- R$ 620,00</span>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-cyan-500/20 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Saldo disponível</span>
                <span className="text-xl font-black text-white">R$ 2.780,00</span>
              </div>
            </div>

            {/* Cartões de crédito */}
            <div className="rounded-2xl bg-slate-800/70 border border-white/8 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20">
                  <CreditCard size={17} className="text-blue-400" />
                </div>
                <p className="text-sm font-bold text-white">Cartões de crédito</p>
              </div>
              <p className="text-xs text-slate-400 mb-4">Limites, fechamento e vencimento em dia</p>
              <div className="space-y-3">
                {[
                  { nome: 'Nubank', pct: 35, cor: 'bg-teal-500' },
                  { nome: 'Inter', pct: 70, cor: 'bg-orange-500' },
                ].map((c) => (
                  <div key={c.nome}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">{c.nome}</span>
                      <span className="text-white font-semibold">{100 - c.pct}% disponível</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10">
                      <div className={`h-1.5 rounded-full ${c.cor}`} style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reservas */}
            <div className="rounded-2xl bg-white/4 border border-white/8 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20">
                  <BookOpen size={17} className="text-emerald-400" />
                </div>
                <p className="text-sm font-bold text-white">Reservas e metas</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Emergência 🛡️', pct: 80, cor: 'bg-emerald-500', text: 'text-emerald-400' },
                  { label: 'Viagem 🏖️',     pct: 40, cor: 'bg-amber-500',   text: 'text-amber-400'   },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-300">{r.label}</span>
                      <span className={`font-semibold ${r.text}`}>{r.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div className={`h-2 rounded-full ${r.cor}`} style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Parcelas e recorrências */}
            <div className="rounded-2xl bg-slate-800/60 border border-white/8 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20">
                  <Layers size={17} className="text-teal-400" />
                </div>
                <p className="text-sm font-bold text-white">Parcelas e recorrências</p>
              </div>
              <p className="text-xs text-slate-400 mb-4">Controle o que sai nos próximos meses</p>
              <div className="flex flex-wrap gap-2">
                {['Netflix · jun', 'Curso 2/3 · jul', 'Academia · ago', 'Seguro 3/3 · ago'].map((p) => (
                  <span key={p} className="rounded-full bg-teal-500/15 px-2.5 py-1 text-xs text-teal-300">{p}</span>
                ))}
              </div>
            </div>

            {/* Multi-empresa */}
            <div className="rounded-2xl bg-white/4 border border-white/8 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20">
                  <LayoutDashboard size={17} className="text-amber-400" />
                </div>
                <p className="text-sm font-bold text-white">Multi-empresa</p>
              </div>
              <p className="text-xs text-slate-400 mb-4">Perfis financeiros independentes</p>
              <div className="flex gap-3">
                {[
                  { label: 'Pessoal',   bg: 'bg-cyan-500',  initial: 'P' },
                  { label: 'Empresa A', bg: 'bg-emerald-500', initial: 'E' },
                  { label: '+ Novo',    bg: 'bg-white/10',    initial: '+' },
                ].map((p) => (
                  <div key={p.label} className="flex flex-col items-center gap-1.5">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${p.bg} text-xs font-bold text-white`}>
                      {p.initial}
                    </div>
                    <span className="text-[10px] text-slate-500 text-center">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Wide: Relatórios */}
            <div className="sm:col-span-2 rounded-2xl bg-amber-900/30 border border-amber-500/20 p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20">
                  <BarChart3 size={17} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Relatórios por categoria</p>
                  <p className="text-xs text-slate-400">Veja exatamente para onde o dinheiro vai</p>
                </div>
              </div>
              <div className="flex items-end gap-3" style={{ height: '72px' }}>
                {BENTO_CHART.map((bar) => (
                  <div
                    key={bar.label}
                    className="flex flex-1 flex-col items-center gap-1"
                    style={{ height: '100%', justifyContent: 'flex-end' }}
                  >
                    <div
                      className="w-full rounded-t bg-amber-400/70"
                      style={{ height: `${(bar.pct / 100) * 52}px` }}
                    />
                    <span className="text-[9px] text-slate-500 text-center leading-none truncate w-full">
                      {bar.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Segurança */}
            <div className="rounded-2xl bg-slate-800/60 border border-white/8 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20">
                  <ShieldCheck size={17} className="text-teal-400" />
                </div>
                <p className="text-sm font-bold text-white">Acesso seguro</p>
              </div>
              <p className="text-xs text-slate-400 mb-4">Seus dados protegidos em cada etapa</p>
              <div className="flex flex-col gap-2">
                {['TLS/HTTPS em todas as conexões', 'Senhas com hash bcrypt', 'Sessões via JWT com expiração', 'Conforme LGPD Lei 13.709/2018'].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs text-slate-300">
                    <Lock size={11} className="shrink-0 text-teal-400" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* Como Funciona */}
        <section id="como-funciona" className="border-t border-white/8 py-14">
          <div className="mb-10 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Como Funciona</p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Três passos e você está no controle</h2>
            <p className="mt-3 text-slate-400">Começar é mais fácil do que você imagina — leva menos de 2 minutos</p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {COMO_FUNCIONA.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.num} className="relative flex flex-col items-center text-center sm:items-start sm:text-left">
                  {i < COMO_FUNCIONA.length - 1 && (
                    <div className="absolute top-6 left-full hidden w-full items-center justify-center px-6 sm:flex">
                      <ArrowRight size={16} className="text-slate-700" />
                    </div>
                  )}
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
                    <Icon size={22} className="text-cyan-400" />
                  </div>
                  <p className="mb-1 text-xs font-black text-cyan-500">{step.num}</p>
                  <p className="mb-2 text-base font-bold text-white">{step.title}</p>
                  <p className="text-sm leading-relaxed text-slate-400">{step.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={openRegister}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-teal-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-600/30 hover:opacity-90 transition"
            >
              <ArrowRight size={16} />
              Começar agora — é grátis
            </button>
          </div>
        </section>

        {/* Avaliações */}
        {avaliacoes.length > 0 && (
          <section id="avaliacoes" className="border-t border-white/8 py-14">
            <div className="mb-8 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Avaliações</p>
                <h2 className="mt-1 text-2xl font-bold text-white">O que dizem nossos usuários</h2>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-6 py-4">
                <span className="text-3xl font-black text-white">{Number(media).toFixed(1)}</span>
                <StarRating n={Math.round(media)} />
                <span className="text-xs text-slate-500">{totalAval} avaliação{totalAval !== 1 ? 'ões' : ''}</span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {avaliacoes.slice(0, 6).map((av: Avaliacao) => (
                <div key={av.id} className="rounded-2xl border border-white/8 bg-white/4 p-5">
                  <StarRating n={av.estrelas} />
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">"{av.comentario}"</p>
                  <p className="mt-3 text-xs font-semibold text-slate-500">— {av.autor}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section id="faq" className="border-t border-white/8 py-14">
          <div className="mb-10 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Dúvidas Frequentes</p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Perguntas que todo mundo faz</h2>
            <p className="mt-3 text-slate-400">Respostas diretas, sem enrolação</p>
          </div>
          <div className="mx-auto max-w-2xl divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/8">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i}>
                <button
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-white transition hover:bg-white/4"
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  aria-expanded={faqOpen === i}
                >
                  {item.q}
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-slate-400 transition-transform duration-200 ${faqOpen === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {faqOpen === i && (
                  <div className="bg-white/4 px-5 pb-4 pt-1 text-sm leading-relaxed text-slate-400">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/8 py-14 text-center">
          <h2 className="text-2xl font-bold text-white">Comece agora, é gratuito</h2>
          <p className="mt-3 text-slate-400">Crie sua conta em segundos e tenha controle financeiro completo.</p>
          <button
            onClick={openRegister}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-teal-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-600/30 hover:opacity-90 transition"
          >
            <ArrowRight size={16} />
            Criar minha conta
          </button>
        </section>

        {/* Footer */}
        <footer id="contato" className="border-t border-white/5 py-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <img src="/icons/logo.png" alt="FINGERENCE" className="h-9 w-9 object-contain" />
              <span className="tracking-[0.15em] text-slate-500" style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 400, fontStyle: 'italic' }}>FINGERENCE</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
              <button onClick={() => setModalAberto('termos')} className="hover:text-slate-300 transition">
                Termos de Uso
              </button>
              <span>·</span>
              <button onClick={() => setModalAberto('privacidade')} className="hover:text-slate-300 transition">
                Política de Privacidade
              </button>
              <span>·</span>
              <a href="mailto:fingerence@gmail.com" className="hover:text-slate-300 transition">
                fingerence@gmail.com
              </a>
              <span>·</span>
              <a href="https://wa.me/5549999554856" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition">
                (49) 99955-4856
              </a>
            </div>

            <p className="text-xs text-slate-700">© {new Date().getFullYear()} FINGERENCE</p>
          </div>
        </footer>
      </main>

      {/* WhatsApp flutuante */}
      <a
        href="https://wa.me/5549999554856"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar via WhatsApp"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/30 hover:bg-green-600 transition"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>

      {/* Modais legais */}
      <TermosModal
        open={modalAberto !== null}
        tipo={modalAberto ?? 'termos'}
        onClose={() => setModalAberto(null)}
      />

      <CookieBanner />
    </div>
  );
}
