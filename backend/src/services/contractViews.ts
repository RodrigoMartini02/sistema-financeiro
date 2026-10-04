// Consultas dos contratos: ficha (cobranças, saldos de horas e de empenho,
// reajuste, receitas e anexos), contratos do cliente, carteira do painel PJ e
// contratos com banco de horas para o lançamento de receita. Toda consulta
// filtra pela conta.
import { and, asc, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { incomes, representatives } from '../db/schema';
import {
  catalogServices, clients, contractCharges, contractCommitments, contractHourTypes, contractHourUsages,
  contractServices, contracts, type Contract,
} from '../modules/contracts/db/schema';
import { addMonthsClamped } from '../utils/date';
import { listContractAttachments, type ContractAttachmentView } from './contractAttachments';
import { commitmentBalances, type CommitmentBalance } from './contractCommitments';
import { hourTypeBalance, usedHoursByType } from './contractHours';
import { loadContractIndicators } from './contractIndicators';
import { readjustmentState } from './contractReadjustment';
import { contractRates, incomeAmounts } from './contractRetentions';
import {
  BILLED_INCOME_STATUSES, INCOME_STATUS,
  type ChargeKind, type ClientKind, type ContractStatus, type WithholdingAmounts, type WithholdingRates,
} from './contractTypes';

export interface ContractChargeView {
  amount: number;
  installments: number;
  firstDate: string;
}

export interface ContractHourTypeView {
  id: number;
  name: string;
  hourlyRate: number;
  quantity: number;
  used: number;
  balance: number;
}

export interface ContractIncomeView {
  id: number;
  description: string;
  status: string;
  chargeKind: ChargeKind | null;
  competence: string | null;
  dueDate: string;
  amount: number;
  grossAmount: number | null;
  withholdings: WithholdingAmounts | null;
  hours: { hourTypeName: string; hours: number } | null;
}

export interface ContractDetail {
  id: number;
  accountId: number;
  number: string | null;
  description: string | null;
  notes: string | null;
  startDate: string;
  endDate: string | null;
  dueDay: number;
  status: ContractStatus;
  closedAt: string | null;
  previousContractId: number | null;
  /** Aditivo que substituiu este contrato, se houver. */
  nextContractId: number | null;
  amendmentNumber: number;
  client: { id: number; name: string; type: ClientKind; document: string; active: boolean };
  representative: { id: number; name: string } | null;
  monthlyClassificationId: number | null;
  setupClassificationId: number | null;
  projectClassificationId: number | null;
  monthlyFee: number | null;
  monthlyNet: number | null;
  setupFee: ContractChargeView | null;
  projectFee: ContractChargeView | null;
  hourTypes: ContractHourTypeView[];
  /** Só no contrato com órgão público. */
  publicEntity: {
    process: string | null;
    modality: string | null;
    withholdings: WithholdingRates;
    commitments: CommitmentBalance[];
  } | null;
  services: Array<{ serviceId: number; name: string; deployed: boolean; active: boolean }>;
  readjustment: { baseDate: string; handledUntil: string | null; available: boolean; anniversary: string };
  expiringSoon: boolean;
  incomes: ContractIncomeView[];
  attachments: ContractAttachmentView[];
  /** Sem receita faturada ou recebida: pode ser excluído. */
  canDelete: boolean;
}

export interface ContractListItem {
  id: number;
  number: string | null;
  description: string | null;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  dueDay: number;
  closedAt: string | null;
  amendmentNumber: number;
  previousContractId: number | null;
  monthlyFee: number | null;
  monthlyNet: number | null;
  hasHours: boolean;
  expiringSoon: boolean;
  readjustmentAvailable: boolean;
  overdueCount: number;
  overdueAmount: number;
}

const toNumber = (value: string | null): number | null => (value === null ? null : Number(value));

/** Contratos do cliente na conta, os ativos primeiro e os mais novos em cima. */
export async function listClientContracts(accountId: number, clientId: number, today: string): Promise<ContractListItem[]> {
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.accountId, accountId), eq(contracts.clientId, clientId)))
    .orderBy(asc(contracts.status), desc(contracts.startDate), desc(contracts.id));
  const indicators = new Map(
    (await loadContractIndicators(accountId, today, { contractIds: rows.map((row) => row.id) }))
      .map((indicator) => [indicator.contractId, indicator]),
  );
  return rows.map((row) => {
    const indicator = indicators.get(row.id);
    return {
      id: row.id,
      number: row.number,
      description: row.description,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      dueDay: row.dueDay,
      closedAt: row.closedAt,
      amendmentNumber: row.amendmentNumber,
      previousContractId: row.previousContractId,
      monthlyFee: indicator?.monthlyFee ?? null,
      monthlyNet: indicator?.monthlyNet ?? null,
      hasHours: indicator?.hasHours ?? false,
      expiringSoon: indicator?.expiringSoon ?? false,
      readjustmentAvailable: indicator?.readjustmentAvailable ?? false,
      overdueCount: indicator?.overdueCount ?? 0,
      overdueAmount: indicator?.overdueAmount ?? 0,
    };
  });
}

