import type { ReactNode } from 'react';
import { parseLegalText, type LegalBlock } from '../../utils/legalText';
import { PageIntro } from './components/PageIntro';
import { SITE_CONTAINER, SITE_SECTION } from './components/siteStyles';
import { PRIVACY_CONTENT, TERMS_CONTENT } from './legalContent';

type LegalPageType = 'termos' | 'privacidade';

const LEGAL_PAGES: Record<LegalPageType, { label: string; title: string; content: string }> = {
  termos: { label: 'Termos', title: 'Termos de Uso', content: TERMS_CONTENT },
  privacidade: { label: 'Privacidade e LGPD', title: 'Política de Privacidade', content: PRIVACY_CONTENT },
};

/** Títulos viram h2, itens seguidos viram uma lista e o resto vira parágrafo. */
function renderLegalBlocks(blocks: LegalBlock[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let items: string[] = [];

  const flushItems = () => {
    if (items.length === 0) return;
    nodes.push(
      <ul key={`lista-${nodes.length}`} className="ml-5 list-disc space-y-1.5 text-[15px] leading-[1.75] text-slate-600">
        {items.map((item, itemIndex) => (
          <li key={itemIndex}>{item}</li>
        ))}
      </ul>,
    );
    items = [];
  };

  blocks.forEach((block, index) => {
    if (block.kind === 'item') {
      items.push(block.text);
      return;
    }
    flushItems();
    nodes.push(
      block.kind === 'heading' ? (
        <h2 key={index} className="pt-6 text-[18px] font-semibold leading-[1.35] text-slate-950 first:pt-0">
          {block.text}
        </h2>
      ) : (
        <p key={index} className="text-[15px] leading-[1.8] text-slate-600">
          {block.text}
        </p>
      ),
    );
  });
  flushItems();
  return nodes;
}

export function LegalPage({ type }: { type: LegalPageType }) {
  const page = LEGAL_PAGES[type];

  return (
    <>
      <PageIntro label={page.label} title={page.title} />
      <section className={SITE_SECTION}>
        <div className={SITE_CONTAINER}>
          <article className="mx-auto max-w-[860px] space-y-3 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-10">
            {renderLegalBlocks(parseLegalText(page.content))}
          </article>
        </div>
      </section>
    </>
  );
}
