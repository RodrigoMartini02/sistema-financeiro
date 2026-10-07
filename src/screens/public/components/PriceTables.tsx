import { Check, Minus } from 'lucide-react';
import { SOLUTION_NAMES } from '../../../brand';
import { FINANCE_PLAN_PRICES_CENTS, formatPriceCents, FREE_TRIAL_DAYS, TENDERS_PRICE } from '../../../utils/sitePricing';
import { ScrollReveal } from './ScrollReveal';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './siteStyles';

// Preços e o que cada plano inclui. O teste de cada solução é grátis e cria a
// conta já nela; o plano é escolhido depois, dentro do sistema.

const START_LABEL = `Teste grátis por ${FREE_TRIAL_DAYS} dias`;
const HIGHLIGHT_BADGE = 'Mais completo';

interface FinancePlan {
  name: string;
  priceCents: number;
  description: string;
  highlight: boolean;
  features: string[];
}

const FINANCE_PLANS: FinancePlan[] = [
  {
    name: 'Starter',
    priceCents: FINANCE_PLAN_PRICES_CENTS.starter,
    description: 'Uma conta, pessoal ou da empresa, com todo o financeiro.',
    highlight: false,
    features: [
      'Uma conta (pessoal ou empresa)',
      'Receitas, despesas e lançamento em lote',
      'Cartão de crédito, parcelas e recorrências',
      'Painel, planejamento e relatórios',
      'Agenda, avisos e assistente Juca',
    ],
  },
  {
    name: 'Premium',
    priceCents: FINANCE_PLAN_PRICES_CENTS.premium,
    description: 'Para quem tem empresa, equipe e vendas.',
    highlight: true,
    features: [
      'Tudo do Starter',
      'Várias contas (pessoal e empresas)',
      'Membros e colaboradores, com setores e cargos',
      'Clientes e contratos',
      'Catálogo, estoque, vitrine e pedidos',
      'Suporte prioritário',
    ],
  },
];

const FINANCE_COMPARISON: Array<{ item: string; starter: boolean; premium: boolean }> = [
  { item: 'Receitas, despesas e lançamento em lote', starter: true, premium: true },
  { item: 'Cartão de crédito, parcelas e recorrências', starter: true, premium: true },
  { item: 'Painel, planejamento e relatórios em PDF', starter: true, premium: true },
  { item: 'Agenda e avisos de vencimento', starter: true, premium: true },
  { item: 'Assistente Juca', starter: true, premium: true },
  { item: 'Categorias personalizadas', starter: true, premium: true },
  { item: 'Mais de uma conta (pessoal e empresas)', starter: false, premium: true },
  { item: 'Membros e colaboradores', starter: false, premium: true },
  { item: 'Clientes e contratos', starter: false, premium: true },
  { item: 'Catálogo, estoque, vitrine e pedidos', starter: false, premium: true },
  { item: 'Suporte prioritário', starter: false, premium: true },
];

const TENDERS_FEATURES = [
  'Busca de editais por região, município, órgão, modalidade e valor',
  'Buscas salvas que avisam o edital novo',
  'Lembretes 3 dias e 1 dia antes do prazo',
  'Favoritos e quadro de acompanhamento',
  'Itens e arquivos do edital',
  'Mais de um usuário por conta; acima do limite, cobrança adicional por usuário',
];

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul className="mt-6 grid gap-3">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-3 text-[15px] text-slate-600">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
          {feature}
        </li>
      ))}
    </ul>
  );
}

function PriceTag({ cents, suffix }: { cents: number; suffix: string }) {
  return (
    <p className="mt-4 flex items-end gap-2">
      <span className="text-[44px] font-light leading-none text-slate-950">{formatPriceCents(cents)}</span>
      <span className="mb-1 text-[14px] text-slate-500">{suffix}</span>
    </p>
  );
}

interface PlanCardProps {
  name: string;
  priceCents: number;
  priceSuffix: string;
  description: string;
  features: string[];
  /** Destaque: fundo colorido e o botão principal. */
  highlight: boolean;
  badge?: string;
  onStart: () => void;
}

/** O card de um plano, igual em Finanças e Licitações: nome, preço, o que inclui e o teste grátis. */
function PlanCard({ name, priceCents, priceSuffix, description, features, highlight, badge, onStart }: PlanCardProps) {
  return (
    <article
      className={[
        'flex h-full flex-col rounded-[28px] border p-8',
        highlight ? 'border-brand-300 bg-[#eef8f9] shadow-[0_22px_64px_rgba(8,52,61,0.12)]' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.22em] text-brand-700">{name}</h3>
        {badge && (
          <span className="rounded-full border border-brand-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700">
            {badge}
          </span>
        )}
      </div>
      <PriceTag cents={priceCents} suffix={priceSuffix} />
      <p className="mt-3 text-[15px] leading-[1.6] text-slate-600">{description}</p>
      <FeatureList features={features} />
      <div className="mt-auto pt-8">
        <button type="button" onClick={onStart} className={`${highlight ? PRIMARY_BUTTON : SECONDARY_BUTTON} w-full`}>
          {START_LABEL}
        </button>
      </div>
    </article>
  );
}

/** Starter e Premium do módulo Finanças. */
export function FinancePlanCards({ onStart }: { onStart: () => void }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {FINANCE_PLANS.map((plan, index) => (
        <ScrollReveal key={plan.name} delay={index * 0.08}>
          <PlanCard
            name={plan.name}
            priceCents={plan.priceCents}
            priceSuffix="/mês"
            description={plan.description}
            features={plan.features}
            highlight={plan.highlight}
            badge={plan.highlight ? HIGHLIGHT_BADGE : undefined}
            onStart={onStart}
          />
        </ScrollReveal>
      ))}
    </div>
  );
}

/** O que muda entre Starter e Premium, item a item. */
export function FinanceComparison() {
  return (
    <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
      <table className="w-full min-w-[600px]">
        <caption className="sr-only">Comparação dos planos Starter e Premium</caption>
        <thead className="bg-[#eef8f9]">
          <tr className="border-b border-slate-200">
            <th scope="col" className="py-4 pl-6 pr-6 text-left text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recurso</th>
            <th scope="col" className="px-4 py-4 text-center text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Starter</th>
            <th scope="col" className="px-4 py-4 text-center text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Premium</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {FINANCE_COMPARISON.map(({ item, starter, premium }) => (
            <tr key={item}>
              <th scope="row" className="py-3.5 pl-6 pr-6 text-left text-[14px] font-normal text-slate-600">{item}</th>
              {[starter, premium].map((included, index) => (
                <td key={index} className="px-4 py-3.5 text-center">
                  {included ? (
                    <Check className="mx-auto h-4 w-4 text-brand-700" aria-hidden="true" />
                  ) : (
                    <Minus className="mx-auto h-4 w-4 text-slate-300" aria-hidden="true" />
                  )}
                  <span className="sr-only">{included ? 'Incluído' : 'Não incluído'}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * O plano único de Licitações, no mesmo card dos planos de Finanças e com a
 * largura de um deles. O valor por usuário a mais fica nas perguntas frequentes.
 */
export function TendersPlanCard({ onStart }: { onStart: () => void }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ScrollReveal>
        <PlanCard
          name={SOLUTION_NAMES.tenders}
          priceCents={TENDERS_PRICE.baseCents}
          priceSuffix="/mês por conta"
          description="Busca, avisos e acompanhamento dos editais, num só lugar."
          features={TENDERS_FEATURES}
          highlight
          onStart={onStart}
        />
      </ScrollReveal>
    </div>
  );
}
