// Clientes das contas PJ: lista com os indicadores dos contratos, resumo do
// topo, cadastro, desativar e reativar, exclusão (só sem contrato nem receita)
// e as receitas do cliente. A conta chega resolvida pela rota
// (resolveCompanyAccount); aqui toda consulta filtra por ela.
import { and, asc, desc, eq, ilike, inArray, isNotNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { incomeClassifications, incomes } from '../db/schema';
import { clients, contracts, type Client } from '../modules/contracts/db/schema';
import { resolveCompanyAccount } from '../utils/accountAccess';
import { addMonthsClamped } from '../utils/date';
import { RequestInputError, escapeLikePattern } from '../utils/requestInput';
import type { ClientInput, ClientListQuery } from './clientInput';
import { loadContractIndicators } from './contractIndicators';
import { competenceOf } from './contractSchedule';
import { INCOME_STATUS, type ClientKind, type GovernmentSphere, type WithholdingAmounts } from './contractTypes';

export const CLIENTS_PERSONAL_ACCOUNT_MESSAGE = 'Clientes e contratos só existem em conta de empresa';
export const CLIENT_NOT_FOUND_MESSAGE = 'Cliente não encontrado';
const DUPLICATE_DOCUMENT_MESSAGE = 'Já existe um cliente com este documento';
const CLIENT_INCOMES_LIMIT = 300;

export interface ClientView {
  id: number;
  accountId: number;
  type: ClientKind;
  name: string;
  document: string;
  sphere: GovernmentSphere | null;
  agency: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  active: boolean;
}

/** Resumo dos contratos do cliente na lista; nulo para quem não vê contratos. */
export interface ClientContractsSummary {
  activeContracts: number;
  /** Soma das mensalidades líquidas dos contratos ativos. */
  monthlyAmount: number;
  expiringSoon: boolean;
  overdue: boolean;
  readjustmentAvailable: boolean;
}

export interface ClientListItem extends ClientView {
  contracts: ClientContractsSummary | null;
}

export interface ClientsSummary {
  /** Mensalidades líquidas dos contratos ativos que valem no mês atual. */
  monthlyRecurring: number;
  expiringContracts: number;
  overdueCount: number;
  overdueAmount: number;
}

export interface ClientIncomeView {
  id: number;
  description: string;
  amount: number;
  grossAmount: number | null;
  withholdings: WithholdingAmounts | null;
  receiptDate: string;
  status: string;
  contractId: number | null;
  classificationName: string | null;
}

export function toClientView(client: Client): ClientView {
  return {
    id: client.id,
    accountId: client.accountId,
    type: client.kind,
    name: client.name,
    document: client.document,
    sphere: client.sphere,
    agency: client.agency,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    contactPhone: client.contactPhone,
    zipCode: client.zipCode,
    street: client.street,
    number: client.number,
    complement: client.complement,
    district: client.district,
    city: client.city,
    state: client.state,
    active: client.active,
  };
}

function clientColumns(input: ClientInput) {
  return {
    kind: input.type,
    name: input.name,
    document: input.document,
    sphere: input.sphere,
    agency: input.agency,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    zipCode: input.zipCode,
    street: input.street,
    number: input.number,
    complement: input.complement,
    district: input.district,
    city: input.city,
    state: input.state,
  };
}

/** Cliente da conta, ou nulo (de outra conta ou inexistente). */
export async function findAccountClient(accountId: number, clientId: number): Promise<Client | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.accountId, accountId)))
    .limit(1);
  return client ?? null;
}

/**
 * Cliente pelo id, desde que a conta PJ dele seja do solicitante (dono ou
 * colaborador dela). De outra conta ou inexistente: a mesma resposta (404).
 */
