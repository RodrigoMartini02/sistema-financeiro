// Leitura e validação dos pedidos de receita: corpo do POST/PUT e parâmetros das
// consultas de sugestões e duplicata. Sem acesso ao banco — é o que a rota confere
// antes de chamar o serviço, e por isso pode ser testado isoladamente.
import { countMonthsUntil } from '../utils/date';
import {
  RequestInputError, readAmount, readAttachments, readDescription, readIsoDate, readOptionalId, readQueryId, readQueryText,
  readRecord, readRequiredId,
} from '../utils/requestInput';

/** "Repetir até" gera no máximo 3 anos de réplicas. */
export const MAX_REPLICAS = 36;

const MAX_PRODUCT_ID_LENGTH = 36;
/** Maior quantidade que cabe em decimal(12,3). */
const MAX_QUANTITY = 999_999_999.999;
const MIN_SEARCH_LENGTH = 2;

export interface IncomeRepeatUntil {
  /** 0 a 11. */
  month: number;
  year: number;
}

export interface IncomeProductSale {
  productId: string;
  quantity: number;
}

/** Horas do banco de horas de um contrato da conta: o tipo de hora diz o contrato. */
export interface IncomeBillableHours {
  hourTypeId: number;
  hours: number;
}

export interface IncomeFieldsInput {
  description: string;
  categoryId: number;
  /** O que era devido; o líquido não passa dele. */
  grossAmount: number;
  /** O que entrou na conta. Em contrato com retenção, o servidor ignora e calcula pelo bruto. */
  netAmount: number;
  receiptDate: string;
  /** Cliente do cadastro da conta PJ; nulo sem cliente. */
  clientId: number | null;
  representativeId: number | null;
  attachments: unknown[] | null;
}

export interface CreateIncomeInput extends IncomeFieldsInput {
  accountId: number | null;
  billingType?: 'single' | 'fixed';
  endMonth?: string | null;
  received?: boolean;
  /** Compatibilidade do consumidor anterior; o serviço usa a mesma série fixa. */
  repeatUntil: IncomeRepeatUntil | null;
  productSale: IncomeProductSale | null;
  billableHours: IncomeBillableHours | null;
}

/** Na edição não há réplicas, produto nem horas: só os campos da própria receita. */
export type UpdateIncomeInput = IncomeFieldsInput & { endMonth?: string };

export interface IncomeSuggestionsQuery {
  /** Vazia quando o texto tem menos de 2 letras. */
  description: string;
  accountId: number | null;
}

/** Recebimento: data e valor recebidos, os dois opcionais (sem eles, valem os da receita). */
export interface ReceiveIncomeInput {
  receivedDate: string | null;
  receivedAmount: number | null;
  changes?: UpdateIncomeInput;
}

export function readIncomeMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100) {
    throw new RequestInputError('Escolha um mês e ano válidos para a receita fixa');
  }
  return value;
}

export function readIncomeDeferral(body: unknown): { accountId: number | null; ids: number[]; deferred: boolean } {
  const record = readRecord(body, 'Pedido inválido');
  if (!Array.isArray(record['ids']) || record['ids'].length < 1 || record['ids'].length > 500
    || typeof record['deferred'] !== 'boolean') throw new RequestInputError('Selecione de 1 a 500 receitas previstas');
  return { accountId: readOptionalId(record['accountId'], 'Conta inválida'),
    ids: [...new Set(record['ids'].map(id => readRequiredId(id, 'Receita inválida')))], deferred: record['deferred'] };
}

export interface IncomeDuplicateQuery {
  description: string;
  /** O valor bruto digitado. */
  amount: number;
  clientId: number | null;
  accountId: number | null;
  excludeId: number | null;
}

function readFields(record: Record<string, unknown>): IncomeFieldsInput {
  const grossAmount = readAmount(record['grossAmount'], 'Informe o valor bruto');
  const netAmount = readAmount(record['netAmount'], 'Informe o valor líquido');
  if (netAmount > grossAmount) {
    throw new RequestInputError('O valor líquido não pode passar do bruto');
  }
  return {
    description: readDescription(record['description']),
    categoryId: readRequiredId(record['categoryId'], 'Escolha a categoria'),
    grossAmount,
    netAmount,
    receiptDate: readIsoDate(record['receiptDate'], 'Data do recebimento inválida'),
    clientId: readOptionalId(record['clientId'], 'Cliente inválido'),
    representativeId: readOptionalId(record['representativeId'], 'Representante inválido'),
    attachments: readAttachments(record['attachments']),
  };
}

function readQuantity(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY) {
    throw new RequestInputError(message);
  }
  return Math.round(value * 1000) / 1000;
}

function readRepeatUntil(value: unknown, receiptDate: string): IncomeRepeatUntil | null {
  if (value === undefined || value === null) return null;
  const record = readRecord(value, 'Repetir até: informe mês e ano');
  const month = record['month'];
  const year = record['year'];
  if (typeof month !== 'number' || !Number.isInteger(month) || month < 0 || month > 11
    || typeof year !== 'number' || !Number.isInteger(year)) {
    throw new RequestInputError('Repetir até: informe mês e ano');
  }
  const replicas = countMonthsUntil(receiptDate, month, year);
  if (replicas < 1) {
    throw new RequestInputError('Repetir até: escolha um mês depois do mês da receita');
  }
  if (replicas > MAX_REPLICAS) {
    throw new RequestInputError(`Repetir até: no máximo ${MAX_REPLICAS} meses`);
  }
  return { month, year };
}