export async function getContractDetail(contract: Contract, today: string): Promise<ContractDetail> {
  const [client] = await db.select().from(clients).where(eq(clients.id, contract.clientId)).limit(1);
  const [representative] = contract.representativeId === null
    ? []
    : await db
      .select({ id: representatives.id, name: representatives.name })
      .from(representatives)
      .where(eq(representatives.id, contract.representativeId))
      .limit(1);
  const [next] = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.previousContractId, contract.id)).limit(1);
  const charges = await db.select().from(contractCharges).where(eq(contractCharges.contractId, contract.id));
  const hourTypes = await db
    .select()
    .from(contractHourTypes)
    .where(eq(contractHourTypes.contractId, contract.id))
    .orderBy(asc(contractHourTypes.name));
  const usedHours = await usedHoursByType(db, hourTypes.map((hourType) => hourType.id));
  const services = await db
    .select({
      serviceId: contractServices.serviceId,
      name: catalogServices.name,
      deployed: contractServices.deployed,
      active: catalogServices.active,
    })
    .from(contractServices)
    .innerJoin(catalogServices, eq(catalogServices.id, contractServices.serviceId))
    .where(eq(contractServices.contractId, contract.id))
    .orderBy(asc(catalogServices.name));

  const incomeRows = await db
    .select({
      id: incomes.id,
      description: incomes.description,
      status: incomes.status,
      chargeKind: contractCharges.kind,
      competence: incomes.competence,
      dueDate: incomes.receiptDate,
      amount: incomes.amount,
      grossAmount: incomes.grossAmount,
      withholdings: incomes.withholdings,
      hourTypeName: contractHourTypes.name,
      hours: contractHourUsages.hours,
    })
    .from(incomes)
    .leftJoin(contractCharges, eq(contractCharges.id, incomes.chargeId))
    .leftJoin(contractHourUsages, eq(contractHourUsages.incomeId, incomes.id))
    .leftJoin(contractHourTypes, eq(contractHourTypes.id, contractHourUsages.hourTypeId))
    .where(and(eq(incomes.contractId, contract.id), eq(incomes.accountId, contract.accountId)))
    .orderBy(asc(incomes.receiptDate), asc(incomes.id));

  const rates = contractRates(contract);
  const monthly = charges.find((charge) => charge.kind === 'mensalidade');
  const monthlyFee = monthly ? Number(monthly.amount) : null;
  const installment = (kind: ChargeKind): ContractChargeView | null => {
    const charge = charges.find((item) => item.kind === kind);
    return charge && charge.installments !== null && charge.firstDate !== null
      ? { amount: Number(charge.amount), installments: charge.installments, firstDate: charge.firstDate }
      : null;
  };

  let publicEntity: ContractDetail['publicEntity'] = null;
  if (client!.kind === 'orgao_publico') {
    const commitments = await db
      .select()
      .from(contractCommitments)
      .where(eq(contractCommitments.contractId, contract.id));
    const usedByYear = await db
      .select({
        year: sql<number>`extract(year from coalesce(${incomes.competence}, ${incomes.receiptDate}))::int`,
        total: sql<string>`sum(coalesce(${incomes.grossAmount}, ${incomes.amount}))`,
      })
      .from(incomes)
      .where(and(eq(incomes.contractId, contract.id), inArray(incomes.status, [...BILLED_INCOME_STATUSES])))
      .groupBy(sql`1`);
    publicEntity = {
      process: contract.process,
      modality: contract.modality,
      withholdings: rates,
      commitments: commitmentBalances(
        commitments.map((commitment) => ({ year: commitment.year, number: commitment.number, amount: Number(commitment.amount) })),
        new Map(usedByYear.map((row) => [Number(row.year), Number(row.total)])),
      ),
    };
  }

  const indicators = await loadContractIndicators(contract.accountId, today, { contractIds: [contract.id] });
  const readjustment = readjustmentState(contract.readjustmentBaseDate, contract.readjustmentHandledUntil, today);

  return {
    id: contract.id,
    accountId: contract.accountId,
    number: contract.number,
    description: contract.description,
    notes: contract.notes,
    startDate: contract.startDate,
    endDate: contract.endDate,
    dueDay: contract.dueDay,
    status: contract.status,
    closedAt: contract.closedAt,
    previousContractId: contract.previousContractId,
    nextContractId: next?.id ?? null,
    amendmentNumber: contract.amendmentNumber,
    client: { id: client!.id, name: client!.name, type: client!.kind, document: client!.document, active: client!.active },
    representative: representative ?? null,
    monthlyClassificationId: contract.monthlyClassificationId,
    setupClassificationId: contract.setupClassificationId,
    projectClassificationId: contract.projectClassificationId,
    monthlyFee,
    monthlyNet: monthlyFee === null ? null : incomeAmounts(monthlyFee, rates).net,
    setupFee: installment('implantacao'),
    projectFee: installment('projeto'),
    hourTypes: hourTypes.map((hourType) => ({
      id: hourType.id,
      name: hourType.name,
      hourlyRate: Number(hourType.hourlyRate),
      quantity: Number(hourType.quantity),
      ...hourTypeBalance(Number(hourType.quantity), usedHours.get(hourType.id) ?? 0),
    })),
    publicEntity,
    services,
    readjustment: {
      baseDate: contract.readjustmentBaseDate,
      handledUntil: contract.readjustmentHandledUntil,
      available: indicators[0]?.readjustmentAvailable ?? false,
      anniversary: readjustment.anniversary,
    },
    expiringSoon: indicators[0]?.expiringSoon ?? false,
    incomes: incomeRows.map((row) => ({
      id: row.id,
      description: row.description,
      status: row.status,
      chargeKind: row.chargeKind,
      competence: row.competence,
      dueDate: row.dueDate,
      amount: Number(row.amount),
      grossAmount: toNumber(row.grossAmount),
      withholdings: row.withholdings,
      hours: row.hourTypeName !== null && row.hours !== null ? { hourTypeName: row.hourTypeName, hours: Number(row.hours) } : null,
    })),
    attachments: await listContractAttachments(contract.id),
    canDelete: !incomeRows.some((row) => BILLED_INCOME_STATUSES.includes(row.status)),
  };
}

