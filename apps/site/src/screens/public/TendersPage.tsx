import { AlarmIcon, BellRingingIcon, BookmarkSimpleIcon, FilesIcon, KanbanIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
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
    title: 'Defina o perfil de busca',
    description: 'Palavras-chave, região, órgão, modalidade e faixa de valor. Cada integrante da equipe salva as próprias buscas.',
  },
  {
    title: 'Receba as oportunidades',
    description: 'Quando um novo edital corresponde a uma busca com aviso ligado, a notificação aparece no sistema.',
  },
  {
    title: 'Gerencie a participação',
    description: 'Classifique cada edital em Analisar, Vou participar ou Descartado e receba lembretes antes do prazo.',
  },
];

const BENEFITS: FeatureItem[] = [
  {
    icon: MagnifyingGlassIcon,
    title: 'Busca avançada',
    description: 'Frases exatas, termos excluídos e filtros por região, município, órgão, modalidade, valor e datas.',
  },
  {
    icon: BellRingingIcon,
    title: 'Alertas de novos editais',
    description: 'As buscas salvas com aviso ligado notificam quando surge um edital que corresponde a elas.',
  },
  {
    icon: AlarmIcon,
    title: 'Lembretes de prazo',
    description: 'Avisos 3 dias e 1 dia antes do encerramento dos editais em que a sua empresa vai participar.',
  },
  {
    icon: KanbanIcon,
    title: 'Gestão da participação',
    description: 'Situação de cada edital (Analisar, Vou participar, Descartado), com observações e histórico compartilhados pela equipe.',
  },
  { icon: BookmarkSimpleIcon, title: 'Favoritos individuais', description: 'Cada integrante destaca os editais que quer acompanhar de perto.' },
  { icon: FilesIcon, title: 'Itens e documentos', description: 'Os itens da compra e os arquivos oficiais do edital, a um clique.' },
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
    answer:
      'O pagamento automático no cartão pode ser cancelado a qualquer momento, e o acesso continua até o fim do período já pago. No Pix e no cartão, cada pagamento vale por um período, sem renovação automática. As suas buscas e o acompanhamento ficam guardados.',
  },
];

/** Página do FINGERENCE Licitações: como funciona, recursos, preço e perguntas. */
export function TendersPage() {
  const { enter, startFree } = usePublicSite();

  return (
    <>
      <SolutionHero
        solution="tenders"
        title="Encontre as licitações certas e não perca nenhum prazo."
        description="Monitore editais abertos em todo o Brasil, receba notificações de novas oportunidades e conduza a participação da sua equipe, da análise ao prazo final, em um único ambiente."
        media={<TendersPreview />}
      />

      <StepsSection label="Como funciona" title="Da busca ao prazo final, em três etapas." steps={STEPS} />

      <FeatureGrid label="Recursos" title="Recursos completos, para toda a equipe." items={BENEFITS} />

      <section id="preco" className={`${SITE_SECTION} scroll-mt-20 border-t border-slate-200/70`}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Preço</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Plano único, com todos os recursos.</h2>
          </ScrollReveal>
          <div className="mt-10">
            <TendersPlanCard onStart={() => startFree('tenders')} />
          </div>
        </div>
      </section>

      <FaqSection title="Perguntas frequentes" items={FAQ} />

      <CallToAction title="Sua próxima licitação pode estar publicada hoje." text={`Teste grátis por ${FREE_TRIAL_DAYS} dias, sem cartão de crédito.`}>
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
