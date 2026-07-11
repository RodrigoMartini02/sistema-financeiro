import { useState } from 'react';
import {
  BarChart3, BookOpen, CheckCircle2, CreditCard,
  Layers, ListPlus, ShieldCheck, XCircle,
} from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { SitePageHero } from './components/SitePageHero';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { CookieBanner } from '../../components/CookieBanner';

const MODULOS = [
  {
    icon: Layers,
    title: 'Despesas',
    description: 'Lance despesas simples, parceladas ou recorrentes. Vincule ao cartão, categorize e acompanhe o impacto em cada mês.',
  },
  {
    icon: BarChart3,
    title: 'Receitas',
    description: 'Registre receitas únicas ou recorrentes. Separe por perfil — pessoal ou empresarial — e visualize o histórico por período.',
  },
  {
    icon: BookOpen,
    title: 'Reservas',
    description: 'Crie reservas para metas e emergências. Movimentações de depósito e resgate impactam diretamente o saldo disponível.',
  },
  {
    icon: ListPlus,
    title: 'Cadastro em Lote',
    description: 'Registre múltiplas despesas ou receitas no mesmo modal em uma única operação. Ideal para perfis empresariais com volume alto.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios',
    description: 'Gráficos por categoria, evolução mensal, comparativos entre períodos. Tudo em uma visão clara e exportável.',
  },
  {
    icon: CreditCard,
    title: 'Cartão de Crédito',
    description: 'Controle o limite real disponível descontando parcelas em aberto e recorrências. Evite surpresas na fatura.',
  },
];

const ANTES = [
  'Planilhas desatualizadas',
  'Lançamentos duplicados',
  'Saldo sempre uma dúvida',
  'Parcelas perdidas no tempo',
  'Finanças pessoais e empresariais misturadas',
  'Sem visão do histórico',
];

const DEPOIS = [
  'Tudo em um lugar, sempre atualizado',
  'Lançamentos únicos, parcelados e recorrentes',
  'Saldo calculado automaticamente',
  'Parcelas rastreadas mês a mês',
  'Perfis separados para cada contexto',
  'Relatórios e gráficos por período',
];

const SEGURANCA = [
  'TLS/HTTPS', 'Bcrypt', 'JWT', 'Perfis isolados',
  'Sem acesso bancário', 'Dados criptografados',
];

function PremiumCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)] transition duration-500 ease-out hover:-translate-y-[3px] hover:border-[rgba(14,196,216,0.36)] hover:bg-[rgba(14,196,216,0.04)] hover:shadow-[0_0_32px_rgba(14,196,216,0.10),inset_0_0_24px_rgba(14,196,216,0.03)] ${className}`}>
      {children}
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <p className="text-[11px] uppercase tracking-[0.26em] text-site-textMuted">{text}</p>;
}

export function FuncionalidadesPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);

  return (
    <div className="min-h-screen bg-[#040E12] text-site-text">
      <SiteHeader onOpenLogin={() => setLoginOpen(true)} />

      <SitePageHero
        label="FUNCIONALIDADES"
        title="Uma plataforma completa para suas finanças"
        description="Do lançamento mais simples à análise mais sofisticada — o FINGERENCE cobre todos os cenários financeiros do seu dia a dia."
      />

      {/* Módulos */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
        <div className="mx-auto max-w-[1800px] px-5 py-12 sm:px-8 xl:px-10 xl:py-16">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {MODULOS.map(({ icon: Icon, title, description }) => (
              <PremiumCard key={title} className="group p-7">
                <Icon className="h-5 w-5 text-site-textMuted transition duration-500 group-hover:text-site-accent group-hover:drop-shadow-[0_0_12px_rgba(14,196,216,0.7)]" />
                <h2 className="mt-4 text-[clamp(20px,1.5vw,26px)] leading-[1.2] text-site-text">{title}</h2>
                <p className="mt-3 text-[14px] leading-[1.7] text-site-textSub">{description}</p>
              </PremiumCard>
            ))}
          </div>

          {/* Antes / Depois */}
          <div className="mt-5">
            <PremiumCard className="p-6">
              <Label text="ANTES E DEPOIS DO FINGERENCE" />
              <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
                <div className="rounded-xl border border-[rgba(14,196,216,0.10)] bg-[#061419]/70 p-5">
                  <h4 className="text-[clamp(20px,1.6vw,28px)] leading-tight text-site-text">Sem o FINGERENCE</h4>
                  <ul className="mt-4 space-y-3 text-[14px] text-site-textSub">
                    {ANTES.map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <XCircle className="h-4 w-4 shrink-0 text-red-400" strokeWidth={1.9} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-center px-2 text-site-accent">
                  <div className="h-px w-8 bg-site-accent/50 md:hidden" />
                  <div className="hidden text-[28px] font-light md:block">→</div>
                </div>
                <div className="rounded-xl border border-[rgba(14,196,216,0.20)] bg-[#061419]/70 p-5">
                  <h4 className="text-[clamp(20px,1.6vw,28px)] leading-tight text-site-text">Com o FINGERENCE</h4>
                  <ul className="mt-4 space-y-3 text-[14px] text-site-textSub">
                    {DEPOIS.map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-site-accent" strokeWidth={1.9} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </PremiumCard>
          </div>

          {/* Segurança */}
          <div className="mt-5">
            <PremiumCard className="p-6">
              <div className="flex items-start gap-6 md:items-center">
                <div className="flex-1">
                  <Label text="SEGURANÇA E PRIVACIDADE" />
                  <p className="mt-2 text-[15px] text-site-textSub">
                    Seus dados financeiros são seus. O FINGERENCE não acessa sua conta bancária — você registra manualmente com total controle.
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {SEGURANCA.map((item) => (
                      <div key={item} className="rounded-lg border border-[rgba(14,196,216,0.12)] bg-[rgba(14,196,216,0.02)] px-2 py-2.5 text-center text-[11px] text-site-textSub">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 rounded-full border border-site-accent/30 bg-[radial-gradient(circle,rgba(14,196,216,0.14),transparent_66%)] p-5 shadow-[0_0_30px_rgba(14,196,216,0.12)]">
                  <ShieldCheck className="h-10 w-10 text-site-accent" />
                </div>
              </div>
            </PremiumCard>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#061419]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-20">
          <div className="relative overflow-hidden rounded-[24px] border border-[rgba(14,196,216,0.24)] bg-[linear-gradient(135deg,rgba(14,196,216,0.04),rgba(14,196,216,0.01)_52%,rgba(14,196,216,0.03))] p-8 sm:p-10">
            <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">COMECE AGORA</p>
            <h2 className="mt-4 text-[clamp(26px,2.2vw,44px)] font-light leading-[1.14] tracking-[0.02em] text-site-text text-balance">
              Comece a controlar suas finanças hoje.
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
