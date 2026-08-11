import { useState } from 'react';
import { ArrowRight, BarChart3, BrainCircuit, Gem, Plus, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { SitePageHero } from './components/SitePageHero';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { CookieBanner } from '../../components/CookieBanner';

const VALORES = [
  {
    icon: ShieldCheck,
    title: 'Controle com propósito',
    description: 'Construído para quem leva finanças a sério, sem abrir mão da simplicidade.',
    accent: 'border-emerald-100 bg-emerald-50 text-emerald-600',
  },
  {
    icon: BarChart3,
    title: 'Visibilidade real',
    description: 'Nada de números escondidos. Cada saldo, cada parcela, cada reserva fica visível.',
    accent: 'border-cyan-100 bg-cyan-50 text-cyan-700',
  },
  {
    icon: BrainCircuit,
    title: 'Inteligência aplicada',
    description: 'IA que entende seu contexto financeiro e ajuda com análises e sugestões práticas.',
    accent: 'border-indigo-100 bg-indigo-50 text-indigo-600',
  },
  {
    icon: Gem,
    title: 'Sofisticação acessível',
    description: 'Interface premium sem custo de entrada. Gratuito para começar, completo para crescer.',
    accent: 'border-amber-100 bg-amber-50 text-amber-600',
  },
  {
    icon: Workflow,
    title: 'Evolução contínua',
    description: 'Novas funcionalidades lançadas com base no uso real e no feedback da comunidade.',
    accent: 'border-sky-100 bg-sky-50 text-sky-600',
  },
];

const DIFERENCIAIS = [
  { title: 'Perfis independentes', description: 'Separe finanças pessoais de empresariais em perfis completamente isolados dentro da mesma conta.' },
  { title: 'Saldo calculado automaticamente', description: 'Abra e feche meses com saldo real. O sistema calcula tudo com base nos lançamentos registrados.' },
  { title: 'Parcelas e recorrências', description: 'Lance uma vez e o FINGERENCE distribui automaticamente as parcelas ou replica recorrências pelos meses seguintes.' },
  { title: 'Sem acesso bancário', description: 'Total privacidade. Você registra o que quer, quando quer. Nenhuma conexão com bancos ou apps financeiros.' },
];

const FAQ = [
  { q: 'O FINGERENCE é gratuito?', a: 'Sim. Você pode começar gratuitamente sem cartão de crédito. Planos pagos oferecem funcionalidades avançadas.' },
  { q: 'Posso separar finanças pessoais das empresariais?', a: 'Sim. Crie perfis independentes para uso pessoal e cada empresa ou CNPJ. Os dados são completamente isolados.' },
  { q: 'Como funciona o controle por mês?', a: 'Você abre um mês, registra receitas e despesas ao longo do período e fecha ao final. O saldo final serve de base para o mês seguinte.' },
  { q: 'O FINGERENCE acessa minha conta bancária?', a: 'Não. O FINGERENCE não acessa sua conta bancária. Você registra os lançamentos manualmente, mantendo total controle e privacidade.' },
  { q: 'Meus dados financeiros ficam seguros?', a: 'Sim. Seus dados são armazenados com criptografia TLS/HTTPS, senhas com hash bcrypt e sessões autenticadas via JWT.' },
  { q: 'Posso usar em vários dispositivos?', a: 'Sim. O FINGERENCE funciona no navegador de qualquer dispositivo: computador, celular ou tablet.' },
];

function Label({ children, light = false }: { children: string; light?: boolean }) {
  return (
    <p className={['text-[11px] font-semibold uppercase tracking-[0.22em]', light ? 'text-cyan-200' : 'text-brand-700'].join(' ')}>
      {children}
    </p>
  );
}

export function SobrePage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login');
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

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
        label="SOBRE O FINGERENCE"
        title="Finanças organizadas com clareza e intenção."
        description="O FINGERENCE é um sistema de controle financeiro pessoal e empresarial desenvolvido para quem quer entender e dominar seu dinheiro."
      />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1800px] gap-6 px-5 py-14 sm:px-8 xl:grid-cols-[1.15fr_0.85fr] xl:px-10 xl:py-16">
          <article className="rounded-lg border border-slate-200 bg-[#f8fbfb] p-7 shadow-[0_16px_42px_rgba(15,23,42,0.05)] sm:p-8">
            <Label>Origem</Label>
            <div className="mt-5 space-y-5 text-[16px] leading-[1.85] text-slate-600">
              <p>Criado para pessoas que precisam de controle real, não de estimativas. O FINGERENCE acompanha cada lançamento, cada parcela, cada reserva e entrega um saldo que você pode confiar.</p>
              <p>Com perfis separados para finanças pessoais e empresariais, você mantém contextos distintos sem perder a visão geral. A IA integrada analisa seu histórico e responde perguntas sobre suas finanças em linguagem natural.</p>
              <p>Desenvolvido com foco em privacidade: sem integração bancária, sem rastreamento de dados e sem surpresas.</p>
            </div>
          </article>

          <div className="grid gap-4">
            {[
              ['Nossa missão', 'Dar às pessoas clareza sobre suas finanças pessoais e empresariais com uma ferramenta sofisticada, acessível e centrada na privacidade.'],
              ['Nossa visão', 'Ser referência em controle financeiro inteligente para indivíduos e pequenas empresas que valorizam autonomia e precisão.'],
            ].map(([title, description]) => (
              <article key={title} className="rounded-lg border border-brand-100 bg-brand-50/55 p-7">
                <Label>{title}</Label>
                <p className="mt-4 text-[16px] leading-[1.75] text-slate-700">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#eef8f9]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-16">
          <Label>Nossos valores</Label>
          <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            {VALORES.map(({ icon: Icon, title, description, accent }) => (
              <article key={title} className="group rounded-lg border border-slate-200 bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] transition duration-300 hover:-translate-y-0.5 hover:border-brand-200">
                <span className={['flex h-11 w-11 items-center justify-center rounded-lg border', accent].join(' ')}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold leading-[1.35] text-slate-950">{title}</h3>
                <p className="mt-3 text-[13px] leading-[1.7] text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1800px] gap-9 px-5 py-14 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] xl:px-10 xl:py-16">
          <div>
            <Label>Diferenciais</Label>
            <h2 className="mt-5 text-[clamp(28px,2.3vw,44px)] font-light leading-[1.16] text-slate-950">
              Um produto feito para rotina, não para demonstração bonita.
            </h2>
            <p className="mt-4 text-[15px] leading-[1.78] text-slate-600">
              A proposta é reduzir ruído, preservar contexto e deixar cada decisão financeira mais fácil de conferir.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {DIFERENCIAIS.map(({ title, description }) => (
              <article key={title} className="rounded-lg border border-slate-200 bg-[#f8fbfb] p-6 transition duration-300 hover:border-brand-200 hover:bg-white hover:shadow-[0_18px_46px_rgba(15,23,42,0.06)]">
                <Sparkles className="h-5 w-5 text-brand-700" aria-hidden="true" />
                <h3 className="mt-4 text-[19px] font-semibold leading-[1.35] text-slate-950">{title}</h3>
                <p className="mt-3 text-[14px] leading-[1.72] text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#f8fbfb]">
        <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 xl:py-16">
          <div className="mx-auto max-w-4xl text-center">
            <Label>Perguntas frequentes</Label>
            <h2 className="mt-5 text-[clamp(28px,2.4vw,48px)] font-light leading-[1.10] tracking-[0.02em] text-slate-950">
              Dúvidas sobre o FINGERENCE
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-[1.75] text-slate-600">
              Principais perguntas de quem está começando.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
            {FAQ.map(({ q, a }, idx) => {
              const isOpen = faqOpen === idx;
              return (
                <div key={q} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setFaqOpen(isOpen ? null : idx)}
                    className="site-neon-row-button group flex w-full items-center justify-between gap-6 px-6 py-5 text-left transition duration-300 sm:px-8"
                  >
                    <span className="text-[16px] leading-[1.45] text-slate-950">{q}</span>
                    <span className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition duration-300', isOpen ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 group-hover:border-brand-300'].join(' ')}>
                      <Plus className={['h-4 w-4 transition duration-300', isOpen ? 'rotate-45' : ''].join(' ')} />
                    </span>
                  </button>
                  <div className={['grid transition-all duration-300 ease-out', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'].join(' ')}>
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 pr-16 text-[14px] leading-[1.75] text-slate-600 sm:px-8 sm:pr-24">{a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#08343d] text-white">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-5 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between xl:px-10">
          <div className="max-w-[780px]">
            <Label light>Comece com clareza</Label>
            <h2 className="mt-4 text-[clamp(26px,2.2vw,42px)] font-light leading-[1.16]">
              Organize sua rotina financeira sem abrir mão de controle e privacidade.
            </h2>
          </div>
          <button
            type="button"
            onClick={openRegister}
            className="site-neon-button inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border px-7 text-[12px] font-semibold uppercase tracking-[0.14em] sm:w-auto"
          >
            Criar conta grátis
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