export interface PortfolioItem {
  contractId: number;
  number: string | null;
  clientId: number;
  clientName: string;
  status: ContractStatus;
  monthlyFee: number;
  /** Pelo líquido em órgão público: é o que entra. */
  monthlyNet: number;
  /** Mensalidade do mês (a mais recente não cancelada, ou a cancelada se só houver ela). */
  income: { id: number; status: string; amount: number; dueDate: string } | null;
}

/**
 * Carteira do Painel PJ: contratos com mensalidade que valem no mês (ativos,
 * ou encerrados depois do início dele) e a situação da receita do mês.
 */
export async function contractPortfolio(accountId: number, month: number, year: number): Promise<PortfolioItem[]> {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = addMonthsClamped(monthStart, 1);
  const rows = await db
    .select({
      contract: contracts,
      clientName: clients.name,
      chargeId: contractCharges.id,
      monthlyFee: contractCharges.amount,
    })
    .from(contracts)
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .innerJoin(contractCharges, and(eq(contractCharges.contractId, contracts.id), eq(contractCharges.kind, 'mensalidade')))
    .where(and(
      eq(contracts.accountId, accountId),
      sql`${contracts.startDate} < ${monthEnd}`,
      or(sql`${contracts.endDate} is null`, gte(contracts.endDate, monthStart)),
      or(eq(contracts.status, 'ativo'), gte(contracts.closedAt, monthStart)),
    ))
    .orderBy(asc(clients.name), asc(contracts.id));
  if (rows.length === 0) {
    return [];
  }

  const monthIncomes = await db
    .select({
      id: incomes.id,
      chargeId: incomes.chargeId,
      status: incomes.status,
      amount: incomes.amount,
      dueDate: incomes.receiptDate,
    })
    .from(incomes)
    .where(and(
      eq(incomes.accountId, accountId),
      inArray(incomes.chargeId, rows.map((row) => row.chargeId)),
      eq(incomes.competence, monthStart),
    ))
    .orderBy(desc(incomes.id));

  return rows.map((row) => {
    const own = monthIncomes.filter((income) => income.chargeId === row.chargeId);
    const income = own.find((item) => item.status !== INCOME_STATUS.cancelled) ?? own[0];
    const monthlyFee = Number(row.monthlyFee);
    return {
      contractId: row.contract.id,
      number: row.contract.number,
      clientId: row.contract.clientId,
      clientName: row.clientName,
      status: row.contract.status,
      monthlyFee,
      monthlyNet: incomeAmounts(monthlyFee, contractRates(row.contract)).net,
      income: income
        ? { id: income.id, status: income.status, amount: Number(income.amount), dueDate: income.dueDate }
        : null,
    };
  });
}

