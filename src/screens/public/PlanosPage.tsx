import { useState } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { SitePageHero } from './components/SitePageHero';
import { LoginModal } from './components/LoginModal';
import { TermosModal } from './TermosModal';
import { CookieBanner } from '../../components/CookieBanner';

const PLANOS = [
  {
    nome: 'Plus',
    preco: 'R$ 4,99',
    periodo: '/mês',
    descricao: 'Controle completo das finanças pessoais.',
    destaque: false,
    cta: 'Assinar Plus',
    funcionalidades: [
      'Controle mensal de receitas e despesas',
      'Cartão de crédito',
      'Parcelas e recorrências avançadas',
      'Reservas financeiras',
      'Relatórios detalhados',
      'Categorias personalizadas',
    ],
  },
  {
    nome: 'Premium',
    preco: 'R$ 9,99',
    periodo: '/mês',
    descricao: 'Para quem precisa de múltiplos perfis e funcionalidades avançadas.',
    destaque: true,
    cta: 'Assinar Premium',
    funcionalidades: [
      'Tudo do Plus',
      'Múltiplos perfis (pessoal + CNPJ)',
      'Perfil empresa com clientes e representantes',
      'Cadastro em lote de despesas e receitas',
      'Exportação de dados',
      'Suporte prioritário',
    ],
  },
];

const COMPARATIVO = [
  { item: 'Controle mensal de receitas e despesas',    plus: true,  premium: true  },
  { item: 'Reservas financeiras',                      plus: true,  premium: true  },
  { item: 'Cartão de crédito',                         plus: true,  premium: true  },
  { item: 'Parcelas e recorrências avançadas',         plus: true,  premium: true  },
  { item: 'Relatórios detalhados',                     plus: true,  premium: true  },
  { item: 'Categorias personalizadas',                 plus: true,  premium: true  },
  { item: 'Múltiplos perfis (pessoal + CNPJ)',         plus: false, premium: true  },
  { item: 'Perfil empresa (clientes e representantes)',plus: false, premium: true  },
  { item: 'Cadastro em lote',                          plus: false, premium: true  },
  { item: 'Exportação de dados',                       plus: false, premium: true  },
  { item: 'Suporte prioritário',                       plus: false, premium: true  },
];

const FAQ = [
  { q: 'Preciso de cartão de crédito para começar?', a: 'Não. Crie sua conta sem nenhum dado de pagamento e use o sistema completo por 60 dias.' },
  { q: 'O que acontece depois dos 60 dias de avaliação?', a: 'Ao final do período de avaliação, você escolhe um plano para continuar. Seus dados ficam preservados independentemente do plano escolhido.' },
  { q: 'Posso mudar de plano depois?', a: 'Sim. Você pode migrar entre Plus e Premium a qualquer momento. Todos os seus dados são preservados — nenhum lançamento se perde.' },
  { q: 'O que acontece com meus dados se eu cancelar?', a: 'Seus dados ficam disponíveis por 30 dias após o cancelamento. Você pode exportá-los antes de encerrar a conta.' },
];

