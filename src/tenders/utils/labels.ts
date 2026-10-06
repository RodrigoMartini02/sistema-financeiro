import type {
  CollectionRunStatus,
  CollectionRunType,
  NoticeSort,
  SearchTermsMode,
  TenderNotificationType,
  TrackingFilter,
  TrackingHistoryStatus,
  TrackingStatus,
} from '../types';
import { formatIsoDate } from './dates';
import { formatMoneyValue } from './money';

// Textos da tela para os valores da API.

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  ANALISAR: 'Analisar',
  PARTICIPAR: 'Vou participar',
  DESCARTADO: 'Descartado',
};

export const TRACKING_FILTER_LABELS: Record<TrackingFilter, string> = {
  ...TRACKING_STATUS_LABELS,
  SEM: 'Sem acompanhamento',
};

export const TRACKING_HISTORY_LABELS: Record<TrackingHistoryStatus, string> = {
  ...TRACKING_STATUS_LABELS,
  REMOVIDO: 'Removido',
};

/** Ações rápidas: o verbo de cada status. */
export const TRACKING_ACTION_LABELS: Record<TrackingStatus, string> = {
  ANALISAR: 'Analisar',
  PARTICIPAR: 'Vou participar',
  DESCARTADO: 'Descartar',
};

export const NOTICE_SORT_LABELS: Record<NoticeSort, string> = {
  closingAsc: 'Prazo mais próximo',
  publishedDesc: 'Publicação mais recente',
  valueDesc: 'Maior valor',
  valueAsc: 'Menor valor',
  relevance: 'Relevância',
};

export const TERMS_MODE_LABELS: Record<SearchTermsMode, string> = {
  E: 'Todas as palavras',
  OU: 'Qualquer palavra',
};

export const NOTIFICATION_TYPE_LABELS: Record<TenderNotificationType, string> = {
  NOVO_EDITAL: 'Novo edital',
  EDITAL_ALTERADO: 'Edital alterado',
  PRAZO_3D: 'Prazo em até 3 dias',
  PRAZO_1D: 'Prazo em até 1 dia',
};

export const RUN_TYPE_LABELS: Record<CollectionRunType, string> = {
  VARREDURA: 'Varredura',
  INCREMENTAL: 'Incremental',
  LEMBRETES: 'Lembretes de prazo',
  LIMPEZA: 'Limpeza',
  MANUAL: 'Manual',
};

export const RUN_STATUS_LABELS: Record<CollectionRunStatus, string> = {
  EXECUTANDO: 'Executando',
  SUCESSO: 'Sucesso',
  PARCIAL: 'Parcial',
  FALHA: 'Falha',
};

/** CNPJ com pontuação (00.000.000/0000-00); fora de 14 dígitos, como veio. */
export function formatCnpj(cnpj: string | null | undefined): string {
  const digits = (cnpj ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return cnpj ?? '';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/** "de R$ 10,00 a R$ 50,00", "a partir de R$ 10,00" ou "até R$ 50,00"; sem limites, null. */
export function valueRangeLabel(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `de ${formatMoneyValue(min)} a ${formatMoneyValue(max)}`;
  if (min !== null) return `a partir de ${formatMoneyValue(min)}`;
  if (max !== null) return `até ${formatMoneyValue(max)}`;
  return null;
}

/** "de 01/10/2026 a 31/10/2026", "a partir de 01/10/2026" ou "até 31/10/2026"; sem datas, null. */
export function dateRangeLabel(from: string | null, to: string | null): string | null {
  if (from && to) return `de ${formatIsoDate(from)} a ${formatIsoDate(to)}`;
  if (from) return `a partir de ${formatIsoDate(from)}`;
  if (to) return `até ${formatIsoDate(to)}`;
  return null;
}

/** Até `max` itens separados por vírgula e "+N" para o resto. */
export function listWithMore(items: string[], max = 3): string {
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} +${items.length - max}` : shown;
}
