import { Link } from 'react-router-dom';
import { BadgePercent, Eye, RefreshCw, ShieldCheck, type LucideIcon } from 'lucide-react';
import { formatPriceCents, FREE_TRIAL_DAYS, TENDERS_PRICE } from '../../utils/sitePricing';
import { CallToAction } from './components/CallToAction';
import { PageIntro } from './components/PageIntro';
import { ScrollReveal } from './components/ScrollReveal';
import { SolutionCards } from './components/SolutionCards';
import { ON_DARK_BUTTON, SECTION_LABEL, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './components/siteStyles';

interface Principle {
  icon: LucideIcon;
  title: string;
  description: string;
}

const PRINCIPLES: Principle[] = [
  { icon: Eye, title: 'Clareza', description: 'Saldos, prazos e valores à vista, sem números escondidos.' },
  { icon: ShieldCheck, title: 'Privacidade', description: 'Nada ligado ao seu banco, e os dados do cartão ficam com o Mercado Pago.' },
  {
    icon: BadgePercent,
    title: 'Preço justo',
    description: `A partir de ${formatPriceCents(TENDERS_PRICE.baseCents)} por mês, com ${FREE_TRIAL_DAYS} dias grátis para testar.`,
  },
  { icon: RefreshCw, title: 'Melhoria contínua', description: 'Cada solução evolui com o uso real e com o retorno de quem usa.' },
];

/** Quem é a FINGERENCE e o que guia o trabalho. */
export function AboutPage() {
  return (
    <>
      <PageIntro
        label="Sobre"
        title="Tecnologia simples para decidir com clareza."
        description="A FINGERENCE nasceu para organizar as finanças sem planilhas soltas. Hoje também ajuda empresas a encontrar as licitações certas. O que nos move é o mesmo: transformar informação espalhada em decisões claras."
      />

      <section className={SITE_SECTION}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>O que nos guia</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Clareza antes de tudo.</h2>
          </ScrollReveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map(({ icon: Icon, title, description }, index) => (
              <ScrollReveal key={title} delay={index * 0.05}>
                <div className="h-full rounded-[24px] border border-slate-200 bg-white p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e6f6f8] text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-[18px] font-semibold text-slate-950">{title}</h3>
                  <p className="mt-2 text-[15px] leading-[1.7] text-slate-600">{description}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className={`${SITE_SECTION} border-t border-slate-200/70`}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Nossas soluções</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Feitas para o seu dia a dia.</h2>
          </ScrollReveal>
          <div className="mt-10">
            <SolutionCards />
          </div>
        </div>
      </section>

      <CallToAction title="Quer conversar?" text="Dúvidas, sugestões ou parcerias: fale com a gente.">
        <Link to="/contato/" className={ON_DARK_BUTTON}>
          Fale com a gente
        </Link>
      </CallToAction>
    </>
  );
}
