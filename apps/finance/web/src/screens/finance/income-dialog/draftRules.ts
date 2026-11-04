// Regras puras do modal de receita, sem React: receitas fixas por intervalo,
// prévia da comissão, venda de produto, horas a faturar, resumo, validação e
// montagem do que vai para a API.
import type { Produto } from '../../../services/catalogoService';
import type { ContractHourType, ContractWithHours, WithholdingRates } from '../../../services/contractsService';
import type { IncomeDuplicateQuery } from '../../../services/incomeSuggestionsService';
import type { Representante } from '../../../services/representantesService';
import {
  type IncomeCreateInput, type IncomeUpdateInput,
} from '../../../types/finance';
import { WITHHOLDING_TAXES } from '../../../utils/contractDisplay';
import { brDateInputToIso, isoToShortBrDate } from '../../../utils/date';
import { formatCurrency } from '../formatters';
import { formatCents, toCents, toReais } from '../entry-dialog/cents';
import { joinWithAnd, toSentence } from '../entry-dialog/sentence';
import type { SummaryBadge, SummaryContent } from '../entry-dialog/SummaryLine';
import type { IncomeDraft, IncomeDraftErrors } from './draftState';

/** A geração mensal conserva o limite de volume do servidor. */
export const MAX_REPLICAS = 36;

export const EMPTY_INCOME_MESSAGE = 'Preencha descrição, categoria e valor bruto para registrar.';

export interface IncomeRuleContext {
  todayIso: string;
  /** Conta PJ: cliente, representante, produto e horas. */
  isCompany: boolean;
  representatives: Representante[];
  /** Produtos ativos da conta. */
  products: Produto[];
  /** Contratos ativos com banco de horas. */
  contracts: ContractWithHours[];
  /** Clientes ativos do cadastro. */
  clients: ClientOption[];
}

export interface ClientOption {
  id: number;
  name: string;
}

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export function isIncomeDraftFilled(draft: IncomeDraft): boolean {
  return draft.description.trim() !== '' || !!draft.grossCents;
}

export function receiptDateIso(draft: IncomeDraft, todayIso: string): string {
  return brDateInputToIso(draft.receiptDate, todayIso);
}

/** Meses depois da primeira ocorrência até o limite inclusivo. */
export function replicaCount(draft: IncomeDraft, todayIso: string): number {
  const receipt = receiptDateIso(draft, todayIso);
  if (draft.billingType !== 'fixed' || !isIncomeEndMonth(draft.endMonth) || !receipt) return 0;
  const [year, month] = receipt.split('-').map(Number);
  return (Number(draft.endMonth.slice(0, 4)) - year!) * 12 + Number(draft.endMonth.slice(5, 7)) - month!;
}

export function isIncomeEndMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100;
}

/** Adiadas e previsões sem valor válido continuam no lote, fora do salvamento. */
export function readyIncomeToSave(draft: IncomeDraft, context: IncomeRuleContext): boolean {
  if (draft.forecastId === undefined) return true;
  const net = effectiveNetCents(draft, context);
  return !draft.deferred && !draft.deferError && Number.isFinite(draft.grossCents) && (draft.grossCents ?? 0) > 0
    && Number.isFinite(net) && (net ?? 0) > 0;
}

export type CommissionPreview =
  | { kind: 'none' }
  | { kind: 'missing'; representativeName: string }
  | { kind: 'rule'; representativeName: string; percent: number; type: 'mensal' | 'unica'; amountCents: number };

/**
 * Prévia da comissão do representante para a categoria. Quem grava a despesa de
 * comissão é o servidor, pelo mesmo cadastro: a mensal em cada lançamento, a
 * única só na receita original.
 */
export function commissionPreview(draft: IncomeDraft, context: IncomeRuleContext): CommissionPreview {
  const representative = context.representatives.find((item) => item.id === draft.representativeId);
  if (!representative || draft.categoryId === null) return { kind: 'none' };
  const rule = representative.comissoes.find((item) => item.classificacao_id === draft.categoryId);
  if (!rule) return { kind: 'missing', representativeName: representative.nome };
  const percent = Number(rule.percentual);
  return {
    kind: 'rule',
    representativeName: representative.nome,
    percent,
    type: rule.tipo === 'unica' ? 'unica' : 'mensal',
    // A comissão sai do líquido (o que entrou), como no servidor.
    amountCents: Math.round(((effectiveNetCents(draft, context) ?? 0) * percent) / 100),
  };
}

