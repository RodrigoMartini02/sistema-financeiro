// Contratos das contas PJ: prévia, criar e alterar (com as receitas na mesma
// transação), encerrar, excluir, aditivo, reajuste e "Faturar". A conta chega
// resolvida pela rota; contrato e receita pelo id são conferidos aqui, com a
// mesma resposta de "não encontrado" quando são de outra conta.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { incomes, representatives } from '../db/schema';
import {
  catalogServices, clients, contractAttachments, contractCharges, contractCommitments, contractHourTypes,
  contractServices, contracts, type Client, type Contract, type ContractCharge,
} from '../modules/contracts/db/schema';
import { resolveCompanyAccount } from '../utils/accountAccess';
import { RequestInputError } from '../utils/requestInput';
import { CLIENTS_PERSONAL_ACCOUNT_MESSAGE } from './clients';
import { removeAttachmentFiles } from './contractAttachments';
import { commitmentWarning, commitmentYear } from './contractCommitments';
import { formatHours, hourTypesWithUsage, usedHoursByType } from './contractHours';
import {
  cancelPlannedIncomesFrom, chargeIdsByKind, countPlannedIncomesFrom, insertScheduledIncomes,
  loadGenerationContext, planAmendment, planContractUpdate, toDecimal, type Transaction,
} from './contractIncomes';
import { assertAmendmentStart, type ContractInput, type HourTypeInput, type ReadjustmentInput } from './contractInput';
import { latestReachedAnniversary, readjustAmount, readjustmentState } from './contractReadjustment';
import { contractRates, incomeAmounts } from './contractRetentions';
import {
  addMonths, buildContractSchedule, competenceOf, scheduledIncomeDescription,
  type ContractScheduleState, type ContractScheduleTerms,
} from './contractSchedule';
import {
  BILLED_INCOME_STATUSES, INCOME_STATUS, type ChargeKind, type WithholdingAmounts, type WithholdingRates,
} from './contractTypes';
import { ensureContractIncomeClassification, findCatalogClassification } from './incomeClassificationCatalog';

export const CONTRACT_NOT_FOUND_MESSAGE = 'Contrato não encontrado';
const INCOME_NOT_FOUND_MESSAGE = 'Receita não encontrada';
const CLOSED_CONTRACT_MESSAGE = 'Este contrato está encerrado';

export interface AccountRef {
  id: number;
  ownerId: number;
}

/** Contrato pelo id, sem conferir a conta: só depois de uma gravação que já conferiu. */
export async function loadContract(contractId: number): Promise<Contract> {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract) {
    throw new RequestInputError(CONTRACT_NOT_FOUND_MESSAGE, 404);
  }
  return contract;
}

/** Contrato pelo id, desde que a conta PJ dele seja do solicitante; senão, 404. */
export async function findContractForRequester(requesterId: number, contractId: number): Promise<Contract> {
  const contract = await loadContract(contractId);
  try {
    await resolveCompanyAccount(requesterId, contract.accountId, CLIENTS_PERSONAL_ACCOUNT_MESSAGE);
  } catch (error) {
    if (error instanceof RequestInputError) {
      throw new RequestInputError(CONTRACT_NOT_FOUND_MESSAGE, 404);
    }
    throw error;
  }
  return contract;
}

export async function findContractClient(contract: Contract): Promise<Client> {
  const [client] = await db.select().from(clients).where(eq(clients.id, contract.clientId)).limit(1);
  return client!;
}

// ── Gravação dos termos ───────────────────────────────────────────────────

function rateColumn(rates: WithholdingRates, tax: keyof WithholdingRates): string | null {
  const rate = rates[tax];
  return rate === undefined ? null : rate.toFixed(2);
}

interface ContractClassifications {
  monthlyClassificationId: number | null;
  setupClassificationId: number | null;
  projectClassificationId: number | null;
}

/**
 * Categoria de cada cobrança: a escolhida ou, vazia, a padrão de "Contratos"
 * (criada se faltar), gravada no contrato como no módulo anterior. Assim
 * "em contrato ativo" e a contagem de uso das categorias olham só o contrato.
 */
