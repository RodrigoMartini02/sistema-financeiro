import type { TenderPrice, TenderSubscription } from '../types';
import { formatIsoDate } from './dates';

// Textos da assinatura do módulo. Os valores vêm do servidor (GET /billing).

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCents(cents: number): string {
  return BRL.format(cents / 100);
}

/** "Incluídos: você e mais 1. Cada usuário a mais: R$ 2,99/mês, a partir da próxima cobrança." */
export function priceNote(price: TenderPrice): string {
  const others = price.includedUsers - 1;
  const included = others > 0 ? `você e mais ${others}` : 'só você';
  return `Incluídos: ${included}. Cada usuário a mais: ${formatCents(price.extraUserCents)}/mês, a partir da próxima cobrança.`;
}

/** Situação para a tela: o que vale agora e até quando. */
export function situationLabel(subscription: Pick<TenderSubscription, 'situation' | 'trialUntil' | 'paidUntil'>): string {
  switch (subscription.situation) {
    case 'cortesia':
      return 'Cortesia: sem cobrança e sem limite de usuários';
    case 'teste':
      return subscription.trialUntil ? `Teste grátis até ${formatIsoDate(subscription.trialUntil)}` : 'Teste grátis';
    case 'paga':
      return subscription.paidUntil ? `Pago até ${formatIsoDate(subscription.paidUntil)}` : 'Pago';
    case 'recorrente':
      return 'Assinatura recorrente ativa (renova sozinha)';
    case 'vencida':
      return 'Assinatura vencida';
    case 'desligada':
      return 'Módulo desligado nesta conta';
  }
}

export function usersLabel(usersCount: number): string {
  return usersCount === 1 ? '1 usuário' : `${usersCount} usuários`;
}
