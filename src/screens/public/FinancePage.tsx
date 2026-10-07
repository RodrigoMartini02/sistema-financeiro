import { BarChart3, CreditCard, Layers, ListPlus, ReceiptText, TrendingUp } from 'lucide-react';
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
  { icon: ReceiptText, title: 'Despesas sob controle', description: 'Simples, parceladas ou recorrentes, cada uma no mês certo e na categoria certa.' },
  { icon: TrendingUp, title: 'Receitas sempre à vista', description: 'Entradas únicas ou recorrentes, com o histórico de cada período.' },
  { icon: ListPlus, title: 'Lançamento em lote', description: 'Várias receitas ou despesas de uma vez, para quem tem muito movimento.' },
  { icon: CreditCard, title: 'Cartão sem surpresa', description: 'Limite real, parcelas e recorrências antes de a fatura chegar.' },
  { icon: BarChart3, title: 'Relatórios que ajudam a decidir', description: 'Para onde o dinheiro vai, por categoria e por mês.' },
  { icon: Layers, title: 'Casa e empresa separadas', description: 'Contas independentes para a vida pessoal e para cada empresa, no Premium.' },
];

const STEPS: Step[] = [
  { title: 'Crie sua conta', description: `Grátis por ${FREE_TRIAL_DAYS} dias, sem cartão de crédito.` },
  { title: 'Lance o que entra e o que sai', description: 'No computador ou no celular, em poucos segundos.' },
  { title: 'Acompanhe e decida', description: 'Saldo do mês, cartões e relatórios sempre atualizados.' },
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
    answer: 'Não. Você lança o que quiser, e nada é ligado ao seu banco. Os seus dados ficam com você.',
  },
  {
    question: 'Funciona no celular?',
    answer: 'Sim. Funciona no navegador do computador, do celular e do tablet.',
  },
  {
    question: 'Como funciona o pagamento?',
    answer: 'É mensal, por Pix, cartão ou pagamento automático no cartão. Você cancela quando quiser, e o acesso termina no cancelamento.',
  },
];

/** Página do FINGERENCE Finanças: benefícios, telas, planos e perguntas. */
export function FinancePage() {
  const { startFree } = usePublicSite();

  return (
    <>
      <SolutionHero
        solution="finance"
        title="O dinheiro da casa e da empresa organizados, sem planilha."
        description="Lance receitas e despesas em segundos, controle cartões e parcelas, veja o saldo de cada mês e decida com relatórios claros."
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

      <FeatureGrid label="Benefícios" title="Tudo o que o dia a dia financeiro pede." items={BENEFITS} />

      <FinanceScreens />

      <StepsSection label="Como funciona" title="Comece em três passos." steps={STEPS} />

      <section id="planos" className={`${SITE_SECTION} scroll-mt-20`}>
        <div className={SITE_CONTAINER}>
          <ScrollReveal>
            <p className={SECTION_LABEL}>Planos</p>
            <h2 className={`mt-4 ${SECTION_TITLE}`}>Escolha o seu plano.</h2>
            <p className={`mt-4 max-w-[640px] ${SECTION_TEXT}`}>
              O teste de {FREE_TRIAL_DAYS} dias tem tudo do Premium. Depois, você escolhe o plano dentro do sistema.
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
        title="Organize as suas finanças a partir de hoje."
        text={`Teste grátis por ${FREE_TRIAL_DAYS} dias, com tudo do Premium e sem cartão de crédito.`}
      >
        <button type="button" onClick={() => startFree('finance')} className={ON_DARK_BUTTON}>
          Teste grátis por {FREE_TRIAL_DAYS} dias
        </button>
      </CallToAction>
    </>
  );
}
