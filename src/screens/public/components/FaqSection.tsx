import { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import { SECTION_LABEL, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './siteStyles';

export interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSectionProps {
  title: string;
  items: FaqItem[];
}

/** Perguntas frequentes em acordeão: uma aberta por vez. */
export function FaqSection({ title, items }: FaqSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();

  return (
    <section className={`${SITE_SECTION} border-t border-slate-200/70`}>
      <div className={`${SITE_CONTAINER} grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16`}>
        <ScrollReveal>
          <p className={SECTION_LABEL}>Perguntas</p>
          <h2 className={`mt-4 ${SECTION_TITLE}`}>{title}</h2>
        </ScrollReveal>
        <ScrollReveal delay={0.08}>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
            {items.map(({ question, answer }, index) => {
              const isOpen = openIndex === index;
              const panelId = `${baseId}-resposta-${index}`;
              return (
                <div key={question}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left text-[16px] font-semibold text-slate-950 outline-none transition hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 motion-reduce:transition-none"
                    >
                      {question}
                      <Plus
                        className={['h-5 w-5 shrink-0 text-brand-700 transition motion-reduce:transition-none', isOpen ? 'rotate-45' : ''].join(' ')}
                        aria-hidden="true"
                      />
                    </button>
                  </h3>
                  <div id={panelId} hidden={!isOpen} className="px-6 pb-6 text-[15px] leading-[1.75] text-slate-600">
                    {answer}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