export async function findClientForRequester(requesterId: number, clientId: number): Promise<Client> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) {
    throw new RequestInputError(CLIENT_NOT_FOUND_MESSAGE, 404);
  }
  try {
    await resolveCompanyAccount(requesterId, client.accountId, CLIENTS_PERSONAL_ACCOUNT_MESSAGE);
  } catch (error) {
    if (error instanceof RequestInputError) {
      throw new RequestInputError(CLIENT_NOT_FOUND_MESSAGE, 404);
    }
    throw error;
  }
  return client;
}

export async function listClients(
  accountId: number,
  query: ClientListQuery,
  options: { includeContracts: boolean; today: string },
): Promise<ClientListItem[]> {
  const conditions: SQL[] = [eq(clients.accountId, accountId), eq(clients.active, query.status === 'active')];
  if (query.type) {
    conditions.push(eq(clients.kind, query.type));
  }
  if (query.search) {
    const pattern = `%${escapeLikePattern(query.search)}%`;
    const digits = query.search.replace(/\D/g, '');
    const matches: SQL[] = [ilike(clients.name, pattern), ilike(clients.agency, pattern)];
    if (digits) {
      matches.push(ilike(clients.document, `%${digits}%`));
    }
    conditions.push(or(...matches)!);
  }
  const rows = await db.select().from(clients).where(and(...conditions)).orderBy(asc(clients.name));
  if (!options.includeContracts) {
    return rows.map((client) => ({ ...toClientView(client), contracts: null }));
  }

  const indicators = await loadContractIndicators(accountId, options.today, { clientIds: rows.map((client) => client.id) });
  return rows.map((client) => {
    const own = indicators.filter((indicator) => indicator.clientId === client.id);
    const active = own.filter((indicator) => indicator.status === 'ativo');
    return {
      ...toClientView(client),
      contracts: {
        activeContracts: active.length,
        monthlyAmount: active.reduce((total, indicator) => total + (indicator.monthlyNet ?? 0), 0),
        expiringSoon: active.some((indicator) => indicator.expiringSoon),
        overdue: own.some((indicator) => indicator.overdueCount > 0),
        readjustmentAvailable: active.some((indicator) => indicator.readjustmentAvailable),
      },
    };
  });
}

/** O contrato vale no mês: começou até o fim dele e não terminou antes do início. */
function coversMonth(startDate: string, endDate: string | null, monthStart: string): boolean {
  const monthEnd = addMonthsClamped(monthStart, 1);
  return startDate < monthEnd && (endDate === null || endDate >= monthStart);
}

export async function getClientsSummary(accountId: number, today: string): Promise<ClientsSummary> {
  const indicators = await loadContractIndicators(accountId, today);
  const monthStart = competenceOf(today);
  const active = indicators.filter((indicator) => indicator.status === 'ativo');
  const recurringCents = active
    .filter((indicator) => coversMonth(indicator.startDate, indicator.endDate, monthStart))
    .reduce((total, indicator) => total + Math.round((indicator.monthlyNet ?? 0) * 100), 0);
  const overdueCents = indicators.reduce((total, indicator) => total + Math.round(indicator.overdueAmount * 100), 0);
  return {
    monthlyRecurring: recurringCents / 100,
    expiringContracts: active.filter((indicator) => indicator.expiringSoon).length,
    overdueCount: indicators.reduce((total, indicator) => total + indicator.overdueCount, 0),
    overdueAmount: overdueCents / 100,
  };
}

async function assertDocumentAvailable(accountId: number, document: string, exceptClientId: number | null): Promise<void> {
  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(
      eq(clients.accountId, accountId),
      eq(clients.document, document),
      ...(exceptClientId === null ? [] : [ne(clients.id, exceptClientId)]),
    ))
    .limit(1);
  if (existing) {
    throw new RequestInputError(DUPLICATE_DOCUMENT_MESSAGE, 409);
  }
}

/** Corrida entre dois cadastros iguais: o índice único responde e a mensagem é a mesma. */
function isDuplicateDocument(error: unknown): boolean {
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}

