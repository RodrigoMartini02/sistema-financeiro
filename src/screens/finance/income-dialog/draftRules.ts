// Regras puras do modal de receita, sem React: réplicas de "Repetir até",
// prévia da comissão, venda de produto, horas a faturar, resumo, validação e
// montagem do que vai para a API.
import type { Produto } from '../../../services/catalogoService';
import type { ContratoResumo } from '../../../services/clientesService';
import type { IncomeDuplicateQuery } from '../../../services/incomeSuggestionsService';
import type { Representante } from '../../../services/representantesService';
import type { ClassificacaoReceita } from '../../../types/config';
import {
  MONTH_NAMES, type IncomeCreateInput, type IncomeHourType, type IncomeRepeatUntil, type IncomeUpdateInput,
} from '../../../types/finance';
import { brDateInputToIso, isoToBrDate, isoToShortBrDate } from '../../../utils/date';
import { dateInMonth } from '../../../utils/expenseSchedule';
import { formatCurrency } from '../formatters';
import { formatCents, toCents, toReais } from '../entry-dialog/cents';
import { joinWithAnd, toSentence } from '../entry-dialog/sentence';
import type { SummaryBadge, SummaryContent } from '../entry-dialog/SummaryLine';
import type { IncomeDraft, IncomeDraftErrors } from './draftState';

/** "Repetir até" gera no máximo 3 anos de réplicas (o mesmo limite do servidor). */
export const MAX_REPLICAS = 36;

export const EMPTY_INCOME_MESSAGE = 'Preencha descrição e valor para registrar.';

export interface IncomeRuleContext {
  todayIso: string;
  /** Conta PJ: cliente, representante, produto e horas. */
  isCompany: boolean;
  representatives: Representante[];
  /** Produtos ativos da conta. */
  products: Produto[];
  contracts: ContratoResumo[];
  /** Nomes do cadastro de clientes. */
  clientNames: string[];
}

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export function isIncomeDraftFilled(draft: IncomeDraft): boolean {
  return draft.description.trim() !== '' || !!draft.amountCents;
}

export function receiptDateIso(draft: IncomeDraft, todayIso: string): string {
  return brDateInputToIso(draft.receiptDate, todayIso);
}

