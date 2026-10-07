import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Headphones, Wallet } from 'lucide-react';
import { COMPANY_TAGLINE, SITE_SOLUTIONS, SOLUTION_NAMES, SOLUTION_TAGLINES } from '../../brand';
import { pageOfSolution, PRODUCTS_PATH } from '../../utils/publicPages';
import { FINANCE_PLAN_PRICES_CENTS, formatPriceCents, FREE_TRIAL_DAYS, TENDERS_PRICE } from '../../utils/sitePricing';
import { CallToAction } from './components/CallToAction';
import { HeroVideo } from './components/HeroVideo';
import { ReviewsSection } from './components/ReviewsSection';
import { ScrollReveal } from './components/ScrollReveal';
import {
  ON_DARK_BUTTON,
  ON_DARK_SECONDARY_BUTTON,
  SECONDARY_BUTTON,
  SECTION_LABEL,
  SECTION_TEXT,
  SECTION_TITLE,
  SITE_CONTAINER,
  SITE_SECTION,
  TEXT_LINK,
} from './components/siteStyles';

const STARTING_PRICE_CENTS = Math.min(FINANCE_PLAN_PRICES_CENTS.starter, TENDERS_PRICE.baseCents);

const HOW_WE_WORK = [
  {
    icon: CalendarCheck,
    title: `${FREE_TRIAL_DAYS} dias grátis`,
    description: 'Teste qualquer solução antes de pagar. Sem cartão de crédito.',
  },
  {
    icon: Wallet,
    title: `A partir de ${formatPriceCents(STARTING_PRICE_CENTS)}/mês`,
    description: 'Preço justo e sem surpresa, por Pix ou cartão. Cancele quando quiser.',
  },
  {
    icon: Headphones,
    title: 'Atendimento direto',
    description: 'Fale com a gente por e-mail ou WhatsApp, sem robô no caminho.',
  },
];

/** Início da empresa: o conceito, o que fazemos, como trabalhamos e o caminho para as soluções. */
export function HomePage() {
  return (
    <>
      <HeroVideo
        title={COMPANY_TAGLINE}
        description="Criamos ferramentas simples para quem precisa decidir bem: sobre o dinheiro da casa e da empresa, e sobre novas oportunidades de negócio."
      >
        <Link to={PRODUCTS_PATH} className={ON_DARK_BUTTON}>
          Conheça nossas soluções
        </Link>
        <Link to="/contato/" className={ON_DARK_SECONDARY_BUTTON}>
          Fale com a gente
        </Link>
      </HeroVideo>

      <section className={SITE_SECTION}>
        <div className={`${SITE_CONTAINER} grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16`}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>A FINGERENCE</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Informação espalhada vira decisão clara.</h2>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <p className={SECTION_TEXT}>
              Contas, cartões, editais e prazos costumam ficar em planilhas e anotações soltas. A gente organiza tudo num sistema simples,
              que funciona no computador e no celular.
            </p>
            <p className={`mt-4 ${SECTION_TEXT}`}>Você enxerga o que importa e decide com segurança, no seu ritmo.</p>
          </ScrollReveal>
        </div>
      </section>

      <section className={`${SITE_SECTION} border-y border-slate-200/70 bg-white`}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Soluções</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Duas soluções, o mesmo cuidado.</h2>
          </ScrollReveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {SITE_SOLUTIONS.map((solution, index) => (
              <ScrollReveal key={solution} delay={index * 0.06}>
                <Link
                  to={pageOfSolution(solution).path}
                  className="group flex h-full items-center justify-between gap-6 rounded-[24px] border border-slate-200 bg-[#f8fbfb] p-6 outline-none transition hover:border-brand-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-brand-400 motion-reduce:transition-none"
                >
                  <span>
                    <span className="block text-[18px] font-semibold text-slate-950">{SOLUTION_NAMES[solution]}</span>
                    <span className="mt-1 block text-[15px] text-slate-600">{SOLUTION_TAGLINES[solution]}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-brand-700 transition group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                </Link>
              </ScrollReveal>
            ))}
          </div>
          <Link to={PRODUCTS_PATH} className={`mt-8 ${TEXT_LINK}`}>
            Ver detalhes e preços
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className={SITE_SECTION}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Como trabalhamos</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Simples de começar, justo no preço.</h2>
          </ScrollReveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {HOW_WE_WORK.map(({ icon: Icon, title, description }, index) => (
              <ScrollReveal key={title} delay={index * 0.06}>
                <div className="h-full rounded-[24px] border border-slate-200 bg-white p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e6f6f8] text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-[19px] font-semibold text-slate-950">{title}</h3>
                  <p className="mt-2 text-[15px] leading-[1.7] text-slate-600">{description}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <Link to="/sobre/" className={`mt-8 ${SECONDARY_BUTTON}`}>
            Quem somos
          </Link>
        </div>
      </section>

      <ReviewsSection />

      <CallToAction title="Pronto para decidir com mais clareza?" text={`Escolha a solução certa e teste grátis por ${FREE_TRIAL_DAYS} dias.`}>
        <Link to={PRODUCTS_PATH} className={ON_DARK_BUTTON}>
          Conheça nossas soluções
        </Link>
        <Link to="/contato/" className={ON_DARK_SECONDARY_BUTTON}>
          Fale com a gente
        </Link>
      </CallToAction>
    </>
  );
}
