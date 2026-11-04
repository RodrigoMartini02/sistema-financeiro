import type { DashboardView, ExpiringContractsView, ModalityCard } from '../types';
import { cnpjLinkPath } from './cnpj';
import { addDaysToIsoDate, formatIsoDate } from './dates';
import { formatCnpj } from './labels';
import { DEFAULT_SEARCH_STATE, toSearchParams, withFilters } from './searchFilters';

// Regras de exibição do Dashboard (plano .plans/licitacoes-dashboard-gestao.md): as barras de publicações por dia e por
// mês empilhadas por modalidade, o funil, a carga de prazos, a esfera, os órgãos e os contratos que vencem. Funções
// puras, para terem teste; os componentes só desenham.

/** Uma barra de contagem (CountBars): `suffix` vai junto do número, e `to` faz do rótulo um link do app. */
export interface CountItem {
  key: string;
  label: string;
  count: number;
  suffix?: string;
  to?: string;
}

export type PublicationPeriod = 'daily' | 'monthly';

/**
 * Ordem fixa das cores das modalidades: a cor segue a modalidade, e não a posição no gráfico. As quatro que a coleta traz
 * por padrão (Pregão Eletrônico, Dispensa, Concorrência Eletrônica e Pregão Presencial) ficam sempre nas quatro primeiras
 * cores da paleta, que foram validadas (daltonismo e contraste).
 */
export const MODALITY_COLOR_ORDER = [6, 8, 4, 7, 1, 2, 3, 5, 9, 10, 11, 12, 13] as const;

/** Posição da modalidade na paleta; a que não está na lista (não existe no PNCP) vem depois das demais. */
export function modalityColorIndex(modalityId: number): number {
  const index = MODALITY_COLOR_ORDER.indexOf(modalityId as (typeof MODALITY_COLOR_ORDER)[number]);
  return index === -1 ? MODALITY_COLOR_ORDER.length : index;
}

/** Séries com cor própria antes de juntar o resto em "Outras": uma nona cor gerada não se distingue das demais. */
export const MAX_MODALITY_SERIES = 8;
export const OTHER_SERIES_KEY = 'other';

export interface PublicationSeries {
  key: string;
  label: string;
  /** Posição na paleta; null na série "Outras", que usa o cinza neutro. */
  colorIndex: number | null;
}

export interface PublicationBar {
  key: string;
  /** Rótulo do eixo: "26/10" ou "out/26". */
  label: string;
  /** Título do detalhe: "26/10/2026" ou "outubro de 2026 (até ontem)". */
  title: string;
  values: Record<string, number>;
  total: number;
}

export interface PublicationChart {
  series: PublicationSeries[];
  bars: PublicationBar[];
  total: number;
  /** Aviso de cobertura, quando a base é mais nova que o começo da janela. */
  note: string | null;
}

const MONTH_ABBREVIATIONS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const sum = (values: Iterable<number>): number => {
  let total = 0;
  for (const value of values) total += value;
  return total;
};

/** "AAAA-MM-DD" para "DD/MM". */
const dayAndMonth = (isoDay: string): string => `${isoDay.slice(8, 10)}/${isoDay.slice(5, 7)}`;

function monthParts(month: string): { year: string; index: number } {
  return { year: month.slice(0, 4), index: Number(month.slice(5, 7)) - 1 };
}

/** O começo da base é mais novo que o começo da janela das barras: antes dele os números aparecem menores que o real. */
export function coverageNote(coverageSince: string | null, firstDay: string): string | null {
  if (coverageSince === null || coverageSince <= firstDay) return null;
  return `A base começou a receber editais em ${formatIsoDate(coverageSince)}; antes disso os números aparecem menores que o real.`;
}

/** As barras de publicações por dia (30 dias até ontem) ou por mês (12 meses até o corrente), empilhadas por modalidade. */
export function buildPublicationChart(
  view: Pick<DashboardView, 'modalities' | 'publications'>,
  period: PublicationPeriod,
): PublicationChart {
  const points =
    period === 'daily'
      ? view.publications.daily.map((point) => ({ key: point.day, byModality: point.byModality, partial: false }))
      : view.publications.monthly.map((point) => ({ key: point.month, byModality: point.byModality, partial: point.partial }));

  // Só as modalidades com publicação na janela têm série; a ordem e a cor seguem a modalidade (modalityColorIndex).
  const withData = view.modalities
    .filter((modality) => points.some((point) => (point.byModality[String(modality.id)] ?? 0) > 0))
    .sort((a, b) => modalityColorIndex(a.id) - modalityColorIndex(b.id));
  const own = withData.slice(0, MAX_MODALITY_SERIES);
  const folded = withData.slice(MAX_MODALITY_SERIES);

  const series: PublicationSeries[] = own.map((modality) => ({
    key: String(modality.id),
    label: modality.name,
    colorIndex: modalityColorIndex(modality.id),
  }));
  if (folded.length > 0) {
    series.push({ key: OTHER_SERIES_KEY, label: 'Outras', colorIndex: null });
  }

  const bars = points.map((point): PublicationBar => {
    const values: Record<string, number> = {};
    for (const modality of own) {
      values[String(modality.id)] = point.byModality[String(modality.id)] ?? 0;
    }
    if (folded.length > 0) {
      values[OTHER_SERIES_KEY] = sum(folded.map((modality) => point.byModality[String(modality.id)] ?? 0));
    }
    if (period === 'daily') {
      return { key: point.key, label: dayAndMonth(point.key), title: formatIsoDate(point.key), values, total: sum(Object.values(values)) };
    }
    const { year, index } = monthParts(point.key);
    return {
      key: point.key,
      label: `${MONTH_ABBREVIATIONS[index]}/${year.slice(2)}`,
      title: `${MONTH_NAMES[index]} de ${year}${point.partial ? ' (até ontem)' : ''}`,
      values,
      total: sum(Object.values(values)),
    };
  });

  const firstPoint = points[0];
  const firstDay = firstPoint === undefined ? '' : period === 'daily' ? firstPoint.key : `${firstPoint.key}-01`;
  return { series, bars, total: sum(bars.map((bar) => bar.total)), note: coverageNote(view.publications.coverageSince, firstDay) };
}

