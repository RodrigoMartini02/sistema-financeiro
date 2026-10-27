import { BellRing, CircleCheck, Clock, Eye, FileClock, Sparkles, Wallet, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardView } from '../types';
import { pipelineHint } from '../utils/dashboard';
import { formatCompactMoney, formatMoneyValue } from '../utils/money';
import { closingWithinDays, toSearchParams, withFilters, DEFAULT_SEARCH_STATE } from '../utils/searchFilters';

interface IndicatorCard {
  key: string;
  label: string;
  hint: string;
  /** Texto do valor; null enquanto o dado não chegou (mostra "—"). */
  value: string | null;
  /** O valor por extenso, quando o texto é curto (dinheiro). */
  valueTitle?: string;
  icon: LucideIcon;
  to: string;
  wide?: boolean;
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

/** Indicadores do Início (escopo, seção 9.4, v1.3); cada um leva à lista correspondente. */
export function DashboardCards({
  cards,
  pipeline,
  contracts,
  todayIso,
}: {
  cards: DashboardView['cards'];
  pipeline: DashboardView['pipeline'];
  contracts: ContractsIndicator;
  todayIso: string;
}) {
  const items: IndicatorCard[] = [
    {
      key: 'newToday',
      label: 'Novos hoje',
      hint: 'Coletados hoje e batem com suas buscas ativas',
      value: formatCount(cards.newToday),
      icon: Sparkles,
      to: '/buscas',
    },
    {
      key: 'closingIn7Days',
      label: 'Encerrando em 7 dias',
      hint: 'Acompanhados pela conta',
      value: formatCount(cards.closingIn7Days),
      icon: Clock,
      to: searchLink({ trackingStatuses: ['ANALISAR', 'PARTICIPAR'], ...closingWithinDays(CLOSING_SOON_DAYS, todayIso) }),
    },
    {
      key: 'analyzing',
      label: 'Em análise',
      hint: 'Acompanhados como Analisar',
      value: formatCount(cards.analyzing),
      icon: Eye,
      to: searchLink({ trackingStatuses: ['ANALISAR'] }),
    },
    {
      key: 'participating',
      label: 'Vou participar',
      hint: 'Acompanhados como Vou participar',
      value: formatCount(cards.participating),
      icon: CircleCheck,
      to: searchLink({ trackingStatuses: ['PARTICIPAR'] }),
    },
    {
      key: 'pipeline',
      label: 'Valor estimado em disputa',
      hint: pipelineHint(pipeline),
      value: formatCompactMoney(pipeline.estimatedValue),
      valueTitle: formatMoneyValue(pipeline.estimatedValue),
      icon: Wallet,
      to: '/acompanhamento',
      wide: true,
    },
    {
      key: 'unreadChanges',
      label: 'Editais alterados',
      hint: 'Acompanhados com alteração não lida',
      value: formatCount(cards.unreadChanges),
      icon: BellRing,
      to: '/notificacoes',
    },
    {
      key: 'expiringContracts',
      label: 'Contratos vencendo em 30 dias',
      hint: contracts.hint,
      value: contracts.value === null ? null : formatCount(contracts.value),
      icon: FileClock,
      to: '/contratos',
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.key} className={item.wide ? 'col-span-2' : undefined}>
            <Link
              to={item.to}
              className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-500/50"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <Icon size={15} className="shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                {item.label}
              </span>
              <span title={item.valueTitle} className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {item.value ?? '—'}
              </span>
              <span className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{item.hint}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