export interface ProductSaleInfo {
  product: Produto;
  /** Sem controle de estoque, a venda não baixa nem é barrada pelo saldo. */
  tracksStock: boolean;
  stock: number;
  quantity: number;
  remaining: number;
  insufficient: boolean;
  totalCents: number;
}

export function productSaleInfo(draft: IncomeDraft, context: IncomeRuleContext): ProductSaleInfo | null {
  const product = context.products.find((item) => item.id === draft.productId);
  if (!product) return null;
  const stock = Number(product.quantidadeEstoque);
  const quantity = draft.soldQuantity ?? 0;
  return {
    product,
    tracksStock: product.controlaEstoque,
    stock,
    quantity,
    remaining: Math.max(0, stock - quantity),
    insufficient: product.controlaEstoque && quantity > stock,
    // O preço com desconto só pré-preenche: o valor da receita continua editável.
    totalCents: toCents(quantity * product.valorFinal),
  };
}

export interface BillableHoursInfo {
  contract: ContractWithHours;
  hourType: ContractHourType | null;
  totalCents: number | null;
  /** Mais horas do que o saldo do tipo: o servidor recusa. */
  overBalance: boolean;
}

export function billableHoursInfo(draft: IncomeDraft, context: IncomeRuleContext): BillableHoursInfo | null {
  const contract = context.contracts.find((item) => item.contractId === draft.contractId);
  if (!contract) return null;
  const hourType = contract.hourTypes.find((item) => item.id === draft.hourTypeId) ?? null;
  return {
    contract,
    hourType,
    totalCents: hourType && draft.hours ? toCents(draft.hours * hourType.hourlyRate) : null,
    overBalance: !!hourType && !!draft.hours && draft.hours > hourType.balance,
  };
}

/** Arredonda cents × percentual ao centavo, metade para cima, como o servidor (contractRetentions). */
function percentOfCents(cents: number, percent: number): number {
  const basisPoints = Math.round(percent * 100);
  return Math.floor((2 * cents * basisPoints + 10_000) / 20_000);
}

export interface WithholdingPreview {
  grossCents: number;
  withheldCents: number;
  netCents: number;
}

/** Horas de contrato com órgão público: o valor digitado é o bruto e a receita vale o líquido. */
export function withholdingPreview(draft: IncomeDraft, context: IncomeRuleContext): WithholdingPreview | null {
  const rates: WithholdingRates = billableHoursInfo(draft, context)?.contract.withholdings ?? {};
  if (!draft.grossCents || !WITHHOLDING_TAXES.some((tax) => (rates[tax] ?? 0) > 0)) return null;
  const withheldCents = WITHHOLDING_TAXES.reduce((total, tax) => total + percentOfCents(draft.grossCents!, rates[tax] ?? 0), 0);
  return { grossCents: draft.grossCents, withheldCents, netCents: draft.grossCents - withheldCents };
}

/**
 * O que entra na conta. Com retenção de contrato, o líquido calculado; senão o digitado, ou o
 * próprio bruto enquanto o líquido não foi editado (sem taxa nem juros).
 */
export function effectiveNetCents(draft: IncomeDraft, context: IncomeRuleContext): number | null {
  const withholding = withholdingPreview(draft, context);
  if (withholding) return withholding.netCents;
  return draft.netCents ?? draft.grossCents;
}

/** Valor calculado pela venda ou pelas horas. Preenche o campo, que continua editável (desconto, frete). */
export function calculatedAmountCents(draft: IncomeDraft, context: IncomeRuleContext): number | null {
  const sale = productSaleInfo(draft, context);
  if (sale && sale.quantity > 0) return sale.totalCents;
  return billableHoursInfo(draft, context)?.totalCents ?? null;
}

