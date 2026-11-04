import type { ReactNode } from 'react';
import { SOLUTION_NAMES, type SiteSolution } from '../../../brand';
import { FREE_TRIAL_DAYS } from '../../../utils/sitePricing';
import { usePublicSite } from './publicSiteContext';
import { ScrollReveal } from './ScrollReveal';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION_LABEL, SITE_CONTAINER } from './siteStyles';

interface SolutionHeroProps {
  solution: SiteSolution;
  title: string;
  description: string;
  /** Tela da solução ao lado do texto. */
  media: ReactNode;
}

/** Topo da página de uma solução: a promessa, o teste grátis e a tela do sistema. */
export function SolutionHero({ solution, title, description, media }: SolutionHeroProps) {
  const { enter, startFree } = usePublicSite();

  return (
    <section className="overflow-hidden border-b border-slate-200/70">
      <div className={`${SITE_CONTAINER} grid items-center gap-12 pb-16 pt-14 sm:pb-20 sm:pt-20 lg:grid-cols-[1fr_1.15fr] lg:gap-16`}>
        <ScrollReveal>
          <p className={SECTION_LABEL}>{SOLUTION_NAMES[solution]}</p>
          <h1 className="mt-5 text-[clamp(36px,4.4vw,60px)] font-light leading-[1.06] tracking-[-0.02em] text-slate-950 text-balance">
            {title}
          </h1>
          <p className="mt-6 max-w-[560px] text-[18px] leading-[1.7] text-slate-600">{description}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <button type="button" onClick={() => startFree(solution)} className={PRIMARY_BUTTON}>
              Teste grátis por {FREE_TRIAL_DAYS} dias
            </button>
            <button type="button" onClick={() => enter(solution)} className={SECONDARY_BUTTON}>
              Já sou cliente
            </button>
          </div>
          <p className="mt-4 text-[13px] text-slate-500">Sem cartão de crédito.</p>
        </ScrollReveal>
        <ScrollReveal delay={0.08}>{media}</ScrollReveal>
      </div>
    </section>
  );
}
