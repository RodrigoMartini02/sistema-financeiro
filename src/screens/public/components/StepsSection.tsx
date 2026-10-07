import { ScrollReveal } from './ScrollReveal';
import { SECTION_LABEL, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './siteStyles';

export interface Step {
  title: string;
  description: string;
}

interface StepsSectionProps {
  label: string;
  title: string;
  steps: Step[];
}

/** "Como funciona": passos numerados, lado a lado no computador. */
export function StepsSection({ label, title, steps }: StepsSectionProps) {
  return (
    <section className={`${SITE_SECTION} bg-white`}>
      <div className={SITE_CONTAINER}>
        <ScrollReveal>
          <p className={SECTION_LABEL}>{label}</p>
          <h2 className={`mt-4 max-w-[760px] ${SECTION_TITLE}`}>{title}</h2>
        </ScrollReveal>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <ScrollReveal delay={index * 0.08}>
                <div className="h-full rounded-[24px] border border-slate-200 bg-[#f8fbfb] p-6">
                  <span className="text-[13px] font-semibold text-brand-700" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 text-[20px] font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-[1.7] text-slate-600">{step.description}</p>
                </div>
              </ScrollReveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
