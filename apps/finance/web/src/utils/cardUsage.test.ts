import assert from 'node:assert/strict';
import test from 'node:test';
import type { OverdueInvoice } from '../services/cardInvoicesService';
import {
  isValidPaymentDate, overdueInvoiceKey, overdueSelectionTotals, usageMonthText, usageTypesText,
} from './cardUsage';

// O formatador de moeda põe um espaço não separável depois do "R$".
const plain = (text: string) => text.replace(/\u00a0/g, ' ');

const invoice = (cardId: number, invoiceMonth: string, openTotal: number): OverdueInvoice => ({
  card: { id: cardId, name: `Cartão ${cardId}`, ownerName: null }, invoiceMonth, dueDate: `${invoiceMonth.slice(0, 8)}28`, openTotal, itemCount: 2,
});

test('mês da fatura em poucas letras', () => {
  assert.equal(usageMonthText('2026-09'), 'set/2026');
  assert.equal(usageMonthText('2027-01'), 'jan/2027');
  assert.equal(usageMonthText('2026-12'), 'dez/2026');
});

test('o texto por tipo lista só o que tem valor, na ordem fixa', () => {
  assert.equal(
    plain(usageTypesText({ unicas: 133.33, parcelas: 50, recorrentes: 0, renegociacao: 20 })),
    'Compras únicas R$ 133,33 · Parcelas R$ 50,00 · Renegociação da fatura R$ 20,00',
  );
  assert.equal(usageTypesText({ unicas: 0, parcelas: 0, recorrentes: 0, renegociacao: 0 }), '');
  assert.equal(plain(usageTypesText({ unicas: 0, parcelas: 0, recorrentes: 55.9, renegociacao: 0 })), 'Recorrentes R$ 55,90');
});

test('a chave da fatura junta cartão e mês', () => {
  assert.equal(overdueInvoiceKey(invoice(7, '2026-09-01', 10)), '7|2026-09-01');
  assert.notEqual(overdueInvoiceKey(invoice(7, '2026-09-01', 10)), overdueInvoiceKey(invoice(8, '2026-09-01', 10)));
});

test('o total marcado soma em centavos, sem erro de ponto flutuante', () => {
  const invoices = [invoice(7, '2026-08-01', 0.1), invoice(7, '2026-09-01', 0.2), invoice(8, '2026-09-01', 155.9)];
  assert.deepEqual(overdueSelectionTotals(invoices, new Set()), { count: 0, totalCents: 0 });
  assert.deepEqual(overdueSelectionTotals(invoices, new Set(['7|2026-08-01', '7|2026-09-01'])), { count: 2, totalCents: 30 });
  assert.deepEqual(overdueSelectionTotals(invoices, new Set(invoices.map(overdueInvoiceKey))), { count: 3, totalCents: 15620 });
  // Chave que não está na lista é ignorada.
  assert.deepEqual(overdueSelectionTotals(invoices, new Set(['9|2026-01-01'])), { count: 0, totalCents: 0 });
});

test('a data do pagamento: real e não futura', () => {
  const today = '2026-10-25';
  assert.equal(isValidPaymentDate('2026-10-25', today), true);
  assert.equal(isValidPaymentDate('2026-09-30', today), true);
  assert.equal(isValidPaymentDate('2026-10-26', today), false);
  assert.equal(isValidPaymentDate('2026-02-30', today), false);
  assert.equal(isValidPaymentDate('30/09/2026', today), false);
  assert.equal(isValidPaymentDate('', today), false);
});
