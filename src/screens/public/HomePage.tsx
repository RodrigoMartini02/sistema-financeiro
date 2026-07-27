import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  LockKeyhole, RotateCcw, ShieldCheck, Star, Zap,
} from 'lucide-react';
import { SiteFooter } from './components/SiteFooter';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { HomeHeader } from './components/HomeHeader';
import { HeroDashboardPreview } from './components/HeroDashboardPreview';
import { HomeBenefitsSection } from './components/HomeBenefitsSection';
import { HomeHowItWorksSection } from './components/HomeHowItWorksSection';
import { CookieBanner } from '../../components/CookieBanner';
import { apiRequest } from '../../services/apiClient';

interface Avaliacao {
  id: number;
  autor: string;
  estrelas: number;
  comentario: string;
  data_criacao: string;
}


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
      <HomeHeader onOpenLogin={openLogin} onOpenRegister={openRegister} />

      <main id="conteudo-principal">
        {/* Hero */}
        <section className="relative isolate overflow-hidden border-b border-[rgba(30,196,220,0.13)] bg-[#03161D]">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(20,184,212,0.18),transparent_28%),radial-gradient(circle_at_50%_76%,rgba(20,184,212,0.20),transparent_34%),linear-gradient(180deg,#03161D_0%,#06232C_46%,#03161D_100%)]" />
            <div
              className="absolute inset-0 opacity-[0.22]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(93,217,234,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(93,217,234,0.16) 1px, transparent 1px)',
                backgroundSize: '86px 86px',
              }}
            />
            <div className="absolute left-1/2 top-[39%] hidden h-[860px] w-[1180px] -translate-x-1/2 rounded-[50%] border border-[rgba(20,184,212,0.07)] md:block" />
            <div className="absolute left-1/2 top-[45%] hidden h-[700px] w-[980px] -translate-x-1/2 rounded-[50%] border border-[rgba(20,184,212,0.08)] md:block" />
            <div className="absolute left-1/2 top-[55%] hidden h-px w-[84vw] max-w-[1220px] -translate-x-1/2 bg-gradient-to-r from-transparent via-site-accent/18 to-transparent md:block" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#03161D] via-[#03161D]/74 to-transparent" />
          </div>

          <div className="relative mx-auto max-w-[1760px] px-5 pb-8 pt-5 sm:px-8 sm:pt-6 lg:px-10 lg:pb-10 lg:pt-5">
            <div className="mx-auto max-w-[1120px] text-center">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(30,196,220,0.20)] bg-[rgba(8,42,52,0.70)] px-5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_60px_rgba(0,0,0,0.20)]">
                <ShieldCheck className="h-4 w-4 text-site-accent" aria-hidden="true" />
                <span className="text-[12px] font-semibold uppercase tracking-[0.22em] text-site-text">
                  <span className="text-site-accent">15 DIAS GRÁTIS</span> · SEM CARTÃO
                </span>
              </div>

              <h1 className="mt-4 text-[clamp(34px,3.8vw,60px)] font-semibold leading-[1.07] tracking-[-0.03em] text-site-text text-balance">
                Clareza para cuidar do seu dinheiro e fazer sua empresa crescer.
              </h1>

              <p className="mx-auto mt-3 max-w-[760px] text-[clamp(15px,1.15vw,19px)] leading-[1.5] text-site-textSub">
                Controle sua vida financeira e sua empresa em perfis separados, com saldos, cartões, reservas e relatórios sempre organizados.
              </p>

              <div className="mx-auto mt-5 grid max-w-[590px] gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openRegister}
                  className="site-neon-button inline-flex min-h-12 items-center justify-center rounded-xl border px-6 text-[15px] font-semibold"
                >
                  Começar grátis
                </button>
                <Link
                  to="/funcionalidades"
                  className="site-neon-button site-neon-button-subtle inline-flex min-h-12 items-center justify-center rounded-xl border px-6 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-site-accent/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#03161D]"
                >
                  Explorar funcionalidades
                </Link>
              </div>

              <ul className="mx-auto mt-3 grid max-w-[720px] gap-2 text-left text-[13px] text-site-textSub sm:grid-cols-3 sm:text-center">
                {[
                  { icon: Zap, text: 'Configuração rápida' },
                  { icon: LockKeyhole, text: 'Privacidade por padrão' },
                  { icon: RotateCcw, text: 'Cancele quando quiser' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center justify-center gap-2 rounded-xl px-2 py-1.5">
                    <Icon className="h-5 w-5 shrink-0 text-site-accent" aria-hidden="true" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <HeroDashboardPreview />
          </div>
        </section>

        <HomeBenefitsSection />

        <HomeHowItWorksSection onOpenRegister={openRegister} />

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

      </main>

      <SiteFooter
        onOpenTermos={() => setModalAberto('termos')}
        onOpenPrivacidade={() => setModalAberto('privacidade')}
      />

      <LoginModal isOpen={loginOpen} onClose={closeLogin} notice={notice} initialMode={loginMode} />

      <TermosModal open={modalAberto !== null} tipo={modalAberto ?? 'termos'} onClose={() => setModalAberto(null)} />

      <CookieBanner />
    </div>
  );
}
