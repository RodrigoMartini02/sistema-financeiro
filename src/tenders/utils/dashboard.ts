import type { DashboardSavedSearch, DashboardSetup, DashboardView, ExpiringContractsView } from '../types';
import { addDaysToIsoDate } from './dates';

// Regras de exibição do Início (plano .plans/licitacoes-inicio-painel.md): a agenda de prazos por dia, o selo das
// buscas salvas, o guia da conta vazia e os textos dos indicadores. Funções puras, para terem teste.

export type AgendaGroupKey = 'today' | 'tomorrow' | 'week' | 'later';

export const AGENDA_GROUP_LABELS: Record<AgendaGroupKey, string> = {
  today: 'Hoje',
  tomorrow: 'Amanhã',
  week: 'Esta semana',
  later: 'Depois',
};

const AGENDA_GROUP_ORDER: readonly AgendaGroupKey[] = ['today', 'tomorrow', 'week', 'later'];
const WEEK_DAYS = 7;
const HOUR_MS = 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

export interface AgendaGroup<T> {
  key: AgendaGroupKey;
  label: string;
  items: T[];
}

/** O dia do prazo como a API manda (relógio de Brasília); sem prazo, null. */
function closingDay(closesAt: string | null): string | null {
  const match = closesAt ? ISO_DAY.exec(closesAt) : null;
  return match ? match[0] : null;
}

function agendaGroupOf(closesAt: string | null, todayIso: string): AgendaGroupKey {
  const day = closingDay(closesAt);
  if (day === null) return 'later';
  if (day <= todayIso) return 'today';
  if (day === addDaysToIsoDate(todayIso, 1)) return 'tomorrow';
  if (day <= addDaysToIsoDate(todayIso, WEEK_DAYS)) return 'week';
  return 'later';
}

/** Agrupa os editais por dia do prazo (hoje, amanhã, esta semana, depois), mantendo a ordem recebida; só os grupos com itens. */
export function groupAgenda<T extends { proposalClosesAt: string | null }>(notices: readonly T[], todayIso: string): Array<AgendaGroup<T>> {
  const groups = new Map<AgendaGroupKey, T[]>();
  for (const notice of notices) {
    const key = agendaGroupOf(notice.proposalClosesAt, todayIso);
    groups.set(key, [...(groups.get(key) ?? []), notice]);
  }
  return AGENDA_GROUP_ORDER.flatMap((key) => {
    const items = groups.get(key);
    return items ? [{ key, label: AGENDA_GROUP_LABELS[key], items }] : [];
  });
}

/** O prazo acaba em até 24 h (e ainda não acabou)? */
export function closesWithin24Hours(closesAt: string | null, now: Date): boolean {
  const closesAtMs = closesAt ? new Date(closesAt).getTime() : Number.NaN;
  if (Number.isNaN(closesAtMs)) return false;
  const remainingMs = closesAtMs - now.getTime();
  return remainingMs > 0 && remainingMs <= 24 * HOUR_MS;
}

export type SavedSearchHealth = 'paused' | 'quiet' | 'active';

/** Busca pausada, busca ativa sem edital novo há 30 dias (vale rever o filtro) ou busca em dia. */
export function savedSearchHealth(search: Pick<DashboardSavedSearch, 'active' | 'newLast30Days'>): SavedSearchHealth {
  if (!search.active) return 'paused';
  return search.newLast30Days === 0 ? 'quiet' : 'active';
}

export interface SetupStep {
  key: 'search' | 'favorite' | 'notifications' | 'contracts';
  title: string;
  description: string;
  /** Caminho no app, relativo à base. */
  to: string;
  done: boolean;
}

export interface SetupGuide {
  show: boolean;
  steps: SetupStep[];
}

/** O guia só aparece para quem ainda não usou o módulo: sem busca salva e sem edital acompanhado. */
export function buildSetupGuide(setup: DashboardSetup, hasContractSearch: boolean): SetupGuide {
  return {
    show: !setup.hasSavedSearch && !setup.hasTracking,
    steps: [
      {
        key: 'search',
        title: 'Crie sua primeira busca salva',
        description: 'Diga o que a sua empresa vende e a UF; os editais novos chegam sozinhos.',
        to: '/buscas',
        done: setup.hasSavedSearch,
      },
      {
        key: 'favorite',
        title: 'Favorite um edital ou um contrato',
        description: 'Guarde o que quer rever e receba o aviso quando mudar.',
        to: '/buscar',
        done: setup.hasFavorite,
      },
      {
        key: 'notifications',
        title: 'Ligue os avisos de uma busca',
        description: 'Receba a notificação de edital novo e de prazo perto de acabar.',
        to: '/buscas',
        done: setup.notificationsEnabled,
      },
      {
        key: 'contracts',
        title: 'Acompanhe os contratos a vencer',
        description: 'Salve uma busca de contratos e veja o que vence nos próximos meses.',
        to: '/contratos',
        done: hasContractSearch,
      },
    ],
  };
}

/** Barras do funil de acompanhamento. */
export function funnelBars(funnel: DashboardView['funnel']): Array<{ key: string; label: string; count: number }> {
  return [
    { key: 'analyzing', label: 'Em análise', count: funnel.analyzing },
    { key: 'participating', label: 'Vou participar', count: funnel.participating },
    { key: 'discarded', label: 'Descartados', count: funnel.discarded },
  ];
}

/** Barras dos contratos que vencem; as janelas são acumuladas (a de 60 dias inclui a de 30). */
export function expiringBars(view: Pick<ExpiringContractsView, 'within30Days' | 'within60Days' | 'within90Days'>): Array<{ key: string; label: string; count: number }> {
  return [
    { key: '30', label: 'Até 30 dias', count: view.within30Days },
    { key: '60', label: 'Até 60 dias', count: view.within60Days },
    { key: '90', label: 'Até 90 dias', count: view.within90Days },
  ];
}

/** Texto do indicador de valor: avisa que é estimado e quantos editais ficaram fora da soma. */
export function pipelineHint(pipeline: DashboardView['pipeline']): string {
  if (pipeline.noticesWithoutValue === 0) return 'Valor estimado dos acompanhados abertos';
  const plural = pipeline.noticesWithoutValue === 1;
  return `Estimado; ${pipeline.noticesWithoutValue.toLocaleString('pt-BR')} ${plural ? 'edital' : 'editais'} sem valor`;
}

/** Texto do indicador de contratos que vencem: as janelas maiores. */
export function expiringHint(view: Pick<ExpiringContractsView, 'within60Days' | 'within90Days' | 'sources'>): string {
  if (view.sources.savedSearches === 0 && view.sources.favorites === 0) return 'Salve uma busca de contratos para acompanhar';
  return `Em 60 dias: ${view.within60Days.toLocaleString('pt-BR')} · em 90: ${view.within90Days.toLocaleString('pt-BR')}`;
}
