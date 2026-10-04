// Textos e alertas da tela de clientes e contratos: rótulos de tipo e de
// situação, "vence em N dias", receita atrasada e os indicadores do topo. As
// regras de alerta são as do servidor (backend/src/services/contractAlerts.ts),
// repetidas aqui para a tela que já tem os dados.
import { formatCurrency } from '../screens/finance/formatters';
import { isoToBrDate } from './date';

export type ClientType = 'pessoa_fisica' | 'empresa' | 'orgao_publico';
export type GovernmentSphere = 'municipal' | 'estadual' | 'federal';
export type ChargeKind = 'mensalidade' | 'implantacao' | 'projeto';
export type ContractStatus = 'ativo' | 'encerrado';
export type WithholdingTax = 'ir' | 'pisCofinsCsll' | 'iss' | 'inss';
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

export const CLIENT_TYPES: ClientType[] = ['pessoa_fisica', 'empresa', 'orgao_publico'];
export const GOVERNMENT_SPHERES: GovernmentSphere[] = ['municipal', 'estadual', 'federal'];
export const WITHHOLDING_TAXES: WithholdingTax[] = ['ir', 'pisCofinsCsll', 'iss', 'inss'];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  pessoa_fisica: 'Pessoa física',
  empresa: 'Empresa',
  orgao_publico: 'Órgão público',
};

export const SPHERE_LABELS: Record<GovernmentSphere, string> = {
  municipal: 'Municipal',
  estadual: 'Estadual',
  federal: 'Federal',
};

export const CHARGE_LABELS: Record<ChargeKind, string> = {
  mensalidade: 'Mensalidade',
  implantacao: 'Implantação',
  projeto: 'Projeto',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ativo: 'Ativo',
  encerrado: 'Encerrado',
};

export const WITHHOLDING_LABELS: Record<WithholdingTax, string> = {
  ir: 'IR',
  pisCofinsCsll: 'PIS/COFINS/CSLL',
  iss: 'ISS',
  inss: 'INSS',
};

/** Alerta de contrato vencendo: data final dentro deste número de dias. */
export const EXPIRING_SOON_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!) / MS_PER_DAY;
}

/** Dias de hoje até a data (negativo quando já passou). */
export function daysUntil(isoDate: string, today: string): number {
  return dayNumber(isoDate) - dayNumber(today);
}

/** Contrato ativo com data final em até 60 dias, ou já passada. Sem prazo nunca vence. */
export function isExpiringSoon(status: ContractStatus, endDate: string | null, today: string): boolean {
  return status === 'ativo' && endDate !== null && daysUntil(endDate, today) <= EXPIRING_SOON_DAYS;
}

/** "Vence em 20 dias", "Vence hoje", "Venceu há 3 dias"; nulo sem data final. */
export function expiryLabel(endDate: string | null, today: string): string | null {
  if (endDate === null) {
    return null;
  }
  const days = daysUntil(endDate, today);
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  if (days > 1) return `Vence em ${days} dias`;
  if (days === -1) return 'Venceu ontem';
  return `Venceu há ${-days} dias`;
}

/** "01/01/2027 a 31/12/2027" ou "Desde 01/01/2027, sem prazo". */
export function termLabel(startDate: string, endDate: string | null): string {
  return endDate === null
    ? `Desde ${isoToBrDate(startDate)}, sem prazo`
    : `${isoToBrDate(startDate)} a ${isoToBrDate(endDate)}`;
}

export interface IncomeStatusView {
  label: string;
  tone: BadgeTone;
}

/** Situação da receita na tela; a prevista ou faturada vencida aparece como atrasada. */
export function incomeStatusView(status: string, dueDate: string, today: string): IncomeStatusView {
  const open = status === 'prevista' || status === 'faturada';
  if (open && dueDate < today) {
    return { label: status === 'faturada' ? 'Faturada, atrasada' : 'Atrasada', tone: 'danger' };
  }
  switch (status) {
    case 'prevista': return { label: 'Prevista', tone: 'neutral' };
    case 'faturada': return { label: 'Faturada', tone: 'info' };
    case 'ativa': return { label: 'Recebida', tone: 'success' };
    case 'cancelada': return { label: 'Cancelada', tone: 'neutral' };
    default: return { label: status, tone: 'neutral' };
  }
}

const percentFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoursFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** 4.8 → "4,80%". */
export function formatPercent(value: number): string {
  return `${percentFormat.format(value)}%`;
}

/** 12.5 → "12,5 h". */
export function formatHours(value: number): string {
  return `${hoursFormat.format(value)} h`;
}

/** "3 parcelas de R$ 333,33 a partir de 15/01/2027" (a última leva a diferença de centavos). */
export function installmentsLabel(charge: { amount: number; installments: number; firstDate: string }): string {
  const part = Math.floor(Math.round(charge.amount * 100) / charge.installments) / 100;
  const count = charge.installments === 1 ? 'Parcela única' : `${charge.installments} parcelas de ${formatCurrency(part)}`;
  return `${count} a partir de ${isoToBrDate(charge.firstDate)}`;
}

export interface SummaryCard {
  label: string;
  value: string;
  detail: string;
  tone: BadgeTone;
}

/** Indicadores do topo da lista de clientes, pelo líquido. */
export function clientsSummaryCards(summary: {
  monthlyRecurring: number;
  expiringContracts: number;
  overdueCount: number;
  overdueAmount: number;
}): SummaryCard[] {
  const contracts = summary.expiringContracts === 1 ? 'contrato' : 'contratos';
  const incomes = summary.overdueCount === 1 ? 'receita' : 'receitas';
  return [
    { label: 'Recorrente do mês', value: formatCurrency(summary.monthlyRecurring), detail: 'Mensalidades dos contratos ativos', tone: 'info' },
    {
      label: `Vencendo em ${EXPIRING_SOON_DAYS} dias`,
      value: `${summary.expiringContracts} ${contracts}`,
      detail: summary.expiringContracts > 0 ? 'Renove ou encerre a tempo' : 'Nenhum contrato perto do fim',
      tone: summary.expiringContracts > 0 ? 'warn' : 'neutral',
    },
    {
      label: 'Em atraso',
      value: formatCurrency(summary.overdueAmount),
      detail: summary.overdueCount > 0 ? `${summary.overdueCount} ${incomes} vencida${summary.overdueCount === 1 ? '' : 's'}` : 'Nada atrasado',
      tone: summary.overdueCount > 0 ? 'danger' : 'neutral',
    },
  ];
}