async function resolveContractClassifications(
  executor: Transaction,
  ownerId: number,
  input: ContractInput,
): Promise<ContractClassifications> {
  const kinds = chargeKindsOf(input);
  const resolve = async (kind: ChargeKind, chosen: number | null) => {
    if (chosen !== null || !kinds.has(kind)) {
      return chosen;
    }
    return ensureContractIncomeClassification(executor, ownerId, kind);
  };
  return {
    monthlyClassificationId: await resolve('mensalidade', input.monthlyClassificationId),
    setupClassificationId: await resolve('implantacao', input.setupClassificationId),
    projectClassificationId: await resolve('projeto', input.projectClassificationId),
  };
}

function contractColumns(input: ContractInput, classifications: ContractClassifications) {
  const publicEntity = input.publicEntity;
  const rates = publicEntity?.withholdings ?? {};
  return {
    number: input.number,
    description: input.description,
    notes: input.notes,
    startDate: input.startDate,
    endDate: input.endDate,
    dueDay: input.dueDay,
    representativeId: input.representativeId,
    ...classifications,
    process: publicEntity?.process ?? null,
    modality: publicEntity?.modality ?? null,
    withholdingIr: rateColumn(rates, 'ir'),
    withholdingPisCofinsCsll: rateColumn(rates, 'pisCofinsCsll'),
    withholdingIss: rateColumn(rates, 'iss'),
    withholdingInss: rateColumn(rates, 'inss'),
    readjustmentBaseDate: input.readjustmentBaseDate,
  };
}

function scheduleTermsOfInput(input: ContractInput): ContractScheduleTerms {
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    dueDay: input.dueDay,
    monthlyFee: input.monthlyFee,
    setupFee: input.setupFee,
    projectFee: input.projectFee,
  };
}

function chargeKindsOf(input: ContractInput): Set<ChargeKind> {
  const kinds = new Set<ChargeKind>();
  if (input.monthlyFee !== null) {
    kinds.add('mensalidade');
  }
  if (input.setupFee !== null) {
    kinds.add('implantacao');
  }
  if (input.projectFee !== null) {
    kinds.add('projeto');
  }
  return kinds;
}

/** Representante, categorias e serviços precisam ser do catálogo da conta do contrato. */
async function assertContractReferences(executor: Transaction, account: AccountRef, input: ContractInput): Promise<void> {
  if (input.representativeId !== null) {
    const [representative] = await executor
      .select({ id: representatives.id })
      .from(representatives)
      .where(and(
        eq(representatives.id, input.representativeId),
        eq(representatives.userId, account.ownerId),
        eq(representatives.accountId, account.id),
      ))
      .limit(1);
    if (!representative) {
      throw new RequestInputError('Representante não encontrado nesta conta');
    }
  }

  const catalog = { ownerId: account.ownerId, accountType: 'empresa' as const, accountId: account.id };
  for (const classificationId of [input.monthlyClassificationId, input.setupClassificationId, input.projectClassificationId]) {
    if (classificationId !== null && !(await findCatalogClassification(catalog, classificationId))) {
      throw new RequestInputError('Categoria não encontrada nesta conta');
    }
  }

  const serviceIds = input.services.map((service) => service.serviceId);
  if (serviceIds.length > 0) {
    const found = await executor
      .select({ id: catalogServices.id })
      .from(catalogServices)
      .where(and(eq(catalogServices.accountId, account.id), inArray(catalogServices.id, serviceIds)));
    if (found.length !== serviceIds.length) {
      throw new RequestInputError('Serviço não encontrado no catálogo desta conta');
    }
  }
}