/** "dez/26" (mês de 0 a 11). */
export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month]!.slice(0, 3).toLowerCase()}/${String(year).slice(2)}`;
}

/** Quantas réplicas "Repetir até" gera: os meses depois do mês da receita até o escolhido. */
export function replicaCount(draft: IncomeDraft, todayIso: string): number {
  const receipt = receiptDateIso(draft, todayIso);
  if (!draft.repeatUntil || !receipt) return 0;
  const [year, month] = receipt.split('-').map(Number);
  return (draft.repeatUntil.year - year!) * 12 + (draft.repeatUntil.month - (month! - 1));
}

/** Mês final ao ligar "Todo mês até": dezembro do ano da receita, ou do ano seguinte se ela já é de dezembro. */
export function defaultRepeatUntil(draft: IncomeDraft, todayIso: string): IncomeRepeatUntil {
  const [year, month] = (receiptDateIso(draft, todayIso) || todayIso).split('-').map(Number);
  return { month: 11, year: month === 12 ? year! + 1 : year! };
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
    amountCents: Math.round(((draft.amountCents ?? 0) * percent) / 100),
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

/** Valor da hora do tipo no contrato; null quando o contrato não cobra esse tipo. */
export function hourRate(contract: ContratoResumo, hourType: IncomeHourType): number | null {
  const rate = Number((hourType === 'presencial' ? contract.horas_presenciais_valor : contract.horas_remotas_valor) ?? 0);
  return rate > 0 ? rate : null;
}

export function hourBalance(contract: ContratoResumo, hourType: IncomeHourType): number | null {
  const balance = hourType === 'presencial' ? contract.horas_presenciais_saldo_atual : contract.horas_remotas_saldo_atual;
  return balance != null ? Number(balance) : null;
}

export interface BillableHoursInfo {
  contract: ContratoResumo;
  rate: number | null;
  balance: number | null;
  totalCents: number | null;
}

export function billableHoursInfo(draft: IncomeDraft, context: IncomeRuleContext): BillableHoursInfo | null {
  const contract = context.contracts.find((item) => item.id === draft.contractId);
  if (!contract) return null;
  const rate = draft.hourType ? hourRate(contract, draft.hourType) : null;
  return {
    contract,
    rate,
    balance: draft.hourType ? hourBalance(contract, draft.hourType) : null,
    totalCents: rate && draft.hours ? toCents(draft.hours * rate) : null,
  };
}

/** Valor calculado pela venda ou pelas horas. Preenche o campo, que continua editável (desconto, frete). */
export function calculatedAmountCents(draft: IncomeDraft, context: IncomeRuleContext): number | null {
  const sale = productSaleInfo(draft, context);
  if (sale && sale.quantity > 0) return sale.totalCents;
  return billableHoursInfo(draft, context)?.totalCents ?? null;
}

/**
 * Categoria fixa (valor e dia cadastrados): preenche o valor, se vazio, e o dia do
 * recebimento no mês da data. Data travada pelo calendário fica como está.
 */
export function fixedCategoryPatch(
  draft: IncomeDraft,
  category: ClassificacaoReceita | undefined,
  todayIso: string,
  dateLocked: boolean,
): Partial<IncomeDraft> {
  const fixed = category?.fixa;
  if (!fixed) return {};
  const patch: Partial<IncomeDraft> = {};
  if (!draft.amountCents) patch.amountCents = toCents(fixed.valor);
  if (!dateLocked) patch.receiptDate = isoToBrDate(dateInMonth(receiptDateIso(draft, todayIso) || todayIso, fixed.dia_recebimento));
  return patch;
}

/** O contrato traz cliente e representante quando eles ainda estão vazios. */
export function contractPrefill(draft: IncomeDraft, contract: ContratoResumo): Partial<IncomeDraft> {
  const patch: Partial<IncomeDraft> = {};
  if (!draft.client.trim()) patch.client = contract.cliente_nome;
  if (draft.representativeId === null && contract.representante_id) patch.representativeId = contract.representante_id;
  return patch;
}

// ── Validação ──────────────────────────────────────────────────────────────

export function validateIncomeDraft(draft: IncomeDraft, context: IncomeRuleContext): IncomeDraftErrors {
  const errors: IncomeDraftErrors = {};
  if (!draft.description.trim()) errors.description = true;
  if (!draft.amountCents) errors.amount = true;
  if (!receiptDateIso(draft, context.todayIso)) errors.receiptDate = true;
  const client = draft.client.trim();
  if (context.isCompany && client && !context.clientNames.includes(client)) errors.client = true;
  if (draft.repeatUntil) {
    const replicas = replicaCount(draft, context.todayIso);
    if (replicas < 1 || replicas > MAX_REPLICAS) errors.repeatUntil = true;
  }
  if (draft.productId) {
    const sale = productSaleInfo(draft, context);
    if (!sale || sale.quantity <= 0 || sale.insufficient) errors.product = true;
  }
  if (draft.contractId !== null && (!draft.hourType || !draft.hours || draft.hours <= 0)) errors.hours = true;
  return errors;
}

export function hasIncomeErrors(errors: IncomeDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Mensagem do rodapé: "Preencha descrição e valor e escolha um cliente do cadastro." */
export function incomeErrorMessage(errors: IncomeDraftErrors): string {
  const clauses: string[] = [];
  const missing = [errors.description && 'descrição', errors.amount && 'valor']
    .filter((item): item is string => typeof item === 'string');
  if (missing.length) clauses.push(`preencha ${joinWithAnd(missing)}`);
  if (errors.receiptDate) clauses.push('confira a data do recebimento');
  if (errors.client) clauses.push('escolha um cliente do cadastro');
  if (errors.repeatUntil) clauses.push(`escolha em "Repetir até" um mês depois do da receita, em até ${MAX_REPLICAS} meses`);
  if (errors.product) clauses.push('confira a quantidade do produto vendido');
  if (errors.hours) clauses.push('complete as horas a faturar');
  return toSentence(clauses);
}

// ── Resumo ─────────────────────────────────────────────────────────────────

/** Linha sob a receita ativa: data, total, réplicas e avisos de comissão, estoque e horas. */
export function summarizeIncomeDraft(draft: IncomeDraft, context: IncomeRuleContext): SummaryContent | null {
  if (!draft.description.trim() || !draft.amountCents) return null;
  const receipt = receiptDateIso(draft, context.todayIso);
  const replicas = replicaCount(draft, context.todayIso);
  const repeats = draft.repeatUntil !== null && replicas > 0;
  const total = formatCents(draft.amountCents)
    + (repeats ? ` · todo mês até ${monthLabel(draft.repeatUntil!.month, draft.repeatUntil!.year)} · ${replicas + 1} lançamentos` : '');

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
  if (hours && draft.hourType && draft.hours) {
    const kind = draft.hourType === 'presencial' ? 'presenciais' : 'remotas';
    const balance = hours.balance !== null ? ` · saldo ${formatQuantity(hours.balance)}h` : '';
    badges.push({ text: `${formatQuantity(draft.hours)}h ${kind}${balance}`, tone: 'neutral' });
  }

  return {
    status: { text: 'Recebida', tone: 'success' },
    detail: receipt ? `em ${isoToShortBrDate(receipt)}` : 'confira a data',
    total,
    badges,
  };
}

export function incomeHelpText(draft: IncomeDraft): string {
  return draft.repeatUntil ? 'Cada mês vira uma receita, gravadas juntas' : 'Entra como recebida na data informada';
}

export function incomeLastAmountText(lastAmount: number | null): string | null {
  return lastAmount !== null ? `Última vez você recebeu ${formatCurrency(lastAmount)}` : null;
}

// ── Envio ──────────────────────────────────────────────────────────────────

function commonFields(draft: IncomeDraft, context: IncomeRuleContext): IncomeUpdateInput {
  return {
    description: draft.description.trim(),
    categoryId: draft.categoryId,
    amount: toReais(draft.amountCents ?? 0),
    receiptDate: receiptDateIso(draft, context.todayIso),
    client: draft.client.trim() || null,
    representativeId: draft.representativeId,
    attachments: draft.attachments.length > 0 ? draft.attachments : null,
  };
}

export function buildIncomeCreateInput(draft: IncomeDraft, context: IncomeRuleContext, accountId: number | null): IncomeCreateInput {
  return {
    ...commonFields(draft, context),
    accountId,
    repeatUntil: draft.repeatUntil && replicaCount(draft, context.todayIso) > 0 ? draft.repeatUntil : null,
    productSale: draft.productId && draft.soldQuantity ? { productId: draft.productId, quantity: draft.soldQuantity } : null,
    billableHours: draft.contractId !== null && draft.hourType && draft.hours
      ? { contractId: draft.contractId, hourType: draft.hourType, hours: draft.hours }
      : null,
  };
}

/** Na edição vão só os campos da própria receita: repetir, produto e horas não se aplicam. */
export function buildIncomeUpdateInput(draft: IncomeDraft, context: IncomeRuleContext): IncomeUpdateInput {
  return commonFields(draft, context);
}

/** Consulta de duplicata no servidor; null enquanto faltam descrição ou valor. */
export function incomeDuplicateQuery(draft: IncomeDraft, excludeId: number | null): IncomeDuplicateQuery | null {
  const description = draft.description.trim();
  if (!description || !draft.amountCents) return null;
  return { description, amount: toReais(draft.amountCents), client: draft.client.trim() || null, excludeId };
}
