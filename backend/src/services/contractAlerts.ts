// Alertas do contrato na lista de clientes e na ficha, sem banco: contrato
// vencendo (data final nos próximos 60 dias, ou já passada com o contrato
// ainda ativo) e receita atrasada (prevista ou faturada depois do vencimento).
import { addDaysToIsoDate } from '../utils/date';
import { EXPIRING_SOON_DAYS, OPEN_INCOME_STATUSES, type ContractStatus } from './contractTypes';

/** Contrato sem prazo nunca vence; o encerrado não avisa mais. */
export function isExpiringSoon(status: ContractStatus, endDate: string | null, today: string): boolean {
  return status === 'ativo' && endDate !== null && endDate <= addDaysToIsoDate(today, EXPIRING_SOON_DAYS);
}

/** Receita ainda a receber cujo vencimento já passou (a que vence hoje ainda não está atrasada). */
export function isOverdueIncome(status: string, dueDate: string, today: string): boolean {
  return OPEN_INCOME_STATUSES.includes(status) && dueDate < today;
}
