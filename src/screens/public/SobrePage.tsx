import { useState } from 'react';
import { BarChart3, BrainCircuit, Gem, Plus, ShieldCheck, Workflow } from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { SitePageHero } from './components/SitePageHero';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { CookieBanner } from '../../components/CookieBanner';

const VALORES = [
  { icon: ShieldCheck, title: 'Controle com propósito', description: 'Construído para quem leva finanças a sério, sem abrir mão da simplicidade.' },
  { icon: BarChart3, title: 'Visibilidade real', description: 'Nada de números escondidos. Cada saldo, cada parcela, cada reserva — tudo visível.' },
  { icon: BrainCircuit, title: 'Inteligência aplicada', description: 'IA que entende seu contexto financeiro e ajuda com análises e sugestões práticas.' },
  { icon: Gem, title: 'Sofisticação acessível', description: 'Interface premium sem custo de entrada. Gratuito para começar, completo para crescer.' },
  { icon: Workflow, title: 'Evolução contínua', description: 'Novas funcionalidades lançadas com base no uso real e no feedback da comunidade.' },
];

const DIFERENCIAIS = [
  { title: 'Perfis independentes', description: 'Separe finanças pessoais de empresariais em perfis completamente isolados dentro da mesma conta.' },
  { title: 'Saldo calculado automaticamente', description: 'Abra e feche meses com saldo real — o sistema calcula tudo com base nos lançamentos registrados.' },
  { title: 'Parcelas e recorrências', description: 'Lance uma vez e o FINGERENCE distribui automaticamente as parcelas ou replica recorrências pelos meses seguintes.' },
  { title: 'Sem acesso bancário', description: 'Total privacidade. Você registra o que quer, quando quer. Nenhuma conexão com bancos ou apps financeiros.' },
];

const FAQ = [
  { q: 'O FINGERENCE é gratuito?', a: 'Sim. Você pode começar gratuitamente sem cartão de crédito. Planos pagos oferecem funcionalidades avançadas.' },
  { q: 'Posso separar finanças pessoais das empresariais?', a: 'Sim. Crie perfis independentes para uso pessoal e cada empresa ou CNPJ. Os dados são completamente isolados.' },
  { q: 'Como funciona o controle por mês?', a: 'Você abre um mês, registra receitas e despesas ao longo do período e fecha ao final. O saldo final serve de base para o mês seguinte.' },
  { q: 'O FINGERENCE acessa minha conta bancária?', a: 'Não. O FINGERENCE não acessa sua conta bancária. Você registra os lançamentos manualmente, mantendo total controle e privacidade.' },
  { q: 'Meus dados financeiros ficam seguros?', a: 'Sim. Seus dados são armazenados com criptografia TLS/HTTPS, senhas com hash bcrypt e sessões autenticadas via JWT. Nunca compartilhamos suas informações com terceiros.' },
  { q: 'Posso usar em vários dispositivos?', a: 'Sim. O FINGERENCE funciona no navegador de qualquer dispositivo — computador, celular ou tablet. Os dados ficam sincronizados.' },
];

