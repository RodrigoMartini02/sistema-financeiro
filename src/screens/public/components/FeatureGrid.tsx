import type { LucideIcon } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import { SECTION_LABEL, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './siteStyles';

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface FeatureGridProps {
  label: string;
  title: string;
  items: FeatureItem[];
}

/** Recursos de um módulo em cartões, com ícone, título e uma frase. */
export function FeatureGrid({ label, title, items }: FeatureGridProps) {
  return (
    <section className={SITE_SECTION}>
      <div className={SITE_CONTAINER}>
        <ScrollReveal>
          <p className={SECTION_LABEL}>{label}</p>
          <h2 className={`mt-4 max-w-[760px] ${SECTION_TITLE}`}>{title}</h2>
        </ScrollReveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title: itemTitle, description }, index) => (
            <ScrollReveal key={itemTitle} delay={Math.min(index * 0.05, 0.2)}>
              <article className="h-full rounded-[24px] border border-slate-200 bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e6f6f8] text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-[18px] font-semibold text-slate-950">{itemTitle}</h3>
                <p className="mt-2 text-[15px] leading-[1.7] text-slate-600">{description}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
