import { Layers, ShieldCheck, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';

interface Benefit {
  icon: LucideIcon;
  title: string;
  description: string;
}

const benefits: Benefit[] = [
  {
    icon: Layers,
    title: 'Tudo organizado, sem esforço',
    description: 'Receitas, despesas, cartões e reservas em um só lugar — sem planilhas soltas ou anotações perdidas.',
  },
  {
    icon: Zap,
    title: 'Clareza na hora',
    description: 'Veja o que entrou, o que saiu e quanto sobrou sem precisar somar nada na cabeça.',
  },
  {
    icon: ShieldCheck,
    title: 'Controle antes do aperto',
    description: 'Saiba o que está por vencer com antecedência e evite surpresas no fim do mês.',
  },
  {
    icon: Sparkles,
    title: 'Pessoal e empresa, separados',
    description: 'Mantenha suas finanças pessoais e da sua empresa em contextos independentes, sem misturar nada.',
  },
];

function BenefitIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(14,196,216,0.20)] bg-[rgba(14,196,216,0.04)] text-site-accent">
      <Icon className="h-6 w-6" aria-hidden="true" />
    </span>
  );
}

export function HomeBenefitsHighlights() {
  return (
    <section aria-labelledby="beneficios-highlights-title" className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1800px] px-5 py-14 sm:px-8 xl:px-10 xl:py-16">
        <ScrollReveal>
          <header className="mx-auto max-w-[820px] text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700">POR QUE USAR O FINGERENCE</p>
            <h2 id="beneficios-highlights-title" className="mx-auto mt-4 max-w-[720px] text-[clamp(26px,2.4vw,38px)] font-semibold leading-[1.15] text-slate-950 text-balance">
              Mais clareza para entender e controlar suas finanças.
            </h2>
          </header>
        </ScrollReveal>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {benefits.map(({ icon, title, description }, index) => (
            <ScrollReveal key={title} delay={Math.min(index * 0.05, 0.2)}>
              <article className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <BenefitIcon icon={icon} />
                <h3 className="mt-4 text-[16px] font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{description}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
