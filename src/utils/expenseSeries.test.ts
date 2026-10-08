import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense } from '../types/finance';
import { installmentScopeRows, openFollowingOccurrences } from './expenseSeries';

function expense(id: number, overrides: Partial<Expense> = {}): Expense {
  return {
    id, descricao: 'Série', valorFinal: 100, categoria: 'Outros', categoriaId: 1, formaPagamento: 'credito',
    cartaoId: 6, dataVencimento: '2026-10-04', mes: 9, ano: 2026, status: 'ativa', pago: false,
    recorrente: true, parcelado: false, grupoParcelamentoId: 1, ...overrides,
  } as Expense;
}

const ids = (rows: Expense[]) => rows.map((row) => row.id);

test('mensal: as próximas em aberto, fora pagas, canceladas, ligadas à fatura, a editada e as anteriores', () => {
  const edited = expense(2, { dataVencimento: '2026-10-04' });
  const series = [
    expense(1, { dataVencimento: '2026-09-04' }),
    edited,
    expense(3, { dataVencimento: '2026-11-09' }),
    expense(4, { dataVencimento: '2026-12-09', pago: true }),
    expense(5, { dataVencimento: '2027-01-09', status: 'cancelada' }),
    expense(6, { dataVencimento: '2027-02-09', invoicePaymentId: 9 }),
    expense(7, { dataVencimento: '2027-03-09' }),
    expense(8, { dataVencimento: '2027-04-09', grupoParcelamentoId: 2 }),
  ];
  assert.deepEqual(ids(openFollowingOccurrences(series, edited)), [3, 7]);
  assert.deepEqual(openFollowingOccurrences([expense(3, { dataVencimento: '2026-11-09' })], expense(2, { recorrente: false })), []);
});

test('parcelado: "esta e as próximas" pega as de número maior, pagas incluídas', () => {
  const installment = (id: number, number: number, overrides: Partial<Expense> = {}) => expense(id, {
    recorrente: false, parcelado: true, parcelaAtual: number, dataVencimento: `2026-${String(7 + number).padStart(2, '0')}-10`, ...overrides,
  });
  const edited = installment(13, 3);
  const series = [
    installment(11, 1, { pago: true }),
    installment(12, 2),
    edited,
    installment(14, 4, { pago: true }),
    installment(15, 5, { invoiceOriginPaymentId: 7 }),
    installment(16, 6, { status: 'cancelada' }),
  ];
  assert.deepEqual(ids(installmentScopeRows(series, edited, 'following')), [14]);
  assert.deepEqual(ids(installmentScopeRows(series, edited, 'all')), [11, 12, 14]);
  // Fora do parcelado, nenhuma parcela entra.
  assert.deepEqual(installmentScopeRows(series, expense(20), 'all'), []);
});