/** Grava as cobranças do contrato (atualiza, cria e tira) e devolve o id de cada uma. */
async function saveCharges(
  executor: Transaction,
  contractId: number,
  input: ContractInput,
  existing: ContractCharge[],
): Promise<Partial<Record<ChargeKind, number>>> {
  const wanted: Array<{ kind: ChargeKind; amount: number; installments: number | null; firstDate: string | null }> = [];
  if (input.monthlyFee !== null) {
    wanted.push({ kind: 'mensalidade', amount: input.monthlyFee, installments: null, firstDate: null });
  }
  if (input.setupFee !== null) {
    wanted.push({ kind: 'implantacao', ...input.setupFee });
  }
  if (input.projectFee !== null) {
    wanted.push({ kind: 'projeto', ...input.projectFee });
  }

  const removed = existing.filter((charge) => !wanted.some((item) => item.kind === charge.kind));
  if (removed.length > 0) {
    await executor.delete(contractCharges).where(inArray(contractCharges.id, removed.map((charge) => charge.id)));
  }
  const saved: Array<{ id: number; kind: ChargeKind }> = [];
  for (const charge of wanted) {
    const values = { amount: toDecimal(charge.amount), installments: charge.installments, firstDate: charge.firstDate };
    const current = existing.find((item) => item.kind === charge.kind);
    if (current) {
      await executor.update(contractCharges).set(values).where(eq(contractCharges.id, current.id));
      saved.push({ id: current.id, kind: charge.kind });
    } else {
      const [created] = await executor
        .insert(contractCharges)
        .values({ contractId, kind: charge.kind, ...values })
        .returning({ id: contractCharges.id });
      saved.push({ id: created!.id, kind: charge.kind });
    }
  }
  return chargeIdsByKind(saved);
}

/**
 * Tipos de hora: os que vêm com id são atualizados, os novos entram e os que
 * saem só saem sem horas lançadas. A quantidade não fica abaixo do já lançado.
 */
async function saveHourTypes(executor: Transaction, contractId: number, hourTypes: HourTypeInput[], isUpdate: boolean): Promise<void> {
  const existing = isUpdate
    ? await executor.select().from(contractHourTypes).where(eq(contractHourTypes.contractId, contractId))
    : [];
  if (hourTypes.some((hourType) => hourType.id !== null && !existing.some((item) => item.id === hourType.id))) {
    throw new RequestInputError('Tipo de hora inválido');
  }
  const existingIds = existing.map((item) => item.id);
  const used = await usedHoursByType(executor, existingIds);
  const withUsage = await hourTypesWithUsage(executor, existingIds);

  const removed = existing.filter((item) => !hourTypes.some((hourType) => hourType.id === item.id));
  const blocked = removed.find((item) => withUsage.has(item.id));
  if (blocked) {
    throw new RequestInputError(`O tipo de hora "${blocked.name}" já tem horas lançadas e não pode sair do contrato`);
  }
  for (const hourType of hourTypes) {
    const usedHours = hourType.id === null ? 0 : used.get(hourType.id) ?? 0;
    if (hourType.quantity < usedHours) {
      throw new RequestInputError(`${hourType.name}: a quantidade não pode ficar abaixo das ${formatHours(usedHours)} h já lançadas`);
    }
  }

  if (removed.length > 0) {
    await executor.delete(contractHourTypes).where(inArray(contractHourTypes.id, removed.map((item) => item.id)));
  }
  // Troca de nomes entre dois tipos não esbarra no nome único: primeiro um nome provisório.
  const renamed = hourTypes.filter((hourType) => hourType.id !== null
    && existing.find((item) => item.id === hourType.id)?.name !== hourType.name);
  for (const hourType of renamed) {
    await executor.update(contractHourTypes).set({ name: `#${hourType.id}` }).where(eq(contractHourTypes.id, hourType.id!));
  }
  for (const hourType of hourTypes) {
    const values = { name: hourType.name, hourlyRate: toDecimal(hourType.hourlyRate), quantity: toDecimal(hourType.quantity) };
    if (hourType.id !== null) {
      await executor.update(contractHourTypes).set(values).where(eq(contractHourTypes.id, hourType.id));
    } else {
      await executor.insert(contractHourTypes).values({ contractId, ...values });
    }
  }
}

async function saveServicesAndCommitments(executor: Transaction, contractId: number, input: ContractInput): Promise<void> {
  await executor.delete(contractServices).where(eq(contractServices.contractId, contractId));
  if (input.services.length > 0) {
    await executor.insert(contractServices).values(input.services.map((service) => ({
      contractId,
      serviceId: service.serviceId,
      deployed: service.deployed,
    })));
  }
  await executor.delete(contractCommitments).where(eq(contractCommitments.contractId, contractId));
  const commitments = input.publicEntity?.commitments ?? [];
  if (commitments.length > 0) {
    await executor.insert(contractCommitments).values(commitments.map((commitment) => ({
      contractId,
      year: commitment.year,
      number: commitment.number,
      amount: toDecimal(commitment.amount),
    })));
  }
}