/** O contrato das horas traz o cliente dele (a receita é desse cliente) e o representante, se vazio. */
export function contractPrefill(draft: IncomeDraft, contract: ContractWithHours): Partial<IncomeDraft> {
  const patch: Partial<IncomeDraft> = { clientId: contract.clientId };
  if (draft.representativeId === null && contract.representativeId) patch.representativeId = contract.representativeId;
  return patch;
}

// ── Validação ──────────────────────────────────────────────────────────────

export function validateIncomeDraft(draft: IncomeDraft, context: IncomeRuleContext): IncomeDraftErrors {
  const errors: IncomeDraftErrors = {};
  if (!draft.description.trim()) errors.description = true;
  if (draft.categoryId === null) errors.category = true;
  if (!draft.grossCents) errors.amount = true;
  // O líquido é o que entrou: nunca passa do que era devido.
  const net = effectiveNetCents(draft, context);
  if (draft.grossCents && (!net || net > draft.grossCents)) errors.net = true;
  if (!receiptDateIso(draft, context.todayIso)) errors.receiptDate = true;
  const hours = billableHoursInfo(draft, context);
  // As horas são do contrato de um cliente: a receita precisa ser desse cliente.
  if (hours && draft.clientId !== null && draft.clientId !== hours.contract.clientId) errors.client = true;
  if (draft.billingType === 'fixed') {
    const replicas = replicaCount(draft, context.todayIso);
    if (!isIncomeEndMonth(draft.endMonth) || (!draft.fixedIncomeId && (replicas < 0 || replicas > MAX_REPLICAS))) errors.endMonth = true;
    if (!draft.fixedIncomeId && (draft.contractId !== null || draft.originContractId != null)) errors.fixedOrigin = true;
  }
  if (draft.productId) {
    const sale = productSaleInfo(draft, context);
    if (!sale || sale.quantity <= 0 || sale.insufficient) errors.product = true;
  }
  if (draft.contractId !== null && (!draft.hourTypeId || !draft.hours || draft.hours <= 0)) errors.hours = true;
  else if (hours?.overBalance) errors.hoursOverBalance = true;
  return errors;
}

