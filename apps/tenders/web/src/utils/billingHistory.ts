import type { BillingCancelOrigin, BillingEvent, BillingEventStatus } from '../types';
import { formatCents, usersLabel } from './billing';

// Histórico de cobrança da assinatura (item 1B): agrupar por mês e os textos de cada evento. Sem React, para ter
// teste: o componente só liga estes passos à tela. As datas vêm em ISO com o fuso de Brasília e o mês sai da própria
// string, sem passar pelo fuso do navegador.

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

const ISO_YEAR_MONTH = /^(\d{4})-(\d{2})/;
const NO_DATE = 'Sem data';

/** "2026-11" a partir da data ISO; data ilegível fica num grupo só, "sem-data". */
export function monthKey(iso: string): string {
  const parts = ISO_YEAR_MONTH.exec(iso);
  return parts ? `${parts[1]}-${parts[2]}` : 'sem-data';
}

/** "novembro de 2026"; data ilegível, "Sem data". */
export function monthLabel(iso: string): string {
  const parts = ISO_YEAR_MONTH.exec(iso);
  const month = parts ? MONTH_NAMES[Number(parts[2]) - 1] : undefined;
  return parts && month ? `${month} de ${parts[1]}` : NO_DATE;
}

export interface BillingMonthGroup {
  key: string;
  label: string;
  events: BillingEvent[];
}

/** Os eventos agrupados por mês, na ordem em que chegam (do mais recente ao mais antigo), sem trocar a ordem dentro do mês. */
export function groupBillingEvents(events: readonly BillingEvent[]): BillingMonthGroup[] {
  const groups = new Map<string, BillingMonthGroup>();
  for (const event of events) {
    const key = monthKey(event.occurredAt);
    const group = groups.get(key) ?? { key, label: monthLabel(event.occurredAt), events: [] };
    group.events.push(event);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** O que aconteceu, em uma linha. */
export function eventTitle(event: Pick<BillingEvent, 'type' | 'method'>): string {
  if (event.type === 'ASSINATURA') return 'Assinatura recorrente ativada';
  if (event.type === 'CANCELAMENTO') return 'Assinatura recorrente cancelada';
  switch (event.method) {
    case 'PIX':
      return 'Pagamento por Pix';
    case 'CARTAO':
      return 'Pagamento no cartão';
    case 'RECORRENTE':
      return 'Cobrança mensal da assinatura';
    default:
      return 'Pagamento';
  }
}

const CANCEL_ORIGIN_NOTES: Record<BillingCancelOrigin, string> = {
  TITULAR: 'Por você',
  MERCADO_PAGO: 'Pelo Mercado Pago',
  COBRANCA_RECUSADA: 'Por cobrança recusada',
};

/** A linha de apoio: a origem do cancelamento, ou os usuários cobrados; sem nada a dizer, null. */
export function eventNote(event: Pick<BillingEvent, 'type' | 'origin' | 'users'>): string | null {
  if (event.type === 'CANCELAMENTO') {
    return event.origin ? CANCEL_ORIGIN_NOTES[event.origin] ?? null : null;
  }
  return event.users === null ? null : usersLabel(event.users);
}

/** "R$ 4,99"; evento sem valor (cancelamento, ou valor que o Mercado Pago não informou), null. */
export function eventAmount(event: Pick<BillingEvent, 'amountCents'>): string | null {
  return event.amountCents === null ? null : formatCents(event.amountCents);
}

type StatusTone = 'income' | 'expense' | 'neutral' | 'warning';

const STATUS_VIEWS: Record<BillingEventStatus, { label: string; tone: StatusTone }> = {
  APROVADO: { label: 'Aprovado', tone: 'income' },
  RECUSADO: { label: 'Recusado', tone: 'expense' },
  ATIVADA: { label: 'Ativada', tone: 'income' },
  CANCELADA: { label: 'Cancelada', tone: 'warning' },
};

/** O selo do status; um status que a tela não conhece aparece como veio, em tom neutro. */
export function statusView(status: BillingEventStatus): { label: string; tone: StatusTone } {
  return STATUS_VIEWS[status] ?? { label: String(status), tone: 'neutral' };
}