async function lockContract(executor: Transaction, contractId: number): Promise<Contract> {
  const [contract] = await executor.select().from(contracts).where(eq(contracts.id, contractId)).limit(1).for('update');
  if (!contract) {
    throw new RequestInputError(CONTRACT_NOT_FOUND_MESSAGE, 404);
  }
  return contract;
}

/** Grava contrato novo (criação ou aditivo) com tudo o que ele tem e as receitas da agenda. */
async function insertContract(
  executor: Transaction,
  account: AccountRef,
  client: Client,
  input: ContractInput,
  extra: { previousContractId: number | null; amendmentNumber: number; readjustmentHandledUntil: string | null },
  state: ContractScheduleState,
  today: string,
): Promise<number> {
  const classifications = await resolveContractClassifications(executor, account.ownerId, input);
  const [contract] = await executor
    .insert(contracts)
    .values({
      ...contractColumns(input, classifications),
      accountId: account.id,
      ownerId: account.ownerId,
      clientId: client.id,
      previousContractId: extra.previousContractId,
      amendmentNumber: extra.amendmentNumber,
      readjustmentHandledUntil: extra.readjustmentHandledUntil,
    })
    .returning();
  await saveCharges(executor, contract!.id, input, []);
  await saveHourTypes(executor, contract!.id, input.hourTypes.map((hourType) => ({ ...hourType, id: null })), false);
  await saveServicesAndCommitments(executor, contract!.id, input);
  const context = await loadGenerationContext(executor, contract!);
  await insertScheduledIncomes(executor, context, buildContractSchedule(scheduleTermsOfInput(input), today, state));
  return contract!.id;
}

// ── Prévia ────────────────────────────────────────────────────────────────

export type ContractPreviewTarget =
  | { mode: 'create'; client: Client }
  | { mode: 'update'; contract: Contract; client: Client }
  | { mode: 'amendment'; previous: Contract; client: Client };

export interface PreviewIncome {
  chargeKind: ChargeKind;
  competence: string;
  dueDate: string;
  description: string;
  installment: number | null;
  installments: number | null;
  grossAmount: number;
  withholdings: WithholdingAmounts | null;
  amount: number;
}

export interface ContractPreview {
  incomes: PreviewIncome[];
  totalGross: number;
  totalNet: number;
  /** Previstas que saem: refeitas na alteração, canceladas no anterior no aditivo. */
  replacedCount: number;
}

/** O que salvar vai gerar, com o mesmo cálculo da gravação, sem gravar nada. */
export async function previewContract(target: ContractPreviewTarget, input: ContractInput, today: string): Promise<ContractPreview> {
  if (target.mode === 'create') {
    assertClientActive(target.client);
  } else if ((target.mode === 'update' ? target.contract : target.previous).status !== 'ativo') {
    throw new RequestInputError(CLOSED_CONTRACT_MESSAGE);
  }
  let state: ContractScheduleState = {};
  let replacedCount = 0;
  if (target.mode === 'update') {
    const existing = await db.select().from(contractCharges).where(eq(contractCharges.contractId, target.contract.id));
    const plan = await planContractUpdate(db, target.contract.id, existing, chargeKindsOf(input), today);
    state = plan.state;
    replacedCount = plan.replacedIncomeIds.length;
  } else if (target.mode === 'amendment') {
    assertAmendmentStart(target.previous.startDate, input.startDate);
    state = await planAmendment(db, target.previous.id, input.startDate);
    replacedCount = await countPlannedIncomesFrom(db, target.previous.id, competenceOf(input.startDate));
  }

  const rates = input.publicEntity?.withholdings ?? {};
  const items = buildContractSchedule(scheduleTermsOfInput(input), today, state).map((item) => {
    const amounts = incomeAmounts(item.amount, rates);
    return {
      chargeKind: item.chargeKind,
      competence: item.competence,
      dueDate: item.dueDate,
      description: scheduledIncomeDescription(item, target.client.name),
      installment: item.installment,
      installments: item.installments,
      grossAmount: amounts.gross,
      withholdings: amounts.withholdings,
      amount: amounts.net,
    };
  });
  const sumCents = (values: number[]) => values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
  return {
    incomes: items,
    totalGross: sumCents(items.map((item) => item.grossAmount)),
    totalNet: sumCents(items.map((item) => item.amount)),
    replacedCount,
  };
}

