// Receitas geradas pelos contratos: da agenda (contractSchedule) para as
// linhas de `receitas`, com cliente, contrato, cobrança, competência,
// representante, categoria da cobrança e, em órgão público, bruto e
// retenções. Também o que a alteração e o aditivo mantêm, refazem ou
// cancelam, e o complemento do contrato sem prazo.
import { and, eq, gte, inArray, isNull, max, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { accountMembers, accounts, incomes, type NewIncome } from '../db/schema';
import { clients, contractCharges, contracts, type Contract, type ContractCharge } from '../modules/contracts/db/schema';
import { getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { RequestInputError } from '../utils/requestInput';
import { contractRates, incomeAmounts } from './contractRetentions';
import {
  addMonths, buildContractSchedule, competenceOf, scheduledIncomeDescription,
  type ContractScheduleState, type ContractScheduleTerms, type ScheduledIncome,
} from './contractSchedule';
import {
  BILLED_INCOME_STATUSES, CHARGE_KINDS, CHARGE_LABELS, INCOME_STATUS, OPEN_ENDED_MONTHS_AHEAD,
  type ChargeKind, type WithholdingRates,
} from './contractTypes';
import { ensureContractIncomeClassification } from './incomeClassificationCatalog';
import { cancelIncomeInTransaction } from './incomeService';

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, 'select'>;

export function toDecimal(value: number): string {
  return value.toFixed(2);
}

/** O que a geração de receitas precisa saber do contrato. */
export interface IncomeGenerationContext {
  contractId: number;
  accountId: number;
  /** Dono da conta (titular): as receitas do contrato são da empresa, como o catálogo. */
  ownerId: number;
  clientId: number;
  clientName: string;
  representativeId: number | null;
  rates: WithholdingRates;
  /** Categoria escolhida no contrato para cada cobrança; nula usa a padrão de "Contratos". */
  classifications: Record<ChargeKind, number | null>;
  chargeIds: Partial<Record<ChargeKind, number>>;
}

export function chargeIdsByKind(charges: Pick<ContractCharge, 'id' | 'kind'>[]): Partial<Record<ChargeKind, number>> {
  const ids: Partial<Record<ChargeKind, number>> = {};
  for (const charge of charges) {
    ids[charge.kind] = charge.id;
  }
  return ids;
}

/** Termos da agenda a partir do que está gravado. */
export function scheduleTermsOf(contract: Contract, charges: ContractCharge[]): ContractScheduleTerms {
  const installment = (kind: ChargeKind) => {
    const charge = charges.find((item) => item.kind === kind);
    return charge && charge.installments !== null && charge.firstDate !== null
      ? { amount: Number(charge.amount), installments: charge.installments, firstDate: charge.firstDate }
      : null;
  };
  const monthly = charges.find((item) => item.kind === 'mensalidade');
  return {
    startDate: contract.startDate,
    endDate: contract.endDate,
    dueDay: contract.dueDay,
    monthlyFee: monthly ? Number(monthly.amount) : null,
    setupFee: installment('implantacao'),
    projectFee: installment('projeto'),
  };
}

export async function loadGenerationContext(executor: Reader, contract: Contract): Promise<IncomeGenerationContext> {
  const [client] = await executor.select({ name: clients.name }).from(clients).where(eq(clients.id, contract.clientId)).limit(1);
  const charges = await executor
    .select({ id: contractCharges.id, kind: contractCharges.kind })
    .from(contractCharges)
    .where(eq(contractCharges.contractId, contract.id));
  return {
    contractId: contract.id,
    accountId: contract.accountId,
    ownerId: contract.ownerId,
    clientId: contract.clientId,
    clientName: client!.name,
    representativeId: contract.representativeId,
    rates: contractRates(contract),
    classifications: {
      mensalidade: contract.monthlyClassificationId,
      implantacao: contract.setupClassificationId,
      projeto: contract.projectClassificationId,
    },
    chargeIds: chargeIdsByKind(charges),
  };
}

/**
 * Grava as receitas da agenda como previstas. Sem comissão: a da receita de
 * contrato sai no recebimento. `ignoreConflicts` deixa passar o mês que outra
 * gravação acabou de criar (índice único por cobrança e competência).
 */
export async function insertScheduledIncomes(
  executor: Transaction,
  context: IncomeGenerationContext,
  items: ScheduledIncome[],
  options: { ignoreConflicts?: boolean } = {},
): Promise<number> {
  if (items.length === 0) {
    return 0;
  }
  const classificationIds: Partial<Record<ChargeKind, number>> = {};
  for (const kind of new Set(items.map((item) => item.chargeKind))) {
    classificationIds[kind] = context.classifications[kind]
      ?? await ensureContractIncomeClassification(executor, context.ownerId, kind);
  }

  const rows: NewIncome[] = items.map((item) => {
    const chargeId = context.chargeIds[item.chargeKind];
    if (chargeId === undefined) {
      throw new Error(`Contract ${context.contractId} has no ${item.chargeKind} charge`);
    }
    const amounts = incomeAmounts(item.amount, context.rates);
    const { mes, ano } = getMonthYearFromIsoDate(item.dueDate);
    return {
      userId: context.ownerId,
      accountId: context.accountId,
      description: scheduledIncomeDescription(item, context.clientName),
      amount: toDecimal(amounts.net),
      receiptDate: item.dueDate,
      month: mes,
      year: ano,
      status: INCOME_STATUS.planned,
      contractId: context.contractId,
      clientId: context.clientId,
      chargeId,
      competence: item.competence,
      classificationId: classificationIds[item.chargeKind] ?? null,
      representativeId: context.representativeId,
      grossAmount: amounts.withholdings ? toDecimal(amounts.gross) : null,
      withholdings: amounts.withholdings,
    };
  });
  const insert = executor.insert(incomes).values(rows);
  const inserted = options.ignoreConflicts
    ? await insert.onConflictDoNothing().returning({ id: incomes.id })
    : await insert.returning({ id: incomes.id });
  return inserted.length;
}

export interface ContractUpdatePlan {
  state: ContractScheduleState;
  /** Previstas de competência a partir do mês atual: a alteração apaga e gera de novo. */
  replacedIncomeIds: number[];
}

/**
 * Alteração do contrato: só as futuras ainda previstas são refeitas. As
 * faturadas, as recebidas, as canceladas e as previstas de meses anteriores
 * ficam e travam o mês delas. Cobrança que sai do contrato não pode ter
 * nenhuma dessas, fora as canceladas: aí o caminho é o aditivo.
 */
export async function planContractUpdate(
  executor: Reader,
  contractId: number,
  existingCharges: Pick<ContractCharge, 'id' | 'kind'>[],
  nextKinds: ReadonlySet<ChargeKind>,
  today: string,
): Promise<ContractUpdatePlan> {
  const currentMonth = competenceOf(today);
  const chargeIds = existingCharges.map((charge) => charge.id);
  const rows = chargeIds.length === 0
    ? []
    : await executor
      .select({ id: incomes.id, chargeId: incomes.chargeId, competence: incomes.competence, status: incomes.status })
      .from(incomes)
      .where(and(eq(incomes.contractId, contractId), inArray(incomes.chargeId, chargeIds)));
  const isReplaced = (row: (typeof rows)[number]) => row.status === INCOME_STATUS.planned
    && row.competence !== null && row.competence >= currentMonth;

  const state: ContractScheduleState = {};
  for (const kind of CHARGE_KINDS) {
    state[kind] = { fromCompetence: currentMonth, locked: new Set() };
  }
  for (const charge of existingCharges) {
    const kept = rows.filter((row) => row.chargeId === charge.id && !isReplaced(row));
    if (!nextKinds.has(charge.kind) && kept.some((row) => row.status !== INCOME_STATUS.cancelled)) {
      throw new RequestInputError(
        `${CHARGE_LABELS[charge.kind]}: a cobrança já tem receitas faturadas, recebidas ou de meses anteriores e não pode sair do contrato. Para mudar as cobranças, faça um aditivo.`,
      );
    }
    state[charge.kind] = {
      fromCompetence: currentMonth,
      locked: new Set(kept.flatMap((row) => (row.competence ? [row.competence] : []))),
    };
  }
  return { state, replacedIncomeIds: rows.filter(isReplaced).map((row) => row.id) };
}

/**
 * Aditivo: o contrato novo gera a partir do mês de início, pulando os meses
 * que o anterior já faturou ou recebeu naquela mesma cobrança.
 */
export async function planAmendment(executor: Reader, previousContractId: number, startDate: string): Promise<ContractScheduleState> {
  const startMonth = competenceOf(startDate);
  const billed = await executor
    .select({ kind: contractCharges.kind, competence: incomes.competence })
    .from(incomes)
    .innerJoin(contractCharges, eq(contractCharges.id, incomes.chargeId))
    .where(and(
      eq(incomes.contractId, previousContractId),
      inArray(incomes.status, [...BILLED_INCOME_STATUSES]),
      gte(incomes.competence, startMonth),
    ));
  const state: ContractScheduleState = {};
  for (const kind of CHARGE_KINDS) {
    state[kind] = {
      fromCompetence: startMonth,
      locked: new Set(billed.flatMap((row) => (row.kind === kind && row.competence ? [row.competence] : []))),
    };
  }
  return state;
}

/** Previstas do contrato a partir da competência (as de horas, sem competência, pela data). */
function plannedFrom(contractId: number, fromCompetence: string): SQL {
  return and(
    eq(incomes.contractId, contractId),
    eq(incomes.status, INCOME_STATUS.planned),
    sql`coalesce(${incomes.competence}, ${incomes.receiptDate}) >= ${fromCompetence}`,
  )!;
}

export async function countPlannedIncomesFrom(executor: Reader, contractId: number, fromCompetence: string): Promise<number> {
  const rows = await executor.select({ id: incomes.id }).from(incomes).where(plannedFrom(contractId, fromCompetence));
  return rows.length;
}

/** Cancela as previstas do contrato a partir da competência, desfazendo a comissão que alguma tenha. */
export async function cancelPlannedIncomesFrom(executor: Transaction, contractId: number, fromCompetence: string): Promise<number> {
  const rows = await executor
    .select({ id: incomes.id, userId: incomes.userId })
    .from(incomes)
    .where(plannedFrom(contractId, fromCompetence));
  for (const row of rows) {
    await cancelIncomeInTransaction(executor, row.userId, row.id);
  }
  return rows.length;
}

// ── Contrato sem prazo ────────────────────────────────────────────────────

/** Contas em que a pessoa é dona ou colaboradora ativa. */
function accountsOfUser(userId: number): SQL {
  return or(
    inArray(contracts.accountId, db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId))),
    inArray(
      contracts.accountId,
      db.select({ id: accountMembers.accountId })
        .from(accountMembers)
        .where(and(eq(accountMembers.userId, userId), eq(accountMembers.status, 'ativo'))),
    ),
  )!;
}

