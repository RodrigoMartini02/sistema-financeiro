// Leitura e validação dos pedidos de receita: corpo do POST/PUT e parâmetros das
// consultas de sugestões e duplicata. Sem acesso ao banco — é o que a rota confere
// antes de chamar o serviço, e por isso pode ser testado isoladamente.
import { countMonthsUntil } from '../utils/date';
import {
  RequestInputError, readAmount, readAttachments, readDescription, readIsoDate, readOptionalId, readOptionalText,
  readQueryId, readQueryText, readRecord,
} from '../utils/requestInput';

export const HOUR_TYPES = ['presencial', 'remoto'] as const;
export type HourType = (typeof HOUR_TYPES)[number];

/** "Repetir até" gera no máximo 3 anos de réplicas. */
export const MAX_REPLICAS = 36;

const MAX_CLIENT_LENGTH = 100;
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

export interface IncomeBillableHours {
  contractId: number;
  hourType: HourType;
  hours: number;
}

export interface IncomeFieldsInput {
  description: string;
  categoryId: number | null;
  amount: number;
  receiptDate: string;
  client: string | null;
  representativeId: number | null;
  attachments: unknown[] | null;
}

export interface CreateIncomeInput extends IncomeFieldsInput {
  accountId: number | null;
  repeatUntil: IncomeRepeatUntil | null;
  productSale: IncomeProductSale | null;
  billableHours: IncomeBillableHours | null;
}

/** Na edição não há réplicas, produto nem horas: só os campos da própria receita. */
export type UpdateIncomeInput = IncomeFieldsInput;

export interface IncomeSuggestionsQuery {
  /** Vazia quando o texto tem menos de 2 letras. */
  description: string;
  accountId: number | null;
}

export interface IncomeDuplicateQuery {
  description: string;
  amount: number;
  client: string | null;
  accountId: number | null;
  excludeId: number | null;
}

function readFields(record: Record<string, unknown>): IncomeFieldsInput {
  return {
    description: readDescription(record['description']),
    categoryId: readOptionalId(record['categoryId'], 'Categoria inválida'),
    amount: readAmount(record['amount'], 'Informe o valor'),
    receiptDate: readIsoDate(record['receiptDate'], 'Data do recebimento inválida'),
    client: readOptionalText(record['client'], 'Cliente', MAX_CLIENT_LENGTH),
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
  const contractId = readOptionalId(record['contractId'], 'Contrato inválido');
  if (contractId === null) {
    throw new RequestInputError('Escolha o contrato das horas');
  }
  const hourType = record['hourType'];
  if (!HOUR_TYPES.includes(hourType as HourType)) {
    throw new RequestInputError('Escolha horas presenciais ou remotas');
  }
  return { contractId, hourType: hourType as HourType, hours: readQuantity(record['hours'], 'Informe a quantidade de horas') };
}

/** Corpo do POST /incomes. */
export function readCreateIncomeInput(body: unknown): CreateIncomeInput {
  const record = readRecord(body, 'Pedido inválido');
  const fields = readFields(record);
  return {
    ...fields,
    accountId: readOptionalId(record['accountId'], 'Conta inválida'),
    repeatUntil: readRepeatUntil(record['repeatUntil'], fields.receiptDate),
    productSale: readProductSale(record['productSale']),
    billableHours: readBillableHours(record['billableHours']),
  };
}

/** Corpo do PUT /incomes/:id. */
export function readUpdateIncomeInput(body: unknown): UpdateIncomeInput {
  return readFields(readRecord(body, 'Pedido inválido'));
}

/** GET /incomes/suggestions?description=&account_id= */
export function readIncomeSuggestionsQuery(query: Record<string, unknown>): IncomeSuggestionsQuery {
  const description = readQueryText(query['description']);
  return {
    description: description.length >= MIN_SEARCH_LENGTH ? description : '',
    accountId: readQueryId(query['account_id'], 'Conta inválida'),
  };
}

/** GET /incomes/duplicate?description=&amount=&client=&account_id=&exclude_id= */
export function readIncomeDuplicateQuery(query: Record<string, unknown>): IncomeDuplicateQuery {
  const description = readQueryText(query['description']);
  if (!description) {
    throw new RequestInputError('Informe a descrição');
  }
  return {
    description,
    amount: readAmount(Number(query['amount']), 'Informe o valor'),
    client: readQueryText(query['client']) || null,
    accountId: readQueryId(query['account_id'], 'Conta inválida'),
    excludeId: readQueryId(query['exclude_id'], 'Receita inválida'),
  };
}