export function PlanosPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [modalAberto, setModalAberto] = useState<'termos' | 'privacidade' | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#040E12] text-site-text">
      <SiteHeader onOpenLogin={() => setLoginOpen(true)} />

      <SitePageHero
        label="PLANOS"
        title="Escolha o plano certo para você."
        description="60 dias grátis ao criar conta. Depois, Plus ou Premium — sem surpresas."
      />

      {/* Cards de planos */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-18">
          <p className="mb-6 text-center text-[13px] text-site-textMuted">
            Todos os planos incluem <span className="text-site-text">60 dias grátis</span> ao criar a conta.
          </p>
          <div className="mx-auto grid gap-5 md:grid-cols-2 xl:max-w-[860px]">
            {PLANOS.map((plano) => (
              <div
                key={plano.nome}
                className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border p-7 transition duration-300 ${
                  plano.destaque
                    ? 'border-site-accent/40 bg-[linear-gradient(145deg,rgba(14,196,216,0.06),rgba(14,196,216,0.02)_52%,rgba(14,196,216,0.04))] shadow-[0_0_40px_rgba(14,196,216,0.10)]'
                    : 'border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)]'
                }`}
              >
                {plano.destaque && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-site-accent/50 to-transparent" />
                )}
                <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">{plano.nome}</p>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-[clamp(28px,2.2vw,42px)] font-light leading-none text-site-text">{plano.preco}</span>
                  {plano.periodo && <span className="mb-1 text-[13px] text-site-textMuted">{plano.periodo}</span>}
                </div>
                <p className="mt-3 text-[13px] font-light leading-[1.6] text-site-textSub">{plano.descricao}</p>
                <div className="mt-5 h-px w-full bg-[rgba(14,196,216,0.10)]" />
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plano.funcionalidades.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-[13px] text-site-textSub">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-site-accent" strokeWidth={1.9} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  className={`mt-8 inline-flex h-10 w-full items-center justify-center rounded-xl text-[11px] uppercase tracking-[0.14em] transition duration-300 ${
                    plano.destaque
                      ? 'border border-site-accent/50 bg-[rgba(14,196,216,0.08)] text-site-text hover:border-site-accent hover:bg-[rgba(14,196,216,0.14)] hover:shadow-[0_0_22px_rgba(14,196,216,0.16)]'
                      : 'border border-[rgba(14,196,216,0.18)] text-site-textSub hover:border-[rgba(14,196,216,0.36)] hover:text-site-text'
                  }`}
                >
                  {plano.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparativo */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#061419]">
        <div className="mx-auto max-w-[1800px] px-5 py-12 sm:px-8 xl:px-10 xl:py-16">
          <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">COMPARATIVO</p>
          <div className="mt-7 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(14,196,216,0.10)]">
                  <th className="py-3 pr-6 text-left text-[11px] uppercase tracking-[0.18em] font-normal text-site-textMuted">Funcionalidade</th>
                  <th className="px-4 py-3 text-center text-[11px] uppercase tracking-[0.18em] font-normal text-site-textMuted">Plus</th>
                  <th className="px-4 py-3 text-center text-[11px] uppercase tracking-[0.18em] font-normal text-site-accent">Premium</th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIVO.map(({ item, plus, premium }) => (
                  <tr key={item} className="border-b border-[rgba(14,196,216,0.06)] last:border-b-0">
                    <td className="py-3 pr-6 text-[14px] text-site-textSub">{item}</td>
                    <td className="px-4 py-3 text-center">
                      {plus
                        ? <CheckCircle2 className="mx-auto h-4 w-4 text-site-accent" strokeWidth={1.9} />
                        : <span className="text-site-textMuted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {premium
                        ? <CheckCircle2 className="mx-auto h-4 w-4 text-site-accent" strokeWidth={1.9} />
                        : <span className="text-site-textMuted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
        <div className="mx-auto max-w-[860px] px-5 py-12 sm:px-8 xl:py-16">
          <p className="text-[11px] uppercase tracking-[0.30em] text-site-textMuted">DÚVIDAS SOBRE PLANOS</p>
          <div className="mt-7 overflow-hidden rounded-2xl border border-[rgba(14,196,216,0.14)] bg-[rgba(14,196,216,0.02)]">
            {FAQ.map(({ q, a }, idx) => {
              const isOpen = faqOpen === idx;
              return (
                <div key={q} className="border-b border-[rgba(14,196,216,0.08)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setFaqOpen(isOpen ? null : idx)}
                    className="group flex w-full items-center justify-between gap-6 px-6 py-5 text-left transition hover:bg-[rgba(14,196,216,0.03)]"
                  >
                    <span className="text-[15px] leading-[1.45] text-site-text">{q}</span>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${isOpen ? 'border-site-accent/70 bg-[rgba(14,196,216,0.08)]' : 'border-[rgba(14,196,216,0.24)] text-site-textMuted'}`}>
                      <Plus className={`h-4 w-4 transition duration-300 ${isOpen ? 'rotate-45 text-site-accent' : ''}`} />
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 pr-16 text-[14px] leading-[1.75] text-site-textSub">{a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#061419]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-20">
          <div className="relative overflow-hidden rounded-[24px] border border-[rgba(14,196,216,0.24)] bg-[linear-gradient(135deg,rgba(14,196,216,0.04),rgba(14,196,216,0.01)_52%,rgba(14,196,216,0.03))] p-8 sm:p-10">
            <p className="text-[11px] uppercase tracking-[0.28em] text-site-textMuted">COMECE HOJE</p>
            <h2 className="mt-4 text-[clamp(26px,2.2vw,44px)] font-light leading-[1.14] tracking-[0.02em] text-site-text">
              60 dias grátis para explorar tudo.
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
