import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, BookOpen, CreditCard, Layers, ShieldCheck, Star, TrendingUp,
} from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { HeroLogoDecor } from './components/HeroLogoDecor';
import { CookieBanner } from '../../components/CookieBanner';
import { apiRequest } from '../../services/apiClient';

interface Avaliacao {
  id: number;
  autor: string;
  estrelas: number;
  comentario: string;
  data_criacao: string;
}

const PILARES = [
  {
    icon: ShieldCheck,
    title: 'Controle Total',
    description: 'Abra e feche meses com saldo calculado automaticamente. Cada lançamento no lugar certo, sem surpresas.',
  },
  {
    icon: TrendingUp,
    title: 'Visibilidade Real',
    description: 'Relatórios e gráficos que mostram para onde seu dinheiro vai — por categoria, por mês, por perfil.',
  },
  {
    icon: BarChart3,
    title: 'Múltiplos Perfis',
    description: 'Separe finanças pessoais e empresariais em perfis independentes. Cada um com seu saldo, lançamentos e relatórios.',
  },
];

const MODULOS = [
  {
    icon: Layers,
    title: 'Despesas e Receitas',
    description: 'Registre lançamentos únicos, parcelados ou recorrentes. Categorize e acompanhe tudo em tempo real.',
  },
  {
    icon: CreditCard,
    title: 'Cartão de Crédito',
    description: 'Controle limite, faturas e parcelas sem perder o fio. Saiba exatamente quanto do limite está comprometido.',
  },
  {
    icon: BookOpen,
    title: 'Reservas Financeiras',
    description: 'Separe dinheiro para metas e emergências. As reservas aparecem no saldo disponível para você nunca se surpreender.',
  },
];

function StarRating({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={i < n ? 'fill-site-accent text-site-accent' : 'text-site-textMuted'}
        />
      ))}
    </div>
  );
}

interface HomePageProps {
  notice?: string;
}

