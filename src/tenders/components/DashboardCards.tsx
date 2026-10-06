import { CircleCheck, Clock, Eye, Sparkles, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardView } from '../types';
import { closingWithinDays, toSearchParams, withFilters, DEFAULT_SEARCH_STATE } from '../utils/searchFilters';

interface IndicatorCard {
  key: string;
  label: string;
  hint: string;
  value: number;
  icon: LucideIcon;
  to: string;
}

const CLOSING_SOON_DAYS = 7;

function searchLink(changes: Parameters<typeof withFilters>[1]): string {
  return `/buscar?${toSearchParams(withFilters(DEFAULT_SEARCH_STATE, changes)).toString()}`;
}

/** Indicadores do Início (escopo, seção 9.4, v1.3); cada um leva à lista correspondente. */
export function DashboardCards({ cards, todayIso }: { cards: DashboardView['cards']; todayIso: string }) {
  const items: IndicatorCard[] = [
    {
      key: 'newToday',
      label: 'Novos hoje',
      hint: 'Coletados hoje e batem com suas buscas ativas',
      value: cards.newToday,
      icon: Sparkles,
      to: '/buscas',
    },
    {
      key: 'closingIn7Days',
      label: 'Encerrando em 7 dias',
      hint: 'Acompanhados pela conta',
      value: cards.closingIn7Days,
      icon: Clock,
      to: searchLink({ trackingStatuses: ['ANALISAR', 'PARTICIPAR'], ...closingWithinDays(CLOSING_SOON_DAYS, todayIso) }),
    },
    {
      key: 'analyzing',
      label: 'Em análise',
      hint: 'Acompanhados como Analisar',
      value: cards.analyzing,
      icon: Eye,
      to: searchLink({ trackingStatuses: ['ANALISAR'] }),
    },
    {
      key: 'participating',
      label: 'Vou participar',
      hint: 'Acompanhados como Vou participar',
      value: cards.participating,
      icon: CircleCheck,
      to: searchLink({ trackingStatuses: ['PARTICIPAR'] }),
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.key}>
            <Link
              to={item.to}
              className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-500/50"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <Icon size={15} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
                {item.label}
              </span>
              <span className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{item.value.toLocaleString('pt-BR')}</span>
              <span className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{item.hint}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
