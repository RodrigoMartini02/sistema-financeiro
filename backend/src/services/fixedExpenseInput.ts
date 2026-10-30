import { PAYMENT_METHODS, type PaymentMethod } from './expenseInput';
import { parseEffectiveMonth } from './cardDueDate';
import { readAmount, readDescription, readIsoDate, readOptionalId, readRecord, readRequiredId, RequestInputError } from '../utils/requestInput';

export interface FixedExpenseInput {
  accountId: number | null;
  description: string;
  categoryId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  cardId: number | null;
  purchaseDate: string;
  dueDate: string;
  firstMonth: string;
  sourceExpenseId: number | null;
}

export interface FixedExpenseUpdateInput extends FixedExpenseInput {
  applyToFuture: boolean;
}

export function readFixedMonth(value: unknown): string {
  const parsed = parseEffectiveMonth(value);
  if (!parsed || Number(parsed.slice(0, 4)) < 2000 || Number(parsed.slice(0, 4)) > 2100) {
    throw new RequestInputError('Escolha um mês válido para a despesa fixa');
  }
  return parsed.slice(0, 7);
}

export function readFixedExpenseInput(body: unknown): FixedExpenseInput {
  const record = readRecord(body, 'Despesa fixa inválida');
  const paymentMethod = record['paymentMethod'];
  if (!(PAYMENT_METHODS as readonly unknown[]).includes(paymentMethod)) {
    throw new RequestInputError('Forma de pagamento inválida');
  }
  const cardId = readOptionalId(record['cardId'], 'Cartão inválido');
  if (cardId !== null && paymentMethod !== 'credito' && paymentMethod !== 'debito') {
    throw new RequestInputError('O cartão só vale para débito ou crédito');
  }
  if (paymentMethod === 'credito' && cardId === null) {
    throw new RequestInputError('Escolha o cartão de crédito');
  }
  return {
    accountId: readOptionalId(record['accountId'], 'Conta inválida'),
    description: readDescription(record['description']),
    categoryId: readRequiredId(record['categoryId'], 'Escolha a categoria'),
    amount: readAmount(record['amount'], 'Informe o valor de referência'),
    paymentMethod: paymentMethod as PaymentMethod,
    cardId,
    purchaseDate: readIsoDate(record['purchaseDate'], 'Data da compra inválida'),
    dueDate: readIsoDate(record['dueDate'], 'Vencimento inválido'),
    firstMonth: readFixedMonth(record['firstMonth']),
    sourceExpenseId: readOptionalId(record['sourceExpenseId'], 'Despesa de origem inválida'),
  };
}

export function readFixedExpenseUpdateInput(body: unknown): FixedExpenseUpdateInput {
  const record = readRecord(body, 'Despesa fixa inválida');
  if (typeof record['applyToFuture'] !== 'boolean') {
    throw new RequestInputError('Informe se deseja atualizar as previsões futuras');
  }
  const input = readFixedExpenseInput(body);
  if (input.sourceExpenseId !== null) throw new RequestInputError('A origem da despesa fixa não pode mudar');
  return { ...input, applyToFuture: record['applyToFuture'] };
}

export function readFixedRenewalYear(body: unknown): number {
  const record = readRecord(body, 'Renovação inválida');
  const year = record['year'];
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new RequestInputError('Ano de renovação inválido');
  }
  return year;
}