export function HomePage({ notice }: HomePageProps) {
  const [loginOpen, setLoginOpen] = useState(
    () => !!notice || new URLSearchParams(window.location.search).get('state') === 'google-oauth',
  );
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);

  const avaliacoesQ = useQuery({
    queryKey: ['avaliacoes-public'],
    queryFn: () =>
      apiRequest<{ success: boolean; data: { avaliacoes: Avaliacao[]; media: number; total: number } }>(
        '/avaliacoes',
      ),
    staleTime: 10 * 60 * 1000,
  });
  const avaliacoes: Avaliacao[] = (avaliacoesQ.data as any)?.data?.avaliacoes ?? [];
  const media: number = (avaliacoesQ.data as any)?.data?.media ?? 0;
  const totalAval: number = (avaliacoesQ.data as any)?.data?.total ?? 0;

  return (
    <div className="min-h-screen bg-[#040E12] text-site-text">
      <SiteHeader onOpenLogin={() => setLoginOpen(true)} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-[rgba(14,196,216,0.10)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_46%,rgba(14,196,216,0.07),transparent_52%),radial-gradient(circle_at_82%_20%,rgba(14,196,216,0.04),transparent_38%)]" />

        <HeroLogoDecor />
        <div className="relative mx-auto flex min-h-[560px] max-w-[1800px] flex-col justify-center px-5 pb-16 pt-24 sm:px-8 lg:min-h-[640px] lg:pt-[140px] xl:px-10">
          <p className="text-[11px] uppercase tracking-[0.42em] text-site-textMuted">
            CONTROLE FINANCEIRO INTELIGENTE
          </p>
          <h1
            className="mt-7 max-w-[860px] text-[clamp(40px,4vw,70px)] font-light leading-[1.12] tracking-[0.08em] text-site-text"
            style={{ textShadow: '0 0 32px rgba(14,196,216,0.20)' }}
          >
            <span className="block">ORGANIZE SUAS</span>
            <span className="block">FINANÇAS COM CLAREZA</span>
          </h1>
          <div className="mt-7 h-px w-[280px] bg-gradient-to-r from-site-accent via-[rgba(14,196,216,0.42)] to-transparent shadow-[0_0_18px_rgba(14,196,216,0.46)]" />
          <p className="mt-7 max-w-[640px] text-[clamp(16px,1.1vw,19px)] font-light leading-[1.65] text-site-textSub">
            Despesas, receitas, reservas e cartões em um único lugar.{' '}
            <strong className="font-medium text-site-text">Perfis separados</strong> para finanças pessoais e empresariais.
          </p>
          <p className="mt-3 text-[13px] text-site-textMuted">
            60 dias grátis — sem cartão de crédito.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="inline-flex h-12 items-center rounded-xl border border-site-accent/50 bg-[rgba(14,196,216,0.08)] px-7 text-[12px] uppercase tracking-[0.18em] text-site-text transition duration-300 hover:border-site-accent hover:bg-[rgba(14,196,216,0.14)] hover:shadow-[0_0_28px_rgba(14,196,216,0.22)]"
            >
              Começar — 60 dias grátis
            </button>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="inline-flex h-12 items-center rounded-xl border border-[rgba(14,196,216,0.18)] px-7 text-[12px] uppercase tracking-[0.18em] text-site-textMuted transition duration-300 hover:border-[rgba(14,196,216,0.40)] hover:text-site-text"
            >
              Já tenho conta
            </button>
          </div>
        </div>
      </section>

      {/* ── Pilares ── */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-18">
          <div className="grid gap-5 md:grid-cols-3">
            {PILARES.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="group min-w-0 overflow-hidden rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-7 transition duration-500 ease-out hover:-translate-y-[3px] hover:border-[rgba(14,196,216,0.40)] hover:bg-[rgba(14,196,216,0.04)] hover:shadow-[0_0_32px_rgba(14,196,216,0.12),inset_0_0_24px_rgba(14,196,216,0.04)]"
              >
                <Icon className="h-6 w-6 shrink-0 text-site-textMuted transition duration-500 group-hover:text-site-accent group-hover:drop-shadow-[0_0_12px_rgba(14,196,216,0.7)]" />
                <h2 className="mt-5 text-[clamp(20px,1.5vw,26px)] leading-[1.24] tracking-[0.01em] text-site-text">
                  {title}
                </h2>
                <p className="mt-4 text-[15px] leading-[1.72] text-site-textSub">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Módulos ── */}
      <section className="relative overflow-hidden border-b border-[rgba(14,196,216,0.10)] bg-[#061419]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_34%,rgba(14,196,216,0.04),transparent_32%)]" />
        <div className="relative mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-18">
          <div className="grid gap-10 xl:grid-cols-[1fr_1.2fr] xl:items-start">
            <div className="xl:pt-2">
              <p className="text-[11px] uppercase tracking-[0.34em] text-site-textMuted">MÓDULOS PRINCIPAIS</p>
              <h2
                className="mt-5 max-w-[580px] text-[clamp(30px,2.6vw,52px)] font-light leading-[1.12] tracking-[0.025em] text-site-text"
                style={{ textShadow: '0 0 22px rgba(14,196,216,0.12)' }}
              >
                Tudo o que você precisa para controlar seu dinheiro.
              </h2>
              <div className="mt-6 h-px w-[200px] bg-gradient-to-r from-site-accent/80 via-[rgba(14,196,216,0.38)] to-transparent shadow-[0_0_18px_rgba(14,196,216,0.34)]" />
              <p className="mt-6 max-w-[580px] text-[16px] font-light leading-[1.78] text-site-textSub">
                Do lançamento simples ao cartão parcelado — o FINGERENCE cobre todos os cenários do seu dia a dia financeiro.
              </p>
            </div>
            <div className="grid items-stretch gap-4 sm:grid-cols-1">
              {MODULOS.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-[rgba(14,196,216,0.14)] bg-[linear-gradient(145deg,rgba(14,196,216,0.04),rgba(14,196,216,0.01)_52%,rgba(14,196,216,0.025))] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.18)] transition duration-500 ease-out hover:-translate-y-[3px] hover:border-[rgba(14,196,216,0.36)] hover:shadow-[0_0_30px_rgba(14,196,216,0.10),inset_0_0_24px_rgba(14,196,216,0.03)]"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-site-accent/25 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />
                  <div className="flex items-start gap-4">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-site-accent" />
                    <div>
                      <h3 className="text-[19px] leading-[1.28] tracking-[0.01em] text-site-text">{title}</h3>
                      <p className="mt-2 text-[14px] font-light leading-[1.72] text-site-textSub">{description}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Avaliações ── */}
      {avaliacoes.length > 0 && (
        <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
          <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-18">
            <p className="text-[11px] uppercase tracking-[0.34em] text-site-textMuted">O QUE DIZEM OS USUÁRIOS</p>
            <div className="mt-3 flex items-center gap-3">
              <StarRating n={Math.round(media)} />
              <span className="text-[13px] text-site-textMuted">
                {media.toFixed(1)} · {totalAval} {totalAval === 1 ? 'avaliação' : 'avaliações'}
              </span>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {avaliacoes.slice(0, 6).map((av) => (
                <article
                  key={av.id}
                  className="min-w-0 overflow-hidden rounded-xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-6 transition duration-300 hover:border-[rgba(14,196,216,0.30)] hover:shadow-[0_0_24px_rgba(14,196,216,0.08)]"
                >
                  <StarRating n={av.estrelas} />
                  <p className="mt-3 text-[14px] leading-[1.7] text-site-textSub">"{av.comentario}"</p>
                  <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-site-textMuted">{av.autor}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <section className="bg-[#061419]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-20">
          <div className="relative overflow-hidden rounded-[24px] border border-[rgba(14,196,216,0.24)] bg-[linear-gradient(135deg,rgba(14,196,216,0.04),rgba(14,196,216,0.01)_52%,rgba(14,196,216,0.03))] p-8 shadow-[0_30px_110px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(14,196,216,0.08)] sm:p-10 xl:p-12">
            <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-[rgba(14,196,216,0.05)] blur-3xl" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">COMECE AGORA</p>
            <h2
              className="mt-5 text-[clamp(28px,2.4vw,50px)] font-light leading-[1.13] tracking-[0.025em] text-site-text text-balance"
              style={{ textShadow: '0 0 24px rgba(14,196,216,0.10)' }}
            >
              Suas finanças organizadas em menos de 5 minutos.
            </h2>
            <div className="mt-6 h-px w-[200px] bg-gradient-to-r from-site-accent/72 via-[rgba(14,196,216,0.34)] to-transparent shadow-[0_0_18px_rgba(14,196,216,0.28)]" />
            <p className="mt-5 max-w-[640px] text-[16px] font-light leading-[1.82] text-site-textSub">
              Configure perfis pessoais e empresariais e tenha visibilidade real das suas finanças desde o primeiro acesso.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="inline-flex h-11 items-center rounded-xl border border-site-accent/50 bg-[rgba(14,196,216,0.08)] px-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-site-text transition duration-300 hover:border-site-accent hover:bg-[rgba(14,196,216,0.14)] hover:shadow-[0_0_26px_rgba(14,196,216,0.20)]"
              >
                Criar conta grátis
              </button>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter
        onOpenTermos={() => setModalAberto('termos')}
        onOpenPrivacidade={() => setModalAberto('privacidade')}
      />

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} notice={notice} />

      <TermosModal open={modalAberto !== null} tipo={modalAberto ?? 'termos'} onClose={() => setModalAberto(null)} />

      <CookieBanner />
    </div>
  );
}