// ── Criar, alterar, encerrar e excluir ────────────────────────────────────

/** Cliente desativado não entra em contrato novo. */
function assertClientActive(client: Client): void {
  if (!client.active) {
    throw new RequestInputError('Este cliente está desativado. Reative o cliente para criar um contrato.');
  }
}

export async function createContract(account: AccountRef, client: Client, input: ContractInput, today: string): Promise<number> {
  assertClientActive(client);
  return db.transaction(async (transaction) => {
    await assertContractReferences(transaction, account, input);
    return insertContract(
      transaction, account, client, input,
      { previousContractId: null, amendmentNumber: 0, readjustmentHandledUntil: null },
      {},
      today,
    );
  });
}

/**
 * Alterar refaz só as futuras ainda previstas (competência a partir do mês
 * atual), na mesma transação; o índice único garante que nenhum mês se repete.
 */
export async function updateContract(contractId: number, input: ContractInput, today: string): Promise<void> {
  await db.transaction(async (transaction) => {
    const contract = await lockContract(transaction, contractId);
    if (contract.status !== 'ativo') {
      throw new RequestInputError(`${CLOSED_CONTRACT_MESSAGE} e não pode ser alterado`);
    }
    await assertContractReferences(transaction, { id: contract.accountId, ownerId: contract.ownerId }, input);

    const existingCharges = await transaction.select().from(contractCharges).where(eq(contractCharges.contractId, contract.id));
    const plan = await planContractUpdate(transaction, contract.id, existingCharges, chargeKindsOf(input), today);
    if (plan.replacedIncomeIds.length > 0) {
      await transaction.delete(incomes).where(inArray(incomes.id, plan.replacedIncomeIds));
    }

    const classifications = await resolveContractClassifications(transaction, contract.ownerId, input);
    await transaction
      .update(contracts)
      .set({ ...contractColumns(input, classifications), updatedAt: new Date() })
      .where(eq(contracts.id, contract.id));
    await saveCharges(transaction, contract.id, input, existingCharges);
    await saveHourTypes(transaction, contract.id, input.hourTypes, true);
    await saveServicesAndCommitments(transaction, contract.id, input);

    const [updated] = await transaction.select().from(contracts).where(eq(contracts.id, contract.id));
    const context = await loadGenerationContext(transaction, updated!);
    await insertScheduledIncomes(transaction, context, buildContractSchedule(scheduleTermsOfInput(input), today, plan.state));
  });
}

/** Encerrar: as previstas a partir do mês seguinte são canceladas; a do mês atual fica. */
export async function closeContract(contractId: number, today: string): Promise<void> {
  await db.transaction(async (transaction) => {
    const contract = await lockContract(transaction, contractId);
    if (contract.status !== 'ativo') {
      throw new RequestInputError(CLOSED_CONTRACT_MESSAGE);
    }
    await transaction
      .update(contracts)
      .set({ status: 'encerrado', closedAt: today, updatedAt: new Date() })
      .where(eq(contracts.id, contract.id));
    await cancelPlannedIncomesFrom(transaction, contract.id, addMonths(competenceOf(today), 1));
  });
}

