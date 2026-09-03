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
      'Conta empresa com clientes e representantes',
      'Cadastro em lote de despesas e receitas',
      'Exportação de dados',
      'Suporte prioritário',
    ],
  },
];

const COMPARATIVO = [
  { item: 'Controle mensal de receitas e despesas', plus: true, premium: true },
  { item: 'Reservas financeiras', plus: true, premium: true },
  { item: 'Cartão de crédito', plus: true, premium: true },
  { item: 'Parcelas e recorrências avançadas', plus: true, premium: true },
  { item: 'Relatórios detalhados', plus: true, premium: true },
  { item: 'Categorias personalizadas', plus: true, premium: true },
  { item: 'Múltiplos perfis (pessoal + CNPJ)', plus: false, premium: true },
  { item: 'Conta empresa (clientes e representantes)', plus: false, premium: true },
  { item: 'Cadastro em lote', plus: false, premium: true },
  { item: 'Exportação de dados', plus: false, premium: true },
  { item: 'Suporte prioritário', plus: false, premium: true },
];

const FAQ = [
  { q: 'Preciso de cartão de crédito para começar?', a: 'Não. Crie sua conta sem nenhum dado de pagamento e use o sistema completo por 15 dias.' },
  { q: 'O que acontece depois dos 15 dias de avaliação?', a: 'Ao final do período de avaliação, você escolhe um plano para continuar. Seus dados ficam preservados independentemente do plano escolhido.' },
  { q: 'Posso mudar de plano depois?', a: 'Sim. Você pode migrar entre Plus e Premium a qualquer momento. Todos os seus dados são preservados — nenhum lançamento se perde.' },
  { q: 'O que acontece com meus dados se eu cancelar?', a: 'Seus dados ficam disponíveis por 30 dias após o cancelamento. Você pode exportá-los antes de encerrar a conta.' },
];

export function PlanosPage() {
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
        label="PLANOS"
        title="Escolha o plano certo para você."
        description="15 dias grátis ao criar conta. Depois, Plus ou Premium — sem surpresas."
      />

      <section className="border-b border-slate-200 bg-[#f8fbfb]">
        <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-16">
          <p className="mb-6 text-center text-[13px] text-slate-500">
            Todos os planos incluem <span className="font-semibold text-slate-950">15 dias grátis</span> ao criar a conta.
          </p>
          <div className="mx-auto grid gap-5 md:grid-cols-2 xl:max-w-[900px]">
            {PLANOS.map((plano) => (
              <article
                key={plano.nome}
                className={[
                  'relative flex min-w-0 flex-col overflow-hidden rounded-lg border p-7 transition duration-300',
                  plano.destaque
                    ? 'border-brand-300 bg-[#eef8f9] shadow-[0_22px_64px_rgba(8,52,61,0.12)]'
                    : 'border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.05)]',
                ].join(' ')}
              >
                {plano.destaque && (
                  <span className="absolute right-5 top-5 rounded-full border border-brand-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700">
                    Mais completo
                  </span>
                )}
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">{plano.nome}</p>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-[clamp(32px,2.4vw,44px)] font-light leading-none text-slate-950">{plano.preco}</span>
                  {plano.periodo && <span className="mb-1 text-[13px] text-slate-500">{plano.periodo}</span>}
                </div>
                <p className="mt-3 text-[13px] leading-[1.6] text-slate-600">{plano.descricao}</p>
                <div className="mt-5 h-px w-full bg-slate-200" />
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plano.funcionalidades.map((funcionalidade) => (
                    <li key={funcionalidade} className="flex items-center gap-3 text-[13px] text-slate-600">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand-700" strokeWidth={1.9} />
                      {funcionalidade}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={openRegister}
                  className={[
                    plano.destaque ? 'site-neon-light-button' : 'site-neon-light-button-subtle',
                    'mt-8 inline-flex h-10 w-full items-center justify-center rounded-xl border text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-300',
                  ].join(' ')}
                >
                  {plano.cta}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1800px] px-5 py-12 sm:px-8 xl:px-10 xl:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">COMPARATIVO</p>
          <div className="mt-7 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
            <table className="w-full min-w-[720px]">
              <thead className="bg-[#eef8f9]">
                <tr className="border-b border-slate-200">
                  <th className="py-4 pl-5 pr-6 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Funcionalidade</th>
                  <th className="px-4 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Plus</th>
                  <th className="px-4 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">Premium</th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIVO.map(({ item, plus, premium }) => (
                  <tr key={item} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-3 pl-5 pr-6 text-[14px] text-slate-600">{item}</td>
                    <td className="px-4 py-3 text-center">
                      {plus
                        ? <CheckCircle2 className="mx-auto h-4 w-4 text-brand-700" strokeWidth={1.9} />
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {premium
                        ? <CheckCircle2 className="mx-auto h-4 w-4 text-brand-700" strokeWidth={1.9} />
                        : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#eef8f9]">
        <div className="mx-auto max-w-[860px] px-5 py-12 sm:px-8 xl:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">DÚVIDAS SOBRE PLANOS</p>
          <div className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
            {FAQ.map(({ q, a }, idx) => {
              const isOpen = faqOpen === idx;
              return (
                <div key={q} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setFaqOpen(isOpen ? null : idx)}
                    className="site-neon-row-button group flex w-full items-center justify-between gap-6 px-6 py-5 text-left transition duration-300"
                  >
                    <span className="text-[15px] leading-[1.45] text-slate-950">{q}</span>
                    <span className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition', isOpen ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 group-hover:border-brand-300'].join(' ')}>
                      <Plus className={['h-4 w-4 transition duration-300', isOpen ? 'rotate-45' : ''].join(' ')} />
                    </span>
                  </button>
                  <div className={['grid transition-all duration-300 ease-out', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'].join(' ')}>
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 pr-16 text-[14px] leading-[1.75] text-slate-600">{a}</p>
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
          <div className="max-w-[760px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">COMECE AGORA</p>
            <h2 className="mt-4 text-[clamp(26px,2.2vw,42px)] font-light leading-[1.16]">
              Comece a controlar suas finanças hoje.
            </h2>
          </div>
          <button
            type="button"
            onClick={openRegister}
            className="site-neon-button inline-flex h-12 w-full items-center justify-center rounded-xl border px-7 text-[12px] font-semibold uppercase tracking-[0.14em] sm:w-auto"
          >
            Criar conta grátis
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
