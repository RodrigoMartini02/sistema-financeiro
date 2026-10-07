import { BellRing, CalendarClock, Columns3, FileText, Heart, Search } from 'lucide-react';
import { formatPriceCents, FREE_TRIAL_DAYS, TENDERS_PRICE } from '../../utils/sitePricing';
import { CallToAction } from './components/CallToAction';
import { FaqSection, type FaqItem } from './components/FaqSection';
import { FeatureGrid, type FeatureItem } from './components/FeatureGrid';
import { TendersPlanCard } from './components/PriceTables';
import { usePublicSite } from './components/publicSiteContext';
import { ScrollReveal } from './components/ScrollReveal';
import { SolutionHero } from './components/SolutionHero';
import { StepsSection, type Step } from './components/StepsSection';
import { TendersPreview } from './components/TendersPreview';
import { ON_DARK_BUTTON, ON_DARK_SECONDARY_BUTTON, SECTION_LABEL, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './components/siteStyles';

// O que a página não promete (proposta, seção 5): aviso por e-mail ou
// WhatsApp, outras fontes e IA. Também não cita de onde vêm os editais (o PNCP
// fica só nos termos, plano .plans/site-novo.md, decisão 4).

const STEPS: Step[] = [
  {
    title: 'Diga o que procura',
    description: 'Palavras, região, órgão, modalidade e faixa de valor. Cada pessoa da equipe salva as suas buscas.',
  },
  {
    title: 'Receba os avisos',
    description: 'Quando sai edital novo que combina com a sua busca, o aviso aparece no sistema.',
  },
  {
    title: 'Acompanhe até o fim',
    description: 'Leve o edital para o quadro (Analisar, Vou participar, Descartado) e receba lembretes antes do prazo.',
  },
];

const BENEFITS: FeatureItem[] = [
  {
    icon: Search,
    title: 'Busca completa',
    description: 'Frases, exclusões e filtros de região, município, órgão, modalidade, valor e datas.',
  },
  { icon: BellRing, title: 'Aviso de edital novo', description: 'Cada busca salva avisa quando aparece edital que combina com ela.' },
  { icon: CalendarClock, title: 'Lembrete de prazo', description: 'Três dias e um dia antes do fim do prazo dos editais em que você vai participar.' },
  { icon: Columns3, title: 'Quadro de acompanhamento', description: 'Analisar, Vou participar e Descartado, com observações e histórico.' },
  { icon: Heart, title: 'Favoritos', description: 'Cada pessoa guarda os editais que quer acompanhar de perto.' },
  { icon: FileText, title: 'Itens e arquivos', description: 'Os itens da compra e os arquivos do edital, a um clique.' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Com que frequência os editais são atualizados?',
    answer: 'Todos os dias. Antes de participar, confira sempre o edital completo no link oficial que mostramos.',
  },
  {
    question: 'Como recebo os avisos?',
    answer: 'Dentro do sistema, no sino de notificações, com o link direto para o edital.',
  },
  {
    question: 'Quantos usuários posso ter?',
    answer: `Quantos quiser. O plano inclui ${TENDERS_PRICE.includedUsers} usuários, você e mais ${TENDERS_PRICE.includedUsers - 1}. Cada usuário a mais custa ${formatPriceCents(TENDERS_PRICE.extraUserCents)}/mês, a partir da próxima cobrança. Todos usam tudo, sem configurar permissões.`,
  },
  {
    question: 'Preciso de cartão de crédito para testar?',
    answer: `Não. São ${FREE_TRIAL_DAYS} dias grátis. Depois, você paga por Pix, cartão ou pagamento automático no cartão.`,
  },
  {
    question: 'E se eu cancelar?',
    answer: 'No pagamento automático no cartão, o acesso continua até o fim do período já pago. As suas buscas e o acompanhamento ficam guardados.',
  },
];

/** Página do FINGERENCE Licitações: como funciona, benefícios, preço e perguntas. */
export function TendersPage() {
  const { enter, startFree } = usePublicSite();

  return (
    <>
      <SolutionHero
        solution="tenders"
        title="Os editais certos para o seu negócio, com aviso antes do prazo."
        description="Encontre licitações abertas em todo o Brasil, receba aviso quando sai edital novo e acompanhe a participação da sua equipe num só lugar."
        media={<TendersPreview />}
      />

      <StepsSection label="Como funciona" title="Da busca ao prazo, sem planilha." steps={STEPS} />

      <FeatureGrid label="Benefícios" title="Tudo incluso, para toda a sua equipe." items={BENEFITS} />

      <section id="preco" className={`${SITE_SECTION} scroll-mt-20 border-t border-slate-200/70`}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Preço</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Um plano, sem surpresa.</h2>
          </ScrollReveal>
          <div className="mt-10">
            <TendersPlanCard onStart={() => startFree('tenders')} />
          </div>
        </div>
      </section>

      <FaqSection title="Perguntas frequentes" items={FAQ} />

      <CallToAction title="Comece a acompanhar os editais hoje." text={`Teste grátis por ${FREE_TRIAL_DAYS} dias, sem cartão de crédito.`}>
        <button type="button" onClick={() => startFree('tenders')} className={ON_DARK_BUTTON}>
          Teste grátis por {FREE_TRIAL_DAYS} dias
        </button>
        <button type="button" onClick={() => enter('tenders')} className={ON_DARK_SECONDARY_BUTTON}>
          Já sou cliente
        </button>
      </CallToAction>
    </>
  );
}