export interface ContractWithHours {
  contractId: number;
  number: string | null;
  description: string | null;
  clientId: number;
  clientName: string;
  clientType: ClientKind;
  /** Percentuais do contrato com órgão público; vazio nos outros. */
  withholdings: WithholdingRates;
  representativeId: number | null;
  hourTypes: ContractHourTypeView[];
}

/** Contratos ativos com banco de horas, para "Horas a faturar" no lançamento de receita. */
export async function contractsWithHours(accountId: number): Promise<ContractWithHours[]> {
  const rows = await db
    .select({ contract: contracts, clientName: clients.name, clientType: clients.kind })
    .from(contracts)
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .where(and(
      eq(contracts.accountId, accountId),
      eq(contracts.status, 'ativo'),
      sql`exists (select 1 from ${contractHourTypes} where ${contractHourTypes.contractId} = ${contracts.id})`,
    ))
    .orderBy(asc(clients.name), asc(contracts.id));
  if (rows.length === 0) {
    return [];
  }
  const hourTypes = await db
    .select()
    .from(contractHourTypes)
    .where(inArray(contractHourTypes.contractId, rows.map((row) => row.contract.id)))
    .orderBy(asc(contractHourTypes.name));
  const used = await usedHoursByType(db, hourTypes.map((hourType) => hourType.id));

  return rows.map((row) => ({
    contractId: row.contract.id,
    number: row.contract.number,
    description: row.contract.description,
    clientId: row.contract.clientId,
    clientName: row.clientName,
    clientType: row.clientType,
    withholdings: row.clientType === 'orgao_publico' ? contractRates(row.contract) : {},
    representativeId: row.contract.representativeId,
    hourTypes: hourTypes
      .filter((hourType) => hourType.contractId === row.contract.id)
      .map((hourType) => ({
        id: hourType.id,
        name: hourType.name,
        hourlyRate: Number(hourType.hourlyRate),
        quantity: Number(hourType.quantity),
        ...hourTypeBalance(Number(hourType.quantity), used.get(hourType.id) ?? 0),
      })),
  }));
}
