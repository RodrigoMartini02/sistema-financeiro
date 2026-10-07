// Leitura e validação dos pedidos do pagamento da fatura (/api/card-invoices),
// sem acesso ao banco. O cliente manda só o que o usuário informa; a lista de
// compras, a soma, as partes de cada compra e os vencimentos saem do banco e de
// cardInvoiceRules.
import {
  MAX_AMOUNT, RequestInputError, readAmount, readIsoDate, readOptionalId, readRecord, roundCents,
} from '../utils/requestInput';
import { parseEffectiveMonth } from './cardDueDate';
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS } from './expenseInput';

export const INVOICE_PAYMENT_INPUT_METHODS = ['total', 'partial', 'installments'] as const;
export type InvoicePaymentInputMethod = (typeof INVOICE_PAYMENT_INPUT_METHODS)[number];

export interface InvoicePaymentInput {
  cardId: number;
  /** 1º dia do mês da fatura ('AAAA-MM-01'). */
  invoiceMonthStart: string;
  method: InvoicePaymentInputMethod;
  paymentDate: string;
  /** Total e parcial: o que foi pago agora. */
  amountPaid: number | null;
  /** Parcial e parcelado: os juros informados; 0 no total. */
  interestAmount: number;
  /** Só no parcelado. */
  installmentCount: number | null;
}

const INVALID_MONTH = 'Mês da fatura inválido';

/** Mês da fatura 'AAAA-MM' (query ou corpo) → 1º dia do mês. */
export function readInvoiceMonth(value: unknown): string {
  const monthStart = parseEffectiveMonth(value);
  if (monthStart === null) {
    throw new RequestInputError(INVALID_MONTH);
  }
  return monthStart;
}

function readInterestAmount(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RequestInputError('Juros inválidos');
  }
  if (value > MAX_AMOUNT) {
    throw new RequestInputError('Juros acima do limite permitido');
  }
  return roundCents(value);
}

function readMethod(value: unknown): InvoicePaymentInputMethod {
  if (!INVOICE_PAYMENT_INPUT_METHODS.includes(value as InvoicePaymentInputMethod)) {
    throw new RequestInputError('Forma de pagamento inválida');
  }
  return value as InvoicePaymentInputMethod;
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

/** Corpo do POST /api/card-invoices/payments. */
export function readInvoicePaymentInput(body: unknown): InvoicePaymentInput {
  const record = readRecord(body, 'Pedido inválido');
  const cardId = readOptionalId(record['cardId'], 'Cartão inválido');
  if (cardId === null) {
    throw new RequestInputError('Informe o cartão');
  }
  const invoiceMonthStart = readInvoiceMonth(record['invoiceMonth']);
  const method = readMethod(record['method']);
  const paymentDate = readIsoDate(record['paymentDate'], 'Data do pagamento inválida');

  let amountPaid: number | null = null;
  if (method === 'installments') {
    if (!isAbsent(record['amountPaid'])) {
      throw new RequestInputError('No parcelado não há valor pago agora');
    }
  } else {
    amountPaid = readAmount(record['amountPaid'], 'Informe o valor pago');
  }

  let interestAmount = 0;
  if (method === 'total') {
    if (!isAbsent(record['interestAmount'])) {
      throw new RequestInputError('No pagamento total, o que passar da soma já entra como encargos');
    }
  } else {
    interestAmount = readInterestAmount(record['interestAmount']);
  }

  let installmentCount: number | null = null;
  if (method === 'installments') {
    const count = record['installmentCount'];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
      throw new RequestInputError(`Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas`);
    }
    installmentCount = count;
  } else if (!isAbsent(record['installmentCount'])) {
    throw new RequestInputError('Parcelas só valem para o pagamento parcelado');
  }

  return { cardId, invoiceMonthStart, method, paymentDate, amountPaid, interestAmount, installmentCount };
}