/** Excluir: só sem receita faturada ou recebida. As previstas e canceladas do contrato saem junto. */
export async function deleteContract(contractId: number): Promise<void> {
  const fileNames = await db.transaction(async (transaction) => {
    const contract = await lockContract(transaction, contractId);
    const [billed] = await transaction
      .select({ id: incomes.id })
      .from(incomes)
      .where(and(eq(incomes.contractId, contract.id), inArray(incomes.status, [...BILLED_INCOME_STATUSES])))
      .limit(1);
    if (billed) {
      throw new RequestInputError('Este contrato tem receitas faturadas ou recebidas e não pode ser excluído. Use "Encerrar".');
    }
    // Cancelar antes de apagar desfaz a comissão que uma receita de horas tenha gerado, como na exclusão da receita.
    await cancelPlannedIncomesFrom(transaction, contract.id, '0001-01-01');
    await transaction.delete(incomes).where(eq(incomes.contractId, contract.id));
    const attachments = await transaction
      .select({ fileName: contractAttachments.fileName })
      .from(contractAttachments)
      .where(eq(contractAttachments.contractId, contract.id));
    await transaction.delete(contracts).where(eq(contracts.id, contract.id));
    return attachments.map((attachment) => attachment.fileName);
  });
  removeAttachmentFiles(fileNames);
}

// ── Aditivo e reajuste ────────────────────────────────────────────────────

/**
 * Aditivo: encerra o contrato e cria outro com os termos informados, número
 * do aditivo + 1 e o banco de horas no saldo inicial. O novo gera a partir do
 * mês de início, sem repetir mês já faturado ou recebido pelo anterior, que
 * tem as previstas desse mês em diante canceladas.
 */
export async function createAmendment(previousId: number, input: ContractInput, today: string): Promise<number> {
  return db.transaction(async (transaction) => {
    const previous = await lockContract(transaction, previousId);
    if (previous.status !== 'ativo') {
      throw new RequestInputError(`${CLOSED_CONTRACT_MESSAGE} e não recebe aditivo`);
    }
    assertAmendmentStart(previous.startDate, input.startDate);
    const account = { id: previous.accountId, ownerId: previous.ownerId };
    await assertContractReferences(transaction, account, input);
    const [client] = await transaction.select().from(clients).where(eq(clients.id, previous.clientId)).limit(1);

    const state = await planAmendment(transaction, previous.id, input.startDate);
    await cancelPlannedIncomesFrom(transaction, previous.id, competenceOf(input.startDate));
    await transaction
      .update(contracts)
      .set({ status: 'encerrado', closedAt: today, updatedAt: new Date() })
      .where(eq(contracts.id, previous.id));

    // Com a mesma data-base, o ciclo de reajuste já tratado no anterior continua tratado.
    const handledUntil = input.readjustmentBaseDate === previous.readjustmentBaseDate
      ? previous.readjustmentHandledUntil
      : null;
    return insertContract(
      transaction, account, client!, input,
      { previousContractId: previous.id, amendmentNumber: previous.amendmentNumber + 1, readjustmentHandledUntil: handledUntil },
      state,
      today,
    );
  });
}

/**
 * Reajuste disponível: aplicar muda a mensalidade, o valor da hora e as
 * mensalidades futuras ainda previstas (0,00% não muda nada); dispensar só
 * fecha o ciclo. As parcelas não reajustam.
 */
export async function handleReadjustment(contractId: number, input: ReadjustmentInput, today: string): Promise<void> {
  await db.transaction(async (transaction) => {
    const contract = await lockContract(transaction, contractId);
    if (contract.status !== 'ativo') {
      throw new RequestInputError(CLOSED_CONTRACT_MESSAGE);
    }
    if (!readjustmentState(contract.readjustmentBaseDate, contract.readjustmentHandledUntil, today).available) {
      throw new RequestInputError('Não há reajuste disponível para este contrato');
    }

    if (input.action === 'apply' && input.percent > 0) {
      const [monthly] = await transaction
        .select()
        .from(contractCharges)
        .where(and(eq(contractCharges.contractId, contract.id), eq(contractCharges.kind, 'mensalidade')))
        .limit(1);
      if (monthly) {
        const newFee = readjustAmount(Number(monthly.amount), input.percent);
        await transaction.update(contractCharges).set({ amount: toDecimal(newFee) }).where(eq(contractCharges.id, monthly.id));
        const amounts = incomeAmounts(newFee, contractRates(contract));
        await transaction
          .update(incomes)
          .set({
            amount: toDecimal(amounts.net),
            grossAmount: amounts.withholdings ? toDecimal(amounts.gross) : null,
            withholdings: amounts.withholdings,
          })
          .where(and(
            eq(incomes.chargeId, monthly.id),
            eq(incomes.status, INCOME_STATUS.planned),
            sql`${incomes.competence} >= ${competenceOf(today)}`,
          ));
      }
      const hourTypes = await transaction.select().from(contractHourTypes).where(eq(contractHourTypes.contractId, contract.id));
      for (const hourType of hourTypes) {
        await transaction
          .update(contractHourTypes)
          .set({ hourlyRate: toDecimal(readjustAmount(Number(hourType.hourlyRate), input.percent)) })
          .where(eq(contractHourTypes.id, hourType.id));
      }
    }

    await transaction
      .update(contracts)
      .set({ readjustmentHandledUntil: latestReachedAnniversary(contract.readjustmentBaseDate, today), updatedAt: new Date() })
      .where(eq(contracts.id, contract.id));
  });
}

