import { BuildingsIcon, ChartPieSliceIcon, ChatCircleTextIcon, CreditCardIcon, HandCoinsIcon, ReceiptIcon } from '@phosphor-icons/react';
import { SOLUTION_NAMES } from '../../brand';
import { FREE_TRIAL_DAYS } from '../../utils/sitePricing';
import { CallToAction } from './components/CallToAction';
import { FaqSection, type FaqItem } from './components/FaqSection';
import { FeatureGrid, type FeatureItem } from './components/FeatureGrid';
import { FinanceScreens } from './components/FinanceScreens';
import { FinanceComparison, FinancePlanCards } from './components/PriceTables';
import { usePublicSite } from './components/publicSiteContext';
import { ScrollReveal } from './components/ScrollReveal';
import { SITE_MEDIA } from './components/siteMedia';
import { SolutionHero } from './components/SolutionHero';
import { StepsSection, type Step } from './components/StepsSection';
import { ON_DARK_BUTTON, SECTION_LABEL, SECTION_TEXT, SECTION_TITLE, SITE_CONTAINER, SITE_SECTION } from './components/siteStyles';

const BENEFITS: FeatureItem[] = [
  {
    icon: ReceiptIcon,
    title: 'Despesas organizadas',
    description: 'À vista, parceladas ou recorrentes no cartão, cada uma no mês e na categoria corretos.',
  },
  {
    icon: HandCoinsIcon,
    title: 'Receitas previsíveis',
    description: 'Entradas avulsas ou fixas, com confirmação do recebimento e histórico por período.',
  },
  {
    icon: ChatCircleTextIcon,
    title: 'Assistente Juca',
    description: 'Descreva a movimentação em uma frase, e o lançamento chega preenchido para você conferir.',
  },
  {
    icon: CreditCardIcon,
    title: 'Cartões e faturas sob controle',
    description: 'Limite disponível, parcelas e cobranças recorrentes antes do fechamento, com pagamento total, parcial ou parcelado da fatura.',
  },
  { icon: ChartPieSliceIcon, title: 'Relatórios gerenciais', description: 'Visão por categoria e por período, com exportação em PDF.' },
  {
    icon: BuildingsIcon,
    title: 'Pessoal e empresarial separados',
    description: 'Contas independentes para as finanças pessoais e para cada empresa, no plano Premium.',
  },
];

const STEPS: Step[] = [
  { title: 'Crie sua conta', description: `Cadastro em minutos, com ${FREE_TRIAL_DAYS} dias de acesso completo e sem cartão de crédito.` },
  { title: 'Registre as movimentações', description: 'Pelo computador ou pelo celular, uma a uma, em lote ou pelo assistente Juca.' },
  { title: 'Acompanhe os resultados', description: 'Saldo, faturas e relatórios atualizados a cada lançamento.' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Preciso de cartão de crédito para testar?',
    answer: `Não. São ${FREE_TRIAL_DAYS} dias grátis, com tudo do Premium liberado. Depois, é só escolher o plano.`,
  },
  {
    question: 'Qual a diferença entre Starter e Premium?',
    answer: 'O Starter cuida de uma conta, pessoal ou da empresa. O Premium traz várias contas, equipe, clientes, contratos, catálogo, estoque e vitrine.',
  },
  {
    question: 'O sistema acessa minha conta do banco?',
    answer: `Não. O ${SOLUTION_NAMES.finance} não se conecta ao seu banco: você registra as movimentações, e nenhuma senha bancária é pedida.`,
  },
  {
    question: 'Funciona no celular?',
    answer: 'Sim. O acesso é pelo navegador, no computador, no celular ou no tablet, sem precisar instalar nada.',
  },
  {
    question: 'Como funciona o pagamento?',
    answer:
      'A cobrança é mensal, por Pix, cartão ou pagamento automático no cartão, sem fidelidade. O cancelamento pode ser feito a qualquer momento e encerra o acesso na hora.',
  },
];

/** Página do FINGERENCE Finanças: recursos, telas, planos e perguntas. */
export function FinancePage() {
  const { startFree } = usePublicSite();

  return (
    <>
      <SolutionHero
        solution="finance"
        title="Controle financeiro completo, para você e para a sua empresa."
        description="Registre receitas e despesas em segundos, acompanhe faturas e parcelamentos, veja os compromissos dos próximos meses e decida com base em relatórios por categoria."
        media={(
          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[#f1f5f7] shadow-[0_30px_80px_rgba(8,52,61,0.16)]">
            <img
              src={SITE_MEDIA.financeScreens.entries}
              alt="Lançamentos do FINGERENCE Finanças com receitas, despesas e o saldo do mês, com dados fictícios"
              className="block h-auto w-full"
            />
          </div>
        )}
      />

      <FeatureGrid label="Recursos" title="Os recursos que a sua gestão financeira exige." items={BENEFITS} />

      <FinanceScreens />

      <StepsSection label="Como funciona" title="Comece a usar em três etapas." steps={STEPS} />

      <section id="planos" className={`${SITE_SECTION} scroll-mt-20`}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Planos</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Planos para cada estágio da sua gestão.</h2>
            <p className={`mt-4 max-w-[640px] ${SECTION_TEXT}`}>
              A avaliação gratuita inclui todos os recursos do Premium. Ao final, escolha o plano diretamente no sistema.
            </p>
          </ScrollReveal>
          <div className="mt-10">
            <FinancePlanCards onStart={() => startFree('finance')} />
          </div>
          <div className="mt-8">
            <FinanceComparison />
          </div>
        </div>
      </section>

      <FaqSection title="Perguntas frequentes" items={FAQ} />

      <CallToAction
        title="Assuma o controle das suas finanças hoje."
        text={`Teste grátis por ${FREE_TRIAL_DAYS} dias, com tudo do Premium e sem cartão de crédito.`}
      >
        <button type="button" onClick={() => startFree('finance')} className={ON_DARK_BUTTON}>
          Teste grátis por {FREE_TRIAL_DAYS} dias
        </button>
      </CallToAction>
    </>
  );
}