export function SobrePage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#040E12] text-site-text">
      <SiteHeader onOpenLogin={() => setLoginOpen(true)} />

      <SitePageHero
        label="SOBRE O FINGERENCE"
        title="Finanças organizadas com clareza e intenção."
        description="O FINGERENCE é um sistema de controle financeiro pessoal e empresarial desenvolvido para quem quer entender e dominar seu dinheiro."
      />

      {/* Descrição institucional */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
        <div className="mx-auto grid max-w-[1800px] gap-6 px-5 py-12 sm:px-8 xl:grid-cols-[1.2fr_1fr] xl:px-10 xl:py-16">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-8 transition duration-300 hover:border-[rgba(14,196,216,0.30)] hover:shadow-[0_0_26px_rgba(14,196,216,0.08)]">
            <div className="space-y-5 text-[16px] font-light leading-[1.85] text-site-textSub">
              <p>Criado para pessoas que precisam de controle real — não de estimativas. O FINGERENCE acompanha cada lançamento, cada parcela, cada reserva e entrega um saldo que você pode confiar.</p>
              <p>Com perfis separados para finanças pessoais e empresariais, você mantém contextos distintos sem perder a visão geral. A IA integrada analisa seu histórico e responde perguntas sobre suas finanças em linguagem natural.</p>
              <p>Desenvolvido com foco em privacidade — sem integração bancária, sem rastreamento de dados, sem surpresas.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="min-w-0 overflow-hidden rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-7 transition duration-300 hover:border-[rgba(14,196,216,0.30)] hover:shadow-[0_0_24px_rgba(14,196,216,0.08)]">
              <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">NOSSA MISSÃO</p>
              <p className="mt-4 text-[16px] font-light leading-[1.75] text-site-text">
                Dar às pessoas clareza sobre suas finanças — pessoais e empresariais — com uma ferramenta sofisticada, acessível e centrada na privacidade.
              </p>
            </div>
            <div className="min-w-0 overflow-hidden rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-7 transition duration-300 hover:border-[rgba(14,196,216,0.30)] hover:shadow-[0_0_24px_rgba(14,196,216,0.08)]">
              <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">NOSSA VISÃO</p>
              <p className="mt-4 text-[16px] font-light leading-[1.75] text-site-text">
                Ser a referência em controle financeiro inteligente para indivíduos e pequenas empresas que valorizam autonomia e precisão.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Valores */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#061419]">
        <div className="mx-auto max-w-[1800px] px-5 py-12 sm:px-8 xl:px-10 xl:py-16">
          <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">NOSSOS VALORES</p>
          <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            {VALORES.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="group min-w-0 overflow-hidden rounded-xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-6 transition hover:-translate-y-[2px] hover:border-[rgba(14,196,216,0.34)] hover:shadow-[0_0_24px_rgba(14,196,216,0.08)]"
              >
                <Icon className="h-6 w-6 shrink-0 text-site-textMuted transition group-hover:text-site-accent group-hover:drop-shadow-[0_0_10px_rgba(14,196,216,0.65)]" />
                <h3 className="mt-5 text-[17px] leading-[1.35] text-site-text">{title}</h3>
                <p className="mt-3 text-[13px] leading-[1.7] text-site-textSub">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
        <div className="mx-auto max-w-[1800px] px-5 py-12 sm:px-8 xl:px-10 xl:py-16">
          <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">DIFERENCIAIS</p>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {DIFERENCIAIS.map(({ title, description }) => (
              <article
                key={title}
                className="min-w-0 overflow-hidden rounded-xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] p-6 transition duration-300 hover:-translate-y-[2px] hover:border-[rgba(14,196,216,0.32)] hover:shadow-[0_0_22px_rgba(14,196,216,0.08)]"
              >
                <h3 className="text-[19px] leading-[1.35] text-site-text">{title}</h3>
                <p className="mt-3 text-[14px] font-light leading-[1.72] text-site-textSub">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#061419]">
        <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 xl:py-18">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-[11px] uppercase tracking-[0.30em] text-site-textMuted">PERGUNTAS FREQUENTES</p>
            <h2 className="mt-5 text-[clamp(28px,2.4vw,48px)] font-light leading-[1.10] tracking-[0.02em] text-site-text">
              Dúvidas sobre o FINGERENCE
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] font-light leading-[1.75] text-site-textSub">
              Principais perguntas de quem está começando.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)]">
            {FAQ.map(({ q, a }, idx) => {
              const isOpen = faqOpen === idx;
              return (
                <div key={q} className="border-b border-[rgba(14,196,216,0.08)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setFaqOpen(isOpen ? null : idx)}
                    className="group flex w-full items-center justify-between gap-6 px-6 py-5 text-left transition duration-300 hover:bg-[rgba(14,196,216,0.03)] sm:px-8"
                  >
                    <span className="text-[16px] leading-[1.45] text-site-text">{q}</span>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition duration-300 ${isOpen ? 'border-site-accent/70 bg-[rgba(14,196,216,0.08)] shadow-[0_0_18px_rgba(14,196,216,0.14)]' : 'border-[rgba(14,196,216,0.24)] text-site-textMuted group-hover:border-site-accent/50'}`}>
                      <Plus className={`h-4 w-4 transition duration-300 ${isOpen ? 'rotate-45 text-site-accent' : ''}`} />
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 pr-16 text-[14px] leading-[1.75] text-site-textSub sm:px-8 sm:pr-24">{a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#040E12]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-20">
          <div className="relative overflow-hidden rounded-[24px] border border-[rgba(14,196,216,0.24)] bg-[linear-gradient(135deg,rgba(14,196,216,0.04),rgba(14,196,216,0.01)_52%,rgba(14,196,216,0.03))] p-8 sm:p-10">
            <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">FINGERENCE</p>
            <h2 className="mt-4 text-[clamp(26px,2.2vw,46px)] font-light leading-[1.14] tracking-[0.02em] text-site-text text-balance">
              Comece a controlar suas finanças com clareza.
            </h2>
            <div className="mt-5 h-px w-[180px] bg-gradient-to-r from-site-accent/72 via-[rgba(14,196,216,0.34)] to-transparent" />
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="mt-7 inline-flex h-11 items-center rounded-xl border border-site-accent/50 bg-[rgba(14,196,216,0.08)] px-7 text-[11px] uppercase tracking-[0.16em] text-site-text transition hover:border-site-accent hover:bg-[rgba(14,196,216,0.14)] hover:shadow-[0_0_24px_rgba(14,196,216,0.18)]"
            >
              Criar conta grátis
            </button>
          </div>
        </div>
      </section>

      <SiteFooter
        onOpenTermos={() => setModalAberto('termos')}
        onOpenPrivacidade={() => setModalAberto('privacidade')}
      />

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      <TermosModal open={modalAberto !== null} tipo={modalAberto ?? 'termos'} onClose={() => setModalAberto(null)} />
      <CookieBanner />
    </div>
  );
}