// ── Faturar ───────────────────────────────────────────────────────────────

export interface InvoiceResult {
  incomeId: number;
  status: string;
  /** "Empenho sem saldo suficiente" em contrato com órgão público; não impede o faturamento. */
  warning: string | null;
}

/** "Faturar": receita prevista do contrato passa a faturada. */
export async function invoiceContractIncome(requesterId: number, incomeId: number): Promise<InvoiceResult> {
  const [found] = await db
    .select({ accountId: contracts.accountId, incomeAccountId: incomes.accountId })
    .from(incomes)
    .innerJoin(contracts, eq(contracts.id, incomes.contractId))
    .where(eq(incomes.id, incomeId))
    .limit(1);
  if (!found || found.incomeAccountId !== found.accountId) {
    throw new RequestInputError(INCOME_NOT_FOUND_MESSAGE, 404);
  }
  try {
    await resolveCompanyAccount(requesterId, found.accountId, CLIENTS_PERSONAL_ACCOUNT_MESSAGE);
  } catch (error) {
    if (error instanceof RequestInputError) {
      throw new RequestInputError(INCOME_NOT_FOUND_MESSAGE, 404);
    }
    throw error;
  }

  return db.transaction(async (transaction) => {
    const [income] = await transaction
      .select({
        id: incomes.id,
        status: incomes.status,
        contractId: incomes.contractId,
        competence: incomes.competence,
        receiptDate: incomes.receiptDate,
        amount: incomes.amount,
        grossAmount: incomes.grossAmount,
      })
      .from(incomes)
      .where(eq(incomes.id, incomeId))
      .limit(1)
      .for('update');
    if (!income || income.contractId === null) {
      throw new RequestInputError(INCOME_NOT_FOUND_MESSAGE, 404);
    }
    if (income.status !== INCOME_STATUS.planned) {
      throw new RequestInputError('Só a receita prevista pode ser faturada');
    }

    const [contract] = await transaction
      .select({ id: contracts.id, clientKind: clients.kind })
      .from(contracts)
      .innerJoin(clients, eq(clients.id, contracts.clientId))
      .where(eq(contracts.id, income.contractId))
      .limit(1);
    let warning: string | null = null;
    if (contract?.clientKind === 'orgao_publico') {
      const year = commitmentYear(income.competence, income.receiptDate);
      const [commitment] = await transaction
        .select({ amount: contractCommitments.amount })
        .from(contractCommitments)
        .where(and(eq(contractCommitments.contractId, contract.id), eq(contractCommitments.year, year)))
        .limit(1);
      const [used] = await transaction
        .select({ total: sql<string | null>`sum(coalesce(${incomes.grossAmount}, ${incomes.amount}))` })
        .from(incomes)
        .where(and(
          eq(incomes.contractId, contract.id),
          inArray(incomes.status, [...BILLED_INCOME_STATUSES]),
          sql`extract(year from coalesce(${incomes.competence}, ${incomes.receiptDate})) = ${year}`,
        ));
      warning = commitmentWarning(
        commitment ? { amount: Number(commitment.amount) } : null,
        Number(used?.total ?? 0),
        Number(income.grossAmount ?? income.amount),
      );
    }

    await transaction.update(incomes).set({ status: INCOME_STATUS.invoiced }).where(eq(incomes.id, income.id));
    return { incomeId: income.id, status: INCOME_STATUS.invoiced, warning };
  });
}
