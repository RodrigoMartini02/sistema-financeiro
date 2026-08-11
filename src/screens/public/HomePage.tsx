import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { SitePageHero } from './components/SitePageHero';
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
    <div className="min-h-screen bg-[#f8fbfb] text-slate-950">
      <SiteHeader tone="light" onOpenLogin={openLogin} />

      <main id="conteudo-principal">
        <SitePageHero
          tone="light"
          label="HOME"
          title="Controle financeiro com clareza."
          description="Organize sua vida financeira e sua empresa em perfis separados, com saldos, cartões, reservas e relatórios sempre visíveis."
        />
        <section className="public-light-panel border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-[1800px] px-5 py-10 sm:px-8 xl:px-10 xl:py-12">
            <div className="max-w-[1800px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700">VISÃO DO SISTEMA</p>
              <h2 className="mt-4 text-[clamp(26px,2.2vw,42px)] font-light leading-[1.16] tracking-[0.02em] text-slate-950">
                Painel financeiro organizado desde o primeiro acesso.
              </h2>
              <p className="mt-4 max-w-[680px] text-[15px] font-light leading-[1.75] text-slate-600">
                Acompanhe receitas, despesas, saldo e próximos compromissos em uma tela feita para leitura rápida e rotina diária.
              </p>
            </div>
            <HeroDashboardPreview />
          </div>
        </section>
        <HomeBenefitsSection />

        <HomeHowItWorksSection onOpenRegister={openRegister} />

      {/* ── Avaliações ── */}
      {avaliacoes.length > 0 && (
        <section className="border-b border-slate-200 bg-[#f8fbfb]">
          <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-18">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700">O QUE DIZEM OS USUÁRIOS</p>
            <div className="mt-3 flex items-center gap-3">
              <StarRating n={Math.round(media)} />
              <span className="text-[13px] text-slate-500">
                {media.toFixed(1)} · {totalAval} {totalAval === 1 ? 'avaliação' : 'avaliações'}
              </span>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {avaliacoes.slice(0, 6).map((av) => (
                <article
                  key={av.id}
                  className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] transition duration-300 hover:border-brand-200 hover:shadow-[0_20px_54px_rgba(15,23,42,0.08)]"
                >
                  <StarRating n={av.estrelas} />
                  <p className="mt-3 text-[14px] leading-[1.7] text-slate-600">"{av.comentario}"</p>
                  <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-slate-500">{av.autor}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      </main>

      <SiteFooter
        tone="light"
        onOpenTermos={() => setModalAberto('termos')}
        onOpenPrivacidade={() => setModalAberto('privacidade')}
      />

      <LoginModal isOpen={loginOpen} onClose={closeLogin} notice={notice} initialMode={loginMode} tone="light" />

      <TermosModal open={modalAberto !== null} tipo={modalAberto ?? 'termos'} onClose={() => setModalAberto(null)} />

      {!loginOpen && modalAberto === null && <CookieBanner />}
    </div>
  );
}
