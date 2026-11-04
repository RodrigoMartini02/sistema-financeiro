import type { ReactNode } from 'react';
import { ScrollReveal } from './ScrollReveal';
import { SECTION_LABEL, SITE_CONTAINER } from './siteStyles';

interface PageIntroProps {
  label: string;
  title: string;
  description?: string;
  /** Botões da página, abaixo do texto. */
  children?: ReactNode;
}

/** Abertura das páginas internas: rótulo, título (h1), texto e botões. */
export function PageIntro({ label, title, description, children }: PageIntroProps) {
  return (
    <section className="border-b border-slate-200/70">
      <div className={`${SITE_CONTAINER} pb-14 pt-16 sm:pb-20 sm:pt-24`}>
        <ScrollReveal>
          <p className={SECTION_LABEL}>{label}</p>
          <h1 className="mt-5 max-w-[900px] text-[clamp(36px,4.6vw,64px)] font-light leading-[1.06] tracking-[-0.02em] text-slate-950 text-balance">
            {title}
          </h1>
          {description && <p className="mt-6 max-w-[700px] text-[18px] leading-[1.7] text-slate-600">{description}</p>}
          {children && <div className="mt-9 flex flex-wrap gap-3">{children}</div>}
        </ScrollReveal>
      </div>
    </section>
  );
}
