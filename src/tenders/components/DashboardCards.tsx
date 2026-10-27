import { CalendarDays, CircleCheck, Clock, Eye, FileClock, FolderOpen, Flag, Sparkles, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardView } from '../types';
import { addDaysToIsoDate } from '../utils/dates';
import { closingWithinDays, DEFAULT_SEARCH_STATE, toSearchParams, withFilters } from '../utils/searchFilters';

interface IndicatorCard {
  key: string;
  label: string;
  hint: string;
  /** Texto do valor; null enquanto o dado não chegou (mostra "—"). */
  value: string | null;
  icon: LucideIcon;
  to: string;
}

/** O indicador de contratos que vencem vem de outra consulta (lê o armazém), então chega depois dos demais. */
export interface ContractsIndicator {
  value: number | null;
  hint: string;
}

const CLOSING_SOON_DAYS = 7;

function searchLink(changes: Parameters<typeof withFilters>[1]): string {
  return `/buscar?${toSearchParams(withFilters(DEFAULT_SEARCH_STATE, changes)).toString()}`;
}

const formatCount = (value: number) => value.toLocaleString('pt-BR');

/**
 * Indicadores do Dashboard, só de quantidade: a linha de cima é a base de editais e os contratos; a de baixo, a gestão
 * da conta. Cada um leva à lista correspondente.
 */
export function DashboardCards({
  cards,
  contracts,
  todayIso,
}: {
  cards: DashboardView['cards'];
  contracts: ContractsIndicator;
  todayIso: string;
}) {
  const yesterday = addDaysToIsoDate(todayIso, -1);
  const items: IndicatorCard[] = [
    {
      key: 'publishedYesterday',
      label: 'Publicados ontem',
      hint: `7 dias: ${formatCount(cards.published7Days)} · 30 dias: ${formatCount(cards.published30Days)}`,
      value: formatCount(cards.publishedYesterday),
      icon: CalendarDays,
      to: searchLink({ openOnly: false, publishedFrom: yesterday, publishedTo: yesterday }),
    },
    {
      key: 'openNow',
      label: 'Abertos agora',
      hint: 'Editais com prazo de proposta aberto',
      value: formatCount(cards.openNow),
      icon: FolderOpen,
      to: '/buscar',
    },
    {
      key: 'newToday',
      label: 'Novos hoje nas minhas buscas',
      hint: 'Coletados hoje e batem com suas buscas ativas',
      value: formatCount(cards.newToday),
      icon: Sparkles,
      to: '/buscas',
    },
    {
      key: 'expiringContracts',
      label: 'Contratos vencendo em 30 dias',
      hint: contracts.hint,
      value: contracts.value === null ? null : formatCount(contracts.value),
      icon: FileClock,
      to: '/contratos',
    },
    {
      key: 'analyzing',
      label: 'Em análise',
      hint: 'Acompanhados como Analisar, com prazo aberto',
      value: formatCount(cards.analyzing),
      icon: Eye,
      to: searchLink({ trackingStatuses: ['ANALISAR'] }),
    },
    {
      key: 'participating',
      label: 'Vou participar',
      hint: 'Acompanhados como Vou participar, com prazo aberto',
      value: formatCount(cards.participating),
      icon: CircleCheck,
      to: searchLink({ trackingStatuses: ['PARTICIPAR'] }),
    },
    {
      key: 'closingIn7Days',
      label: 'Encerrando em 7 dias',
      hint: 'Acompanhados com prazo perto de acabar',
      value: formatCount(cards.closingIn7Days),
      icon: Clock,
      to: searchLink({ trackingStatuses: ['ANALISAR', 'PARTICIPAR'], ...closingWithinDays(CLOSING_SOON_DAYS, todayIso) }),
    },
    {
      key: 'participated',
      label: 'Participei',
      hint: 'Vou participar com o prazo já encerrado',
      value: formatCount(cards.participated),
      icon: Flag,
      to: searchLink({ trackingStatuses: ['PARTICIPAR'], openOnly: false, closingTo: todayIso }),
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
                <Icon size={15} className="shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                {item.label}
              </span>
              <span className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{item.value ?? '—'}</span>
              <span className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{item.hint}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