export function hasIncomeErrors(errors: IncomeDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Mensagem do rodapé: "Preencha descrição e valor e confira a data do recebimento." */
export function incomeErrorMessage(errors: IncomeDraftErrors): string {
  const clauses: string[] = [];
  const missing = [errors.description && 'descrição', errors.category && 'categoria', errors.amount && 'valor bruto']
    .filter((item): item is string => typeof item === 'string');
  if (missing.length) clauses.push(`preencha ${joinWithAnd(missing)}`);
  if (errors.net) clauses.push('o valor líquido não pode passar do bruto');
  if (errors.receiptDate) clauses.push('confira a data do recebimento');
  if (errors.client) clauses.push('use o cliente do contrato das horas');
  if (errors.endMonth) clauses.push(`escolha em "Até" um mês válido, em até ${MAX_REPLICAS} meses da receita`);
  if (errors.fixedOrigin) clauses.push('o contrato já controla a repetição desta receita');
  if (errors.product) clauses.push('confira a quantidade do produto vendido');
  if (errors.hours) clauses.push('complete as horas a faturar');
  if (errors.hoursOverBalance) clauses.push('lance no máximo o saldo de horas do contrato');
  return toSentence(clauses);
}

// ── Resumo ─────────────────────────────────────────────────────────────────

/** Linha sob a receita ativa: data, total, réplicas e avisos de comissão, estoque e horas. */
export function summarizeIncomeDraft(draft: IncomeDraft, context: IncomeRuleContext): SummaryContent | null {
  if (!draft.description.trim() || !draft.grossCents) return null;
  const receipt = receiptDateIso(draft, context.todayIso);
  const total = formatCents(draft.grossCents);

  const badges: SummaryBadge[] = [];
  const commission = commissionPreview(draft, context);
  if (commission.kind === 'rule' && commission.amountCents > 0) {
    const percent = commission.percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const type = commission.type === 'unica' ? 'única' : 'mensal';
    badges.push({ text: `comissão de ${formatCents(commission.amountCents)} para ${commission.representativeName} (${percent}% · ${type})`, tone: 'info' });
  }
  if (commission.kind === 'missing') badges.push({ text: 'sem comissão configurada para esta categoria', tone: 'warning' });

  const sale = productSaleInfo(draft, context);
  if (sale && sale.tracksStock && sale.quantity > 0) {
    badges.push(sale.insufficient
      ? { text: `estoque insuficiente: há ${formatQuantity(sale.stock)}`, tone: 'danger' }
      : { text: `baixa ${formatQuantity(sale.quantity)} do estoque · restam ${formatQuantity(sale.remaining)}`, tone: 'neutral' });
  }
  const hours = billableHoursInfo(draft, context);
  if (hours?.hourType && draft.hours) {
    badges.push(hours.overBalance
      ? { text: `saldo de horas insuficiente: restam ${formatQuantity(hours.hourType.balance)}h`, tone: 'danger' }
      : { text: `${formatQuantity(draft.hours)}h ${hours.hourType.name} · saldo ${formatQuantity(hours.hourType.balance - draft.hours)}h`, tone: 'neutral' });
  }
  const withholding = withholdingPreview(draft, context);
  if (withholding) {
    badges.push({ text: `líquido ${formatCents(withholding.netCents)} · retenções de ${formatCents(withholding.withheldCents)}`, tone: 'info' });
  } else if (draft.netCents !== null && draft.netCents < draft.grossCents) {
    badges.push({ text: `entram ${formatCents(draft.netCents)} · juros e taxas de ${formatCents(draft.grossCents - draft.netCents)}`, tone: 'info' });
  }

  return {
    detail: receipt ? `em ${isoToShortBrDate(receipt)}` : 'confira a data',
    total,
    badges,
  };
}

export function incomeHelpText(draft: IncomeDraft): string {
  return draft.billingType === 'fixed' || draft.forecastId !== undefined ? '' : 'Entra como recebida na data informada';
}

export function incomeLastAmountText(lastAmount: number | null): string | null {
  return lastAmount !== null ? `Última vez você recebeu ${formatCurrency(lastAmount)}` : null;
}

// ── Envio ──────────────────────────────────────────────────────────────────

function commonFields(draft: IncomeDraft, context: IncomeRuleContext): IncomeUpdateInput {
  return {
    description: draft.description.trim(),
    categoryId: draft.categoryId,
    grossAmount: toReais(draft.grossCents ?? 0),
    netAmount: toReais(effectiveNetCents(draft, context) ?? 0),
    receiptDate: receiptDateIso(draft, context.todayIso),
    clientId: draft.clientId,
    representativeId: draft.representativeId,
    attachmentIds: draft.attachments.map((attachment) => attachment.id),
  };
}

export function buildIncomeCreateInput(draft: IncomeDraft, context: IncomeRuleContext, accountId: number | null): IncomeCreateInput {
  return {
    ...commonFields(draft, context),
    accountId,
    billingType: draft.billingType,
    ...(draft.billingType === 'fixed' ? { endMonth: draft.endMonth, received: draft.received } : {}),
    productSale: draft.productId && draft.soldQuantity ? { productId: draft.productId, quantity: draft.soldQuantity } : null,
    billableHours: draft.contractId !== null && draft.hourTypeId !== null && draft.hours
      ? { hourTypeId: draft.hourTypeId, hours: draft.hours }
      : null,
  };
}

/** Na edição vão só os campos da própria receita: repetir, produto e horas não se aplicam. */
export function buildIncomeUpdateInput(draft: IncomeDraft, context: IncomeRuleContext): IncomeUpdateInput {
  return { ...commonFields(draft, context),
    ...(draft.fixedIncomeId !== undefined && draft.endMonth !== draft.initialEndMonth ? { endMonth: draft.endMonth } : {}),
  };
}

/** Consulta de duplicata no servidor; null enquanto faltam descrição ou valor. */
export function incomeDuplicateQuery(draft: IncomeDraft, excludeId: number | null): IncomeDuplicateQuery | null {
  const description = draft.description.trim();
  if (!description || !draft.grossCents) return null;
  return { description, amount: toReais(draft.grossCents), clientId: draft.clientId, excludeId };
}
