import { Link } from 'react-router-dom';
import { COMPANY_NAME, COMPANY_TAGLINE, SITE_SOLUTIONS, SOLUTION_NAMES, SUPPORT_CONTACT } from '../../brand';
import { pageOfSolution } from '../../utils/publicPages';
import { formatPriceCents, FREE_TRIAL_DAYS, STARTING_PRICE_CENTS } from '../../utils/sitePricing';
import { CallToAction } from './components/CallToAction';
import { HeroVideo } from './components/HeroVideo';
import { ReviewsSection } from './components/ReviewsSection';
import { ScrollReveal } from './components/ScrollReveal';
import { SolutionCards } from './components/SolutionCards';
import {
  ON_DARK_BUTTON,
  ON_DARK_SECONDARY_BUTTON,
  SECONDARY_BUTTON,
  SECTION_LABEL,
  SECTION_TEXT,
  SECTION_TITLE,
  SITE_CONTAINER,
  SITE_SECTION,
} from './components/siteStyles';

/** "Como trabalhamos": o número em destaque, a linha que o completa e o detalhe. */
const HOW_WE_WORK = [
  {
    value: `${FREE_TRIAL_DAYS} dias`,
    caption: 'de avaliação gratuita',
    description: 'Acesso completo para avaliar a solução, sem cadastrar cartão de crédito.',
  },
  {
    value: `${formatPriceCents(STARTING_PRICE_CENTS)}/mês`,
    caption: 'no plano de entrada',
    description: 'Sem fidelidade, com pagamento por Pix ou cartão.',
  },
  {
    value: SUPPORT_CONTACT.responseTime,
    caption: 'de prazo de resposta',
    description: 'Atendimento humano por e-mail e WhatsApp.',
  },
];

/** Início da empresa: a frase da empresa, por que ela existe, as soluções e como trabalhamos. */
export function HomePage() {
  return (
    <>
      <HeroVideo
        title={COMPANY_TAGLINE}
        description={`A ${COMPANY_NAME} desenvolve sistemas que eliminam tarefas manuais, organizam a informação e entregam a visão necessária para decidir com segurança.`}
      >
        <a href="#solucoes" className={ON_DARK_BUTTON}>
          Conhecer as soluções
        </a>
        <Link to="/contato/" className={ON_DARK_SECONDARY_BUTTON}>
          Falar com a equipe
        </Link>
      </HeroVideo>

      <section className={SITE_SECTION}>
        <div className={`${SITE_CONTAINER} grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16`}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Por que a {COMPANY_NAME}</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Do dado disperso à gestão com método.</h2>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <p className={SECTION_TEXT}>
              Lançamentos, cartões, editais e prazos costumam se espalhar por planilhas, e-mails e anotações. Nossos sistemas
              automatizam o que é repetitivo e reúnem essas informações em um só ambiente, acessível pelo computador e pelo celular.
            </p>
            <p className={`mt-4 ${SECTION_TEXT}`}>
              O resultado é previsibilidade: saber o que entra, o que sai e qual oportunidade merece a sua atenção.
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section id="solucoes" className={`${SITE_SECTION} scroll-mt-20 border-y border-slate-200/70 bg-white`}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Soluções</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Uma solução para cada frente do seu negócio.</h2>
          </ScrollReveal>
          <div className="mt-10">
            <SolutionCards />
          </div>
        </div>
      </section>

      <section className={SITE_SECTION}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Como trabalhamos</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Condições claras desde o primeiro acesso.</h2>
          </ScrollReveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {HOW_WE_WORK.map(({ value, caption, description }, index) => (
              <ScrollReveal key={caption} delay={index * 0.06}>
                <div className="h-full rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
                  <p className="text-[clamp(28px,3.2vw,44px)] font-light leading-none tracking-[-0.02em] text-brand-700">{value}</p>
                  <p className="mt-3 text-[15px] font-semibold text-slate-950">{caption}</p>
                  <p className="mt-2 text-[15px] leading-[1.7] text-slate-600">{description}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <Link to="/sobre/" className={`mt-8 ${SECONDARY_BUTTON}`}>
            Conheça a {COMPANY_NAME}
          </Link>
        </div>
      </section>

      <ReviewsSection />

      <CallToAction title="Comece sua avaliação gratuita hoje." text={`${FREE_TRIAL_DAYS} dias de acesso completo, sem cartão de crédito.`}>
        {SITE_SOLUTIONS.map((solution) => (
          <Link key={solution} to={pageOfSolution(solution).path} className={ON_DARK_BUTTON}>
            {SOLUTION_NAMES[solution]}
          </Link>
        ))}
      </CallToAction>
    </>
  );
}
