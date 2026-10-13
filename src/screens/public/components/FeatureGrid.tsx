import type { Icon } from '@phosphor-icons/react';
import { ScrollReveal } from './ScrollReveal';
import { ICON_TILE, SECTION_LABEL, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './siteStyles';

export interface FeatureItem {
  icon: Icon;
  title: string;
  description: string;
}

/** Colunas no computador; no tablet são 2 e no celular, 1. */
const DESKTOP_COLUMNS = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
} as const;

interface FeatureGridProps {
  label: string;
  title: string;
  items: FeatureItem[];
  columns?: keyof typeof DESKTOP_COLUMNS;
}

/** Recursos de uma solução ou princípios da empresa em cards, com ícone, título e uma frase. */
export function FeatureGrid({ label, title, items, columns = 3 }: FeatureGridProps) {
  return (
    <section className={SITE_SECTION}>
      <div className={SITE_CONTAINER}>
        <ScrollReveal>
          <p className={SECTION_LABEL}>{label}</p>
          <h2 className={`mt-4 max-w-[760px] ${SECTION_TITLE}`}>{title}</h2>
        </ScrollReveal>
        <div className={`mt-10 grid gap-5 sm:grid-cols-2 ${DESKTOP_COLUMNS[columns]}`}>
          {items.map(({ icon: ItemIcon, title: itemTitle, description }, index) => (
            <ScrollReveal key={itemTitle} delay={Math.min(index * 0.05, 0.2)}>
              <article className="h-full rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
                <span className={ICON_TILE}>
                  <ItemIcon size={26} weight="duotone" aria-hidden="true" />
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