function readProductSale(value: unknown): IncomeProductSale | null {
  if (value === undefined || value === null) return null;
  const record = readRecord(value, 'Produto vendido inválido');
  const productId = record['productId'];
  if (typeof productId !== 'string' || productId.trim() === '' || productId.trim().length > MAX_PRODUCT_ID_LENGTH) {
    throw new RequestInputError('Produto vendido inválido');
  }
  return { productId: productId.trim(), quantity: readQuantity(record['quantity'], 'Informe a quantidade vendida') };
}

function readBillableHours(value: unknown): IncomeBillableHours | null {
  if (value === undefined || value === null) return null;
  const record = readRecord(value, 'Horas a faturar inválidas');
  const hourTypeId = readOptionalId(record['hourTypeId'], 'Tipo de hora inválido');
  if (hourTypeId === null) {
    throw new RequestInputError('Escolha o tipo de hora');
  }
  // O banco de horas guarda duas casas.
  const hours = Math.round(readQuantity(record['hours'], 'Informe a quantidade de horas') * 100) / 100;
  if (hours <= 0) {
    throw new RequestInputError('Informe a quantidade de horas');
  }
  return { hourTypeId, hours };
}

/** Corpo do POST /incomes. */
export function readCreateIncomeInput(body: unknown): CreateIncomeInput {
  const record = readRecord(body, 'Pedido inválido');
  const fields = readFields(record);
  const legacyRepeat = readRepeatUntil(record['repeatUntil'], fields.receiptDate);
  const billingType = record['billingType'] ?? (legacyRepeat ? 'fixed' : 'single');
  if (billingType !== 'single' && billingType !== 'fixed') throw new RequestInputError('Tipo de repetição inválido');
  if (record['received'] !== undefined && typeof record['received'] !== 'boolean') throw new RequestInputError('Informe se a receita foi recebida');
  const endMonth = billingType === 'fixed'
    ? readIncomeMonth(record['endMonth'] ?? (legacyRepeat ? `${legacyRepeat.year}-${String(legacyRepeat.month + 1).padStart(2, '0')}` : null)) : null;
  if (endMonth && (endMonth < fields.receiptDate.slice(0, 7)
    || countMonthsUntil(fields.receiptDate, Number(endMonth.slice(5, 7)) - 1, Number(endMonth.slice(0, 4))) > MAX_REPLICAS)) {
    throw new RequestInputError(`Escolha um limite entre o mês da receita e ${MAX_REPLICAS} meses depois`);
  }
  return {
    ...fields,
    accountId: readOptionalId(record['accountId'], 'Conta inválida'),
    repeatUntil: legacyRepeat,
    billingType,
    endMonth,
    received: record['received'] === undefined ? (legacyRepeat !== null || billingType === 'single') : record['received'],
    productSale: readProductSale(record['productSale']),
    billableHours: readBillableHours(record['billableHours']),
  };
}

/** Corpo do PUT /incomes/:id. */
export function readUpdateIncomeInput(body: unknown): UpdateIncomeInput {
  const record = readRecord(body, 'Pedido inválido');
  return { ...readFields(record), ...(record['endMonth'] == null ? {} : { endMonth: readIncomeMonth(record['endMonth']) }) };
}

/** Corpo do PUT /incomes/:id/receber: `data_recebimento` e `valor_recebido`, opcionais. */
export function readReceiveIncomeInput(body: unknown): ReceiveIncomeInput {
  const record = body === undefined || body === null ? {} : readRecord(body, 'Pedido inválido');
  const rawDate = record['data_recebimento'];
  const rawAmount = record['valor_recebido'];
  return {
    receivedDate: rawDate === undefined || rawDate === null || rawDate === ''
      ? null
      : readIsoDate(rawDate, 'Data do recebimento inválida'),
    // Vazio ou zero mantém o valor da receita, como antes.
    receivedAmount: !rawAmount
      ? null
      : readAmount(typeof rawAmount === 'string' ? Number(rawAmount) : rawAmount, 'Valor recebido inválido'),
    ...(record['changes'] === undefined ? {} : { changes: readUpdateIncomeInput(record['changes']) }),
  };
}

/** GET /incomes/suggestions?description=&account_id= */
export function readIncomeSuggestionsQuery(query: Record<string, unknown>): IncomeSuggestionsQuery {
  const description = readQueryText(query['description']);
  return {
    description: description.length >= MIN_SEARCH_LENGTH ? description : '',
    accountId: readQueryId(query['account_id'], 'Conta inválida'),
  };
}

/** GET /incomes/duplicate?description=&amount=&client_id=&account_id=&exclude_id= */
export function readIncomeDuplicateQuery(query: Record<string, unknown>): IncomeDuplicateQuery {
  const description = readQueryText(query['description']);
  if (!description) {
    throw new RequestInputError('Informe a descrição');
  }
  return {
    description,
    amount: readAmount(Number(query['amount']), 'Informe o valor'),
    clientId: readQueryId(query['client_id'], 'Cliente inválido'),
    accountId: readQueryId(query['account_id'], 'Conta inválida'),
    excludeId: readQueryId(query['exclude_id'], 'Receita inválida'),
  };
}
