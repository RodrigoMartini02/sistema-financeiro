// Agenda das receitas de um contrato, sem banco: mensalidade mês a mês e
// parcelas de implantação e projeto. Datas em ISO (AAAA-MM-DD); a competência
// é o primeiro dia do mês. O serviço informa, por cobrança, a partir de qual
// competência pode gerar e quais meses já têm receita (travados); aqui só se
// calcula. O valor é sempre o bruto: as retenções vêm depois.
import { CHARGE_LABELS, OPEN_ENDED_MONTHS_AHEAD, type ChargeKind, type InstallmentChargeKind } from './contractTypes';

const pad = (value: number) => String(value).padStart(2, '0');
const MAX_DESCRIPTION_LENGTH = 255;
const CHARGE_ORDER: Record<ChargeKind, number> = { mensalidade: 0, implantacao: 1, projeto: 2 };

export interface InstallmentChargeTerms {
  amount: number;
  installments: number;
  firstDate: string;
}

export interface ContractScheduleTerms {
  startDate: string;
  /** Nula: sem prazo. */
  endDate: string | null;
  dueDay: number;
  monthlyFee: number | null;
  setupFee: InstallmentChargeTerms | null;
  projectFee: InstallmentChargeTerms | null;
}

export interface ChargeScheduleState {
  /** Primeira competência que pode ser gerada; nulo = desde o início da cobrança. */
  fromCompetence: string | null;
  /** Competências que não podem ser geradas: já têm receita mantida ou foram cobradas pelo contrato anterior. */
  locked: ReadonlySet<string>;
}

export type ContractScheduleState = Partial<Record<ChargeKind, ChargeScheduleState>>;

export interface ScheduledIncome {
  chargeKind: ChargeKind;
  competence: string;
  dueDate: string;
  amount: number;
  /** Parcela (1 a N) da implantação e do projeto; nula na mensalidade. */
  installment: number | null;
  installments: number | null;
}

const UNRESTRICTED: ChargeScheduleState = { fromCompetence: null, locked: new Set() };

/** Primeiro dia do mês da data. */
export function competenceOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(competence: string, months: number): string {
  const [year, month] = competence.split('-').map(Number);
  const index = year! * 12 + (month! - 1) + months;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;
}

/** Dia do mês da competência; além do fim do mês vira o último dia (31 em fevereiro → 28 ou 29). */
export function dateInMonth(competence: string, day: number): string {
  const [year, month] = competence.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return `${competence.slice(0, 7)}-${pad(Math.min(day, lastDay))}`;
}

/**
 * Última competência da mensalidade: o mês da data final ou, sem prazo, o 12º
 * mês contado do mês atual (ou do início, quando o contrato ainda não começou).
 */
export function lastMonthlyCompetence(startDate: string, endDate: string | null, today: string): string {
  if (endDate !== null) {
    return competenceOf(endDate);
  }
  const start = competenceOf(startDate);
  const current = competenceOf(today);
  return addMonths(start > current ? start : current, OPEN_ENDED_MONTHS_AHEAD - 1);
}

/** Partes iguais, com a diferença de centavos na última: R$ 1.000,00 em 3 = 333,33 + 333,33 + 333,34. */
export function splitInstallments(total: number, installments: number): number[] {
  const totalCents = Math.round(total * 100);
  const partCents = Math.floor(totalCents / installments);
  const amounts = Array.from({ length: installments }, () => partCents / 100);
  amounts[installments - 1] = (totalCents - partCents * (installments - 1)) / 100;
  return amounts;
}

function canGenerate(competence: string, state: ChargeScheduleState): boolean {
  if (state.fromCompetence !== null && competence < state.fromCompetence) {
    return false;
  }
  return !state.locked.has(competence);
}

function monthlySchedule(terms: ContractScheduleTerms, amount: number, today: string, state: ChargeScheduleState): ScheduledIncome[] {
  const items: ScheduledIncome[] = [];
  const last = lastMonthlyCompetence(terms.startDate, terms.endDate, today);
  for (let competence = competenceOf(terms.startDate); competence <= last; competence = addMonths(competence, 1)) {
    if (canGenerate(competence, state)) {
      items.push({
        chargeKind: 'mensalidade',
        competence,
        dueDate: dateInMonth(competence, terms.dueDay),
        amount,
        installment: null,
        installments: null,
      });
    }
  }
  return items;
}

/** Parcelas mensais a partir da primeira data, sempre no mesmo dia dela. */
function installmentSchedule(kind: InstallmentChargeKind, charge: InstallmentChargeTerms, state: ChargeScheduleState): ScheduledIncome[] {
  const firstCompetence = competenceOf(charge.firstDate);
  const day = Number(charge.firstDate.slice(8, 10));
  const items: ScheduledIncome[] = [];
  splitInstallments(charge.amount, charge.installments).forEach((amount, index) => {
    const competence = addMonths(firstCompetence, index);
    if (canGenerate(competence, state)) {
      items.push({
        chargeKind: kind,
        competence,
        dueDate: dateInMonth(competence, day),
        amount,
        installment: index + 1,
        installments: charge.installments,
      });
    }
  });
  return items;
}

/**
 * Receitas previstas do contrato, em ordem de vencimento. `today` define o
 * horizonte do contrato sem prazo; `state` limita cada cobrança (alteração,
 * aditivo e complemento do sem prazo). Cobrança sem estado gera tudo.
 */
export function buildContractSchedule(
  terms: ContractScheduleTerms,
  today: string,
  state: ContractScheduleState = {},
): ScheduledIncome[] {
  const items: ScheduledIncome[] = [];
  if (terms.monthlyFee !== null) {
    items.push(...monthlySchedule(terms, terms.monthlyFee, today, state.mensalidade ?? UNRESTRICTED));
  }
  if (terms.setupFee !== null) {
    items.push(...installmentSchedule('implantacao', terms.setupFee, state.implantacao ?? UNRESTRICTED));
  }
  if (terms.projectFee !== null) {
    items.push(...installmentSchedule('projeto', terms.projectFee, state.projeto ?? UNRESTRICTED));
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || CHARGE_ORDER[a.chargeKind] - CHARGE_ORDER[b.chargeKind]);
}

/** "Mensalidade - Cliente", "Implantação 1/3 - Cliente". */
export function scheduledIncomeDescription(item: Pick<ScheduledIncome, 'chargeKind' | 'installment' | 'installments'>, clientName: string): string {
  const label = CHARGE_LABELS[item.chargeKind];
  const charge = item.installment !== null ? `${label} ${item.installment}/${item.installments}` : label;
  return `${charge} - ${clientName}`.slice(0, MAX_DESCRIPTION_LENGTH);
}
