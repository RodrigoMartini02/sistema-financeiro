// Indicadores dos contratos de uma conta PJ, para a lista de clientes, o
// resumo do topo e a lista de contratos do cliente: mensalidade (bruta e
// líquida), contrato vencendo, reajuste disponível e receitas atrasadas.
// Duas consultas para qualquer quantidade de contratos.
import { and, count, eq, inArray, lt, sql, sum, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { incomes } from '../db/schema';
import { contractCharges, contractHourTypes, contracts } from '../modules/contracts/db/schema';
import { isExpiringSoon } from './contractAlerts';
import { readjustmentState } from './contractReadjustment';
import { incomeAmounts, ratesFromColumns } from './contractRetentions';
import { OPEN_INCOME_STATUSES, type ContractStatus, type WithholdingRates } from './contractTypes';

export interface ContractIndicator {
  contractId: number;
  clientId: number;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  /** Mensalidade bruta; nula sem mensalidade. */
  monthlyFee: number | null;
  /** Mensalidade depois das retenções (igual à bruta fora do órgão público). */
  monthlyNet: number | null;
  rates: WithholdingRates;
  hasHours: boolean;
  expiringSoon: boolean;
  readjustmentAvailable: boolean;
  overdueCount: number;
  overdueAmount: number;
}

export interface ContractIndicatorFilter {
  clientIds?: number[];
  contractIds?: number[];
  activeOnly?: boolean;
}

export async function loadContractIndicators(
  accountId: number,
  today: string,
  filter: ContractIndicatorFilter = {},
): Promise<ContractIndicator[]> {
  const conditions: SQL[] = [eq(contracts.accountId, accountId)];
  if (filter.clientIds) {
    if (filter.clientIds.length === 0) {
      return [];
    }
    conditions.push(inArray(contracts.clientId, filter.clientIds));
  }
  if (filter.contractIds) {
    if (filter.contractIds.length === 0) {
      return [];
    }
    conditions.push(inArray(contracts.id, filter.contractIds));
  }
  if (filter.activeOnly) {
    conditions.push(eq(contracts.status, 'ativo'));
  }

  const rows = await db
    .select({
      id: contracts.id,
      clientId: contracts.clientId,
      status: contracts.status,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      readjustmentBaseDate: contracts.readjustmentBaseDate,
      readjustmentHandledUntil: contracts.readjustmentHandledUntil,
      ir: contracts.withholdingIr,
      pisCofinsCsll: contracts.withholdingPisCofinsCsll,
      iss: contracts.withholdingIss,
      inss: contracts.withholdingInss,
      monthlyFee: contractCharges.amount,
      hasHours: sql<boolean>`exists (select 1 from ${contractHourTypes} where ${contractHourTypes.contractId} = ${contracts.id})`,
    })
    .from(contracts)
    .leftJoin(contractCharges, and(eq(contractCharges.contractId, contracts.id), eq(contractCharges.kind, 'mensalidade')))
    .where(and(...conditions));
  if (rows.length === 0) {
    return [];
  }

  const overdueRows = await db
    .select({ contractId: incomes.contractId, count: count(), amount: sum(incomes.amount) })
    .from(incomes)
    .where(and(
      eq(incomes.accountId, accountId),
      inArray(incomes.contractId, rows.map((row) => row.id)),
      inArray(incomes.status, [...OPEN_INCOME_STATUSES]),
      lt(incomes.receiptDate, today),
    ))
    .groupBy(incomes.contractId);
  const overdue = new Map(overdueRows.map((row) => [row.contractId, row]));

  return rows.map((row) => {
    const rates = ratesFromColumns({ ir: row.ir, pisCofinsCsll: row.pisCofinsCsll, iss: row.iss, inss: row.inss });
    const monthlyFee = row.monthlyFee === null ? null : Number(row.monthlyFee);
    const readjustable = row.status === 'ativo' && (monthlyFee !== null || row.hasHours);
    const late = overdue.get(row.id);
    return {
      contractId: row.id,
      clientId: row.clientId,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      monthlyFee,
      monthlyNet: monthlyFee === null ? null : incomeAmounts(monthlyFee, rates).net,
      rates,
      hasHours: row.hasHours,
      expiringSoon: isExpiringSoon(row.status, row.endDate, today),
      readjustmentAvailable: readjustable
        && readjustmentState(row.readjustmentBaseDate, row.readjustmentHandledUntil, today).available,
      overdueCount: late?.count ?? 0,
      overdueAmount: late ? Number(late.amount ?? 0) : 0,
    };
  });
}
