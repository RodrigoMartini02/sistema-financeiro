import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import { SITE_MEDIA } from './siteMedia';
import { SECTION_LABEL, SECTION_TEXT, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION, TEXT_LINK } from './siteStyles';

// Telas do FINGERENCE Finanças em imagem (leves), no lugar da demonstração
// embutida; quem quiser testa a demonstração em outra aba.

const DEMO_ADDRESS = '/demo.html';

interface FinanceScreen {
  key: keyof typeof SITE_MEDIA.financeScreens;
  label: string;
  description: string;
  alt: string;
}

// O topo da página já mostra os lançamentos: a galeria abre no calendário.
const SCREENS: FinanceScreen[] = [
  {
    key: 'calendar',
    label: 'Calendário',
    description: 'O mês inteiro num relance: o que entrou, o que saiu e o que vence.',
    alt: 'Calendário do FINGERENCE Finanças com receitas e despesas em cada dia do mês, com dados fictícios',
  },
  {
    key: 'entries',
    label: 'Lançamentos',
    description: 'Receitas e despesas do mês, com saldo, categoria e forma de pagamento.',
    alt: 'Tela de lançamentos do FINGERENCE Finanças com receitas, despesas e o saldo do mês, com dados fictícios',
  },
  {
    key: 'reports',
    label: 'Relatórios',
    description: 'Quanto entrou, quanto saiu e o saldo do período, lançamento por lançamento.',
    alt: 'Relatórios do FINGERENCE Finanças com receitas, despesas e saldo do período, com dados fictícios',
  },
];

/** Galeria de telas com seletor e o atalho para a demonstração. */
export function FinanceScreens() {
  const [selectedKey, setSelectedKey] = useState<FinanceScreen['key']>(SCREENS[0]?.key ?? 'calendar');
  const selected = SCREENS.find((screen) => screen.key === selectedKey) ?? SCREENS[0];

  return (
    <section className={`${SITE_SECTION} border-y border-slate-200/70 bg-white`}>
      <div className={SITE_CONTAINER}>
        <ScrollReveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[640px]">
              <p className={SECTION_LABEL}>Por dentro</p>
              <h2 className={`mt-4 ${SECTION_TITLE}`}>Simples de usar desde o primeiro dia.</h2>
              <p className={`mt-4 ${SECTION_TEXT}`}>{selected?.description}</p>
            </div>
            <a href={DEMO_ADDRESS} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
              Experimentar a demonstração
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">(abre em outra aba)</span>
            </a>
          </div>
        </ScrollReveal>

        <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Telas do sistema">
          {SCREENS.map((screen) => (
            <button
              key={screen.key}
              type="button"
              onClick={() => setSelectedKey(screen.key)}
              aria-pressed={screen.key === selectedKey}
              className={[
                'min-h-10 rounded-full border px-5 text-[14px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400 motion-reduce:transition-none',
                screen.key === selectedKey
                  ? 'border-brand-300 bg-[#e6f6f8] text-brand-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              ].join(' ')}
            >
              {screen.label}
            </button>
          ))}
        </div>

        {selected && (
          <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-[#f1f5f7] shadow-[0_24px_70px_rgba(8,52,61,0.12)]">
            <img
              src={SITE_MEDIA.financeScreens[selected.key]}
              alt={selected.alt}
              loading="lazy"
              className="block h-auto w-full"
            />
          </div>
        )}
      </div>
    </section>
  );
}