export async function createClient(account: { id: number; ownerId: number }, input: ClientInput): Promise<ClientView> {
  await assertDocumentAvailable(account.id, input.document, null);
  try {
    const [client] = await db
      .insert(clients)
      .values({ ...clientColumns(input), accountId: account.id, ownerId: account.ownerId })
      .returning();
    return toClientView(client!);
  } catch (error) {
    if (isDuplicateDocument(error)) {
      throw new RequestInputError(DUPLICATE_DOCUMENT_MESSAGE, 409);
    }
    throw error;
  }
}

/**
 * As previstas geradas por contrato levam o nome do cliente no fim da
 * descrição ("Mensalidade - Cliente"): acompanham a troca de nome. Faturadas e
 * recebidas ficam com o nome da época.
 */
async function renamePlannedContractIncomes(executor: Pick<typeof db, 'update'>, client: Client, newName: string): Promise<void> {
  const oldSuffix = ` - ${client.name}`;
  await executor
    .update(incomes)
    .set({
      description: sql`left(left(${incomes.description}, length(${incomes.description}) - ${oldSuffix.length}) || ${` - ${newName}`}, 255)`,
    })
    .where(and(
      eq(incomes.clientId, client.id),
      eq(incomes.accountId, client.accountId),
      eq(incomes.status, INCOME_STATUS.planned),
      isNotNull(incomes.chargeId),
      sql`right(${incomes.description}, ${oldSuffix.length}) = ${oldSuffix}`,
    ));
}

export async function updateClient(client: Client, input: ClientInput): Promise<ClientView> {
  await assertDocumentAvailable(client.accountId, input.document, client.id);
  try {
    return await db.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(clients)
        .set({ ...clientColumns(input), updatedAt: new Date() })
        .where(eq(clients.id, client.id))
        .returning();
      if (input.name !== client.name) {
        await renamePlannedContractIncomes(transaction, client, input.name);
      }
      return toClientView(updated!);
    });
  } catch (error) {
    if (isDuplicateDocument(error)) {
      throw new RequestInputError(DUPLICATE_DOCUMENT_MESSAGE, 409);
    }
    throw error;
  }
}

export async function setClientActive(client: Client, active: boolean): Promise<ClientView> {
  const [updated] = await db
    .update(clients)
    .set({ active, updatedAt: new Date() })
    .where(eq(clients.id, client.id))
    .returning();
  return toClientView(updated!);
}

/** Cliente com contrato ou receita não sai: só é desativado. */
export async function deleteClient(client: Client): Promise<void> {
  await db.transaction(async (transaction) => {
    const [contract] = await transaction
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.clientId, client.id))
      .limit(1);
    const [income] = await transaction
      .select({ id: incomes.id })
      .from(incomes)
      .where(eq(incomes.clientId, client.id))
      .limit(1);
    if (contract || income) {
      throw new RequestInputError('Este cliente tem contratos ou receitas e não pode ser excluído. Você pode desativá-lo.');
    }
    await transaction.delete(clients).where(eq(clients.id, client.id));
  });
}

/** Receitas do cliente na conta dele, das pessoas que o solicitante pode ver. */
export async function listClientIncomes(client: Client, visibleUserIds: number[]): Promise<ClientIncomeView[]> {
  const rows = await db
    .select({
      id: incomes.id,
      description: incomes.description,
      amount: incomes.amount,
      grossAmount: incomes.grossAmount,
      withholdings: incomes.withholdings,
      receiptDate: incomes.receiptDate,
      status: incomes.status,
      contractId: incomes.contractId,
      classificationName: incomeClassifications.name,
    })
    .from(incomes)
    .leftJoin(incomeClassifications, eq(incomeClassifications.id, incomes.classificationId))
    .where(and(
      eq(incomes.clientId, client.id),
      eq(incomes.accountId, client.accountId),
      inArray(incomes.userId, visibleUserIds),
    ))
    .orderBy(desc(incomes.receiptDate), desc(incomes.id))
    .limit(CLIENT_INCOMES_LIMIT);
  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
    grossAmount: row.grossAmount === null ? null : Number(row.grossAmount),
  }));
}
