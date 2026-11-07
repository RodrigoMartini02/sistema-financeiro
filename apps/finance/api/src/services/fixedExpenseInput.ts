import { readCreateExpenseInput, readExpenseEndMonth, type ExpenseFieldsInput, type PaymentInput } from './expenseInput';
import { readOptionalId, readRecord, readRequiredId, RequestInputError } from '../utils/requestInput';

export interface FixedExpenseInput extends ExpenseFieldsInput, PaymentInput {
  accountId: number | null;
  amount: number;
  dueDate: string;
  endMonth: string;
  sourceExpenseId: number | null;
}

export const readFixedMonth = readExpenseEndMonth;

export function readFixedExpenseInput(body: unknown): FixedExpenseInput {
  const record = readRecord(body, 'Despesa fixa inválida');
  if (record['cardId'] != null && record['paymentMethod'] !== 'credito' && record['paymentMethod'] !== 'debito') {
    throw new RequestInputError('O cartão só vale para débito ou crédito');
  }
  const input = readCreateExpenseInput({ ...record, billingType: 'single' });
  if (input.billingType !== 'single') throw new RequestInputError('Despesa fixa inválida');
  if (input.paymentMethod === 'credito' && input.cardId === null) throw new RequestInputError('Escolha o cartão de crédito');
  const endMonth = readExpenseEndMonth(record['endMonth']);
  if (endMonth < input.dueDate.slice(0, 7)) {
    throw new RequestInputError('O mês final não pode ser anterior ao primeiro vencimento');
  }
  const { billingType: _billingType, ...fields } = input;
  return { ...fields, endMonth, sourceExpenseId: readOptionalId(record['sourceExpenseId'], 'Despesa de origem inválida') };
}

export function readFixedDeferral(body: unknown) {
  const record = readRecord(body, 'Adiamento inválido');
  if (typeof record['deferred'] !== 'boolean') throw new RequestInputError('Informe se deseja adiar a despesa');
  if (!Array.isArray(record['ids']) || record['ids'].length === 0 || record['ids'].length > 500) {
    throw new RequestInputError('Selecione de 1 a 500 previsões');
  }
  return {
    accountId: readOptionalId(record['accountId'], 'Conta inválida'),
    ids: [...new Set(record['ids'].map(id => readRequiredId(id, 'Previsão inválida')))],
    deferred: record['deferred'],
  };
}
