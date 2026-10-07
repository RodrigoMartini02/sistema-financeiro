import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { SOLUTION_NAMES, type SiteSolution } from '../../../brand';
import { pageOfSolution } from '../../../utils/publicPages';
import { FINANCE_PLAN_PRICES_CENTS, formatPriceCents, TENDERS_PRICE } from '../../../utils/sitePricing';
import { ScrollReveal } from './ScrollReveal';
import { SITE_MEDIA } from './siteMedia';

interface SolutionCard {
  solution: SiteSolution;
  image: string;
  headline: string;
  benefits: string[];
  startingPriceCents: number;
}

const CARDS: SolutionCard[] = [
  {
    solution: 'finance',
    image: SITE_MEDIA.financeCard,
    headline: 'O dinheiro da casa e da empresa organizados, sem planilha.',
    benefits: ['Receitas, despesas, cartões e parcelas num lugar só', 'Saldo de cada mês calculado sozinho', 'Relatórios claros para decidir'],
    startingPriceCents: FINANCE_PLAN_PRICES_CENTS.starter,
  },
  {
    solution: 'tenders',
    image: SITE_MEDIA.tendersCard,
    headline: 'Os editais que interessam, com aviso antes do prazo.',
    benefits: ['Busca por região, órgão, modalidade e valor', 'Aviso quando sai edital novo', 'Lembrete antes do fim do prazo'],
    startingPriceCents: TENDERS_PRICE.baseCents,
  },
];

function SolutionCardLink({ card }: { card: SolutionCard }) {
  const baseId = useId();
  const titleId = `${baseId}-titulo`;
  const detailsId = `${baseId}-detalhes`;

  // O cartão inteiro é um link só: nome pelo título, detalhes pelo resto do texto.
  return (
    <Link
      to={pageOfSolution(card.solution).path}
      aria-labelledby={titleId}
      aria-describedby={detailsId}
      className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] outline-none transition duration-300 hover:-translate-y-1 hover:border-brand-300 hover:shadow-[0_28px_70px_rgba(8,52,61,0.14)] focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-4 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="aspect-[16/9] overflow-hidden bg-[#dcebed]">
        <img
          src={card.image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </div>
      <div className="flex flex-1 flex-col p-7 sm:p-8">
        <h3 id={titleId} className="text-[13px] font-semibold uppercase tracking-[0.2em] text-brand-700">
          {SOLUTION_NAMES[card.solution]}
        </h3>
        <div id={detailsId} className="flex flex-1 flex-col">
          <p className="mt-3 text-[26px] font-light leading-[1.2] text-slate-950">{card.headline}</p>
          <ul className="mt-5 grid gap-2.5">
            {card.benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3 text-[15px] text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-7">
            <p className="text-[14px] text-slate-500">
              A partir de <span className="font-semibold text-slate-950">{formatPriceCents(card.startingPriceCents)}</span>/mês
            </p>
            <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-700">
              Ver detalhes
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** As duas soluções lado a lado; o cartão inteiro leva ao detalhe. */
export function SolutionCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {CARDS.map((card, index) => (
        <ScrollReveal key={card.solution} delay={index * 0.08}>
          <SolutionCardLink card={card} />
        </ScrollReveal>
      ))}
    </div>
  );
}