async function topUpContract(contractId: number, today: string): Promise<number> {
  return db.transaction(async (transaction) => {
    // Contrato sendo alterado agora: fica para a próxima chamada.
    const [contract] = await transaction
      .select()
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!contract || contract.status !== 'ativo' || contract.endDate !== null) {
      return 0;
    }
    const [monthly] = await transaction
      .select()
      .from(contractCharges)
      .where(and(eq(contractCharges.contractId, contract.id), eq(contractCharges.kind, 'mensalidade')))
      .limit(1);
    if (!monthly) {
      return 0;
    }
    const [last] = await transaction
      .select({ competence: max(incomes.competence) })
      .from(incomes)
      .where(eq(incomes.chargeId, monthly.id));
    const fromCompetence = last?.competence ? addMonths(last.competence, 1) : competenceOf(today);
    const items = buildContractSchedule(
      { ...scheduleTermsOf(contract, [monthly]), setupFee: null, projectFee: null },
      today,
      { mensalidade: { fromCompetence, locked: new Set() } },
    );
    const context = await loadGenerationContext(transaction, contract);
    return insertScheduledIncomes(transaction, context, items, { ignoreConflicts: true });
  });
}

/**
 * Mantém as 12 mensalidades previstas à frente nos contratos sem prazo: das
 * contas da pessoa (ao abrir o sistema) ou de todas (rotina interna). Uma
 * consulta acha os que precisam; os outros não custam nada.
 */
export async function topUpOpenEndedContracts(
  scope: { userId: number } | { all: true },
  today: string = getTodayIsoInTimezone(),
): Promise<number> {
  const horizon = addMonths(competenceOf(today), OPEN_ENDED_MONTHS_AHEAD - 1);
  const lastCompetence = sql`(select max(${incomes.competence}) from ${incomes} where ${incomes.chargeId} = ${contractCharges.id})`;
  const conditions: SQL[] = [
    eq(contracts.status, 'ativo'),
    isNull(contracts.endDate),
    sql`coalesce(${lastCompetence}, date '0001-01-01') < ${horizon}`,
  ];
  if ('userId' in scope) {
    conditions.push(accountsOfUser(scope.userId));
  }
  const candidates = await db
    .select({ id: contracts.id })
    .from(contracts)
    .innerJoin(contractCharges, and(eq(contractCharges.contractId, contracts.id), eq(contractCharges.kind, 'mensalidade')))
    .where(and(...conditions));

  let created = 0;
  for (const candidate of candidates) {
    created += await topUpContract(candidate.id, today);
  }
  return created;
}
