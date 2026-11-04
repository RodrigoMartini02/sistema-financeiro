import type { ReactNode } from 'react';
import { ScrollReveal } from './ScrollReveal';
import { SITE_CONTAINER } from './siteStyles';

interface CallToActionProps {
  title: string;
  text: string;
  /** Botões (use os estilos ON_DARK_*). */
  children: ReactNode;
}

/** Chamada final, na faixa escura da marca. */
export function CallToAction({ title, text, children }: CallToActionProps) {
  return (
    <section className="bg-[#08343d] text-white">
      <div className={`${SITE_CONTAINER} py-16 text-center sm:py-24`}>
        <ScrollReveal>
          <h2 className="mx-auto max-w-[760px] text-[clamp(28px,3.2vw,48px)] font-light leading-[1.1] tracking-[-0.01em] text-balance">{title}</h2>
          <p className="mx-auto mt-5 max-w-[580px] text-[17px] leading-[1.7] text-cyan-50/80">{text}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">{children}</div>
        </ScrollReveal>
      </div>
    </section>
  );
}