/** As barras do mini-gráfico de um card de modalidade: os publicados dos últimos 30 dias, uma série só. */
export function modalitySparkline(card: Pick<ModalityCard, 'daily'>, days: readonly string[]): PublicationBar[] {
  return card.daily.map((count, index) => {
    const day = days[index] ?? '';
    return { key: day, label: dayAndMonth(day), title: formatIsoDate(day), values: { published: count }, total: count };
  });
}

/** O link de um card de modalidade: Editais filtrado por ela. */
export function modalityLink(modalityId: number): string {
  return `/buscar?${toSearchParams(withFilters(DEFAULT_SEARCH_STATE, { modalities: [modalityId] })).toString()}`;
}

const percentOf = (part: number, whole: number): string => `${Math.round((part / whole) * 100)}%`;

/** Funil dos últimos 30 dias: acompanhados, vou participar e participei, com a % de cada etapa sobre a anterior. */
export function funnelItems(funnel: DashboardView['funnel']): CountItem[] {
  return [
    { key: 'tracked', label: 'Acompanhados', count: funnel.tracked },
    {
      key: 'participating',
      label: 'Vou participar',
      count: funnel.participating,
      ...(funnel.tracked > 0 ? { suffix: percentOf(funnel.participating, funnel.tracked) } : {}),
    },
    {
      key: 'participated',
      label: 'Participei',
      count: funnel.participated,
      ...(funnel.participating > 0 ? { suffix: percentOf(funnel.participated, funnel.participating) } : {}),
    },
  ];
}

/** A carga de prazos: quantos acompanhados encerram em cada semana, "26/10 a 01/11". */
export function deadlineWeekItems(load: DashboardView['deadlineLoad']): CountItem[] {
  return load.map((week) => ({
    key: week.startDay,
    label: `${dayAndMonth(week.startDay)} a ${dayAndMonth(addDaysToIsoDate(week.startDay, 6))}`,
    count: week.count,
  }));
}

const SPHERE_LABELS: Record<string, string> = { F: 'Federal', E: 'Estadual', M: 'Municipal', D: 'Distrital' };
const SPHERE_NOT_INFORMED = 'Não informada';

/** A esfera dos editais abertos, com o nome por extenso. */
export function sphereItems(openBySphere: DashboardView['openBySphere']): CountItem[] {
  return openBySphere.map((item) => ({
    key: item.sphere ?? 'none',
    label: item.sphere === null ? SPHERE_NOT_INFORMED : (SPHERE_LABELS[item.sphere] ?? item.sphere),
    count: item.count,
  }));
}

/** Os órgãos que mais publicam; o nome leva à página do CNPJ quando o CNPJ é válido. */
export function agencyItems(topAgencies: DashboardView['topAgencies']): CountItem[] {
  return topAgencies.map((agency) => {
    const to = cnpjLinkPath(agency.cnpj);
    return {
      key: agency.cnpj,
      label: agency.name ?? formatCnpj(agency.cnpj),
      count: agency.count,
      ...(to === null ? {} : { to }),
    };
  });
}

/** Os editais abertos por UF das buscas salvas. */
export function stateItems(openByState: DashboardView['openByState']): CountItem[] {
  return openByState.map((item) => ({ key: item.state, label: item.state, count: item.count }));
}

/** Contratos que vencem em 30, 60 e 90 dias; as janelas são acumuladas (a de 60 dias inclui a de 30). */
export function expiringWindowItems(view: Pick<ExpiringContractsView, 'within30Days' | 'within60Days' | 'within90Days'>): CountItem[] {
  return [
    { key: '30', label: 'Até 30 dias', count: view.within30Days },
    { key: '60', label: 'Até 60 dias', count: view.within60Days },
    { key: '90', label: 'Até 90 dias', count: view.within90Days },
  ];
}

/** Os contratos que vencem em até 90 dias, por categoria. */
export function expiringCategoryItems(byCategory: ExpiringContractsView['byCategory']): CountItem[] {
  return byCategory.map((item) => ({
    key: String(item.categoryId ?? 'none'),
    label: item.categoryName ?? 'Sem categoria',
    count: item.count,
  }));
}

/** Texto do card de contratos que vencem: as janelas maiores, ou o que falta para ele ter número. */
export function expiringHint(view: Pick<ExpiringContractsView, 'within60Days' | 'within90Days' | 'sources'>): string {
  if (view.sources.savedSearches === 0 && view.sources.favorites === 0) return 'Salve uma busca de contratos para acompanhar';
  return `Em 60 dias: ${view.within60Days.toLocaleString('pt-BR')} · em 90: ${view.within90Days.toLocaleString('pt-BR')}`;
}
