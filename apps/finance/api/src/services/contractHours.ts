// Banco de horas do contrato: o saldo de cada tipo de hora é a quantidade
// contratada menos as horas lançadas nas receitas que não estão canceladas.
// Cancelar a receita devolve as horas; excluir apaga o lançamento junto.
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { incomes } from '../db/schema';
import { clients, contractHourTypes, contractHourUsages, contracts } from '../modules/contracts/db/schema';
import { RequestInputError, roundCents } from '../utils/requestInput';
import { contractRates } from './contractRetentions';
import { INCOME_STATUS, type WithholdingRates } from './contractTypes';

const hoursFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export interface HourTypeBalance {
  used: number;
  balance: number;
}

/** "12,5": horas com até duas casas, como a tela mostra. */
export function formatHours(hours: number): string {
  return hoursFormat.format(hours);
}

/** Horas lançadas por tipo (receitas não canceladas), numa consulta só. */
export async function usedHoursByType(executor: Pick<typeof db, 'select'>, hourTypeIds: number[]): Promise<Map<number, number>> {
  if (hourTypeIds.length === 0) {
    return new Map();
  }
  const rows = await executor
    .select({
      hourTypeId: contractHourUsages.hourTypeId,
      used: sql<string>`coalesce(sum(${contractHourUsages.hours}), 0)`,
    })
    .from(contractHourUsages)
    .innerJoin(incomes, eq(incomes.id, contractHourUsages.incomeId))
    .where(and(inArray(contractHourUsages.hourTypeId, hourTypeIds), ne(incomes.status, INCOME_STATUS.cancelled)))
    .groupBy(contractHourUsages.hourTypeId);
  return new Map(rows.map((row) => [row.hourTypeId, Number(row.used)]));
}

export function hourTypeBalance(quantity: number, used: number): HourTypeBalance {
  return { used: roundCents(used), balance: roundCents(quantity - used) };
}

/** Tipos de hora com algum lançamento (cancelado ou não): esses não saem do contrato. */
export async function hourTypesWithUsage(executor: Pick<typeof db, 'selectDistinct'>, hourTypeIds: number[]): Promise<Set<number>> {
  if (hourTypeIds.length === 0) {
    return new Set();
  }
  const rows = await executor
    .selectDistinct({ hourTypeId: contractHourUsages.hourTypeId })
    .from(contractHourUsages)
    .where(inArray(contractHourUsages.hourTypeId, hourTypeIds));
  return new Set(rows.map((row) => row.hourTypeId));
}

const HOUR_TYPE_NOT_AVAILABLE = 'Escolha um tipo de hora de contrato ativo desta conta';

export interface HourTypeContract {
  contractId: number;
  clientId: number;
  /** Percentuais de retenção, só no contrato com órgão público. */
  rates: WithholdingRates;
}

/** Contrato do tipo de hora, se for contrato ativo da conta. O saldo é conferido ao lançar (consumeContractHours). */
export async function findHourTypeContract(
  executor: Pick<typeof db, 'select'>,
  accountId: number | null,
  hourTypeId: number,
): Promise<HourTypeContract> {
  const [row] = accountId === null
    ? []
    : await executor
      .select({ contract: contracts, clientKind: clients.kind })
      .from(contractHourTypes)
      .innerJoin(contracts, eq(contracts.id, contractHourTypes.contractId))
      .innerJoin(clients, eq(clients.id, contracts.clientId))
      .where(and(eq(contractHourTypes.id, hourTypeId), eq(contracts.accountId, accountId)))
      .limit(1);
  if (!row || row.contract.status !== 'ativo') {
    throw new RequestInputError(HOUR_TYPE_NOT_AVAILABLE);
  }
  return {
    contractId: row.contract.id,
    clientId: row.contract.clientId,
    rates: row.clientKind === 'orgao_publico' ? contractRates(row.contract) : {},
  };
}

export interface HourConsumption {
  accountId: number;
  hourTypeId: number;
  hours: number;
  incomeId: number;
}

/**
 * Lança as horas na receita, na transação dela. O tipo de hora fica travado
 * até o fim da transação, para dois lançamentos ao mesmo tempo não passarem do
 * saldo, e precisa ser de contrato ativo da mesma conta. Devolve o contrato,
 * que a receita passa a apontar.
 */
export async function consumeContractHours(
  executor: Pick<typeof db, 'select' | 'insert'>,
  consumption: HourConsumption,
): Promise<{ contractId: number }> {
  const [hourType] = await executor
    .select({
      id: contractHourTypes.id,
      contractId: contractHourTypes.contractId,
      quantity: contractHourTypes.quantity,
      status: contracts.status,
    })
    .from(contractHourTypes)
    .innerJoin(contracts, eq(contracts.id, contractHourTypes.contractId))
    .where(and(eq(contractHourTypes.id, consumption.hourTypeId), eq(contracts.accountId, consumption.accountId)))
    .limit(1)
    .for('update');
  if (!hourType || hourType.status !== 'ativo') {
    throw new RequestInputError(HOUR_TYPE_NOT_AVAILABLE);
  }

  const used = (await usedHoursByType(executor, [hourType.id])).get(hourType.id) ?? 0;
  const { balance } = hourTypeBalance(Number(hourType.quantity), used);
  if (consumption.hours > balance) {
    throw new RequestInputError(`Saldo de horas insuficiente: restam ${formatHours(Math.max(balance, 0))} h`);
  }

  await executor.insert(contractHourUsages).values({
    hourTypeId: hourType.id,
    incomeId: consumption.incomeId,
    hours: consumption.hours.toFixed(2),
  });
  return { contractId: hourType.contractId };
}
