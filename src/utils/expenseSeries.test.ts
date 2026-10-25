import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expense } from '../types/finance';
import {
  cashPriceInterestNote, cashPriceInterestPreview, installmentScopeRows, openFollowingOccurrences, paidInstallmentsNote,
  seriesValueImpact, seriesValueNotes,
} from './expenseSeries';

function expense(id: number, overrides: Partial<Expense> = {}): Expense {
  return {
    id, descricao: 'Série', valorFinal: 100, categoria: 'Outros', categoriaId: 1, formaPagamento: 'credito',
    cartaoId: 6, dataVencimento: '2026-10-04', mes: 9, ano: 2026, status: 'ativa', pago: false,
    recorrente: true, parcelado: false, grupoParcelamentoId: 1, ...overrides,
  } as Expense;
}

const ids = (rows: Expense[]) => rows.map((row) => row.id);
// O formatador de moeda põe um espaço não separável depois do "R$".
const plain = (text: string) => text.replace(/\u00a0/g, ' ');

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

test('parcelado: o aviso das pagas do alcance conta só as pagas e some sem elas', () => {
  const installment = (id: number, number: number, overrides: Partial<Expense> = {}) => expense(id, {
    recorrente: false, parcelado: true, parcelaAtual: number, dataVencimento: `2026-${String(7 + number).padStart(2, '0')}-10`, ...overrides,
  });
  const edited = installment(13, 3);
  const series = [
    installment(11, 1, { pago: true }),
    installment(12, 2, { pago: true }),
    edited,
    installment(14, 4),
    installment(15, 5, { pago: true, invoicePaymentId: 7 }),
  ];
  const twoPaid = '2 parcelas já pagas mantêm vencimento, forma e cartão (valor e demais campos mudam).';
  const onePaid = '1 parcela já paga mantém vencimento, forma e cartão (valor e demais campos mudam).';
  // "Todas": a 1 e a 2 estão pagas; a 5, paga pela fatura, nem entra no alcance.
  assert.equal(paidInstallmentsNote(installmentScopeRows(series, edited, 'all')), twoPaid);
  // "Esta e as próximas": só a 4, em aberto.
  assert.equal(paidInstallmentsNote(installmentScopeRows(series, edited, 'following')), null);
  assert.equal(paidInstallmentsNote([{ pago: true }]), onePaid);
  assert.equal(paidInstallmentsNote([]), null);
});

// Compra parcelada de 3 × R$ 35,00 no crédito; `overrides` muda uma parcela.
function purchase(overrides: Record<number, Partial<Expense>> = {}): Expense[] {
  return [1, 2, 3].map((number) => expense(10 + number, {
    recorrente: false, parcelado: true, parcelaAtual: number, valorFinal: 35, valorOriginal: 35,
    dataVencimento: `2026-${String(9 + number).padStart(2, '0')}-10`, ...overrides[number],
  }));
}

test('valor em série: o valor novo vale para a editada e para todas do alcance, pagas incluídas', () => {
  const series = purchase({ 1: { pago: true } });
  const impact = seriesValueImpact(series, series[1]!, 'all', 40)!;
  assert.equal(impact.changedCount, 3);
  assert.equal(impact.oldTotalCents, 10500);
  assert.equal(impact.newTotalCents, 12000);
  assert.equal(impact.paidChanged, 1);
  // Só as duas abertas pesam no limite do cartão: 2 × R$ 5,00.
  assert.equal(impact.openDeltaCents, 1000);
});

test('valor em série: "esta e as próximas" não toca as anteriores; cancelada fica fora do total e a da fatura não muda', () => {
  const series = purchase({ 1: { invoicePaymentId: 9 }, 3: { status: 'cancelada' } });
  const following = seriesValueImpact(series, series[0]!, 'following', 40)!;
  // A editada (#1, ligada à fatura, vale 35) e a #2; a #3 cancelada não entra em nada.
  assert.equal(following.changedCount, 2);
  assert.equal(following.oldTotalCents, 7000);
  assert.equal(following.newTotalCents, 8000);
});

test('valor em série: sem mudança no valor ou fora do parcelado, não há aviso', () => {
  const series = purchase();
  assert.equal(seriesValueImpact(series, series[1]!, 'all', 35), null);
  assert.equal(seriesValueImpact(series, { ...series[1]!, parcelado: false }, 'all', 40), null);
});

test('valor em série: o texto avisa o total, as pagas e o limite do cartão só no crédito', () => {
  const series = purchase({ 1: { pago: true } });
  const impact = seriesValueImpact(series, series[1]!, 'all', 40)!;
  assert.deepEqual(seriesValueNotes(impact, { name: 'Nubank' }).map(plain), [
    '3 parcelas passam a valer R$ 40,00 cada: o total da compra vai de R$ 105,00 para R$ 120,00.',
    '1 parcela já paga também muda de valor, mas o valor pago dela continua.',
    'O limite usado do cartão Nubank sobe R$ 10,00.',
  ]);
  // Fora do crédito com cartão não há limite; valor menor desce.
  const lower = seriesValueImpact(purchase(), purchase()[1]!, 'following', 30)!;
  assert.deepEqual(seriesValueNotes(lower, null).map(plain), ['2 parcelas passam a valer R$ 30,00 cada: o total da compra vai de R$ 105,00 para R$ 95,00.']);
  assert.deepEqual(plain(seriesValueNotes(lower, { name: 'Nubank' }).at(-1)!), 'O limite usado do cartão Nubank desce R$ 10,00.');
});

test('à vista na edição: prévia do juros com todas abertas, com paga e com o valor novo da mesma edição', () => {
  const open = purchase();
  assert.deepEqual(cashPriceInterestPreview(open, open[1]!, 35, 9000), { totalCents: 10500, interestCents: 1500, openCount: 3, openInterestCents: 1500 });
  // A primeira paga guarda R$ 2,00 de juros: as duas abertas levam o resto.
  const withPaid = purchase({ 1: { pago: true, interest: 2 } });
  assert.deepEqual(cashPriceInterestPreview(withPaid, withPaid[1]!, 35, 9000), { totalCents: 10500, interestCents: 1500, openCount: 2, openInterestCents: 1300 });
  // Parcela de R$ 40,00 na mesma edição: total R$ 120,00 e R$ 30,00 de juros.
  assert.deepEqual(cashPriceInterestPreview(open, open[1]!, 40, 9000), { totalCents: 12000, interestCents: 3000, openCount: 3, openInterestCents: 3000 });
  // À vista maior que o total: sem juros.
  assert.equal(cashPriceInterestPreview(open, open[1]!, 35, 20000).interestCents, 0);
});

test('à vista na edição: o juros das abertas não passa do valor delas e a paga/da fatura não conta como aberta', () => {
  const series = purchase({ 1: { pago: true, interest: 30 }, 2: { invoicePaymentId: 5 } });
  const preview = cashPriceInterestPreview(series, series[2]!, 35, 1000);
  // Total R$ 105,00, à vista R$ 10,00: R$ 95,00 de juros, mas só a #3 está aberta e vale R$ 35,00.
  assert.equal(preview.openCount, 1);
  assert.equal(preview.openInterestCents, 3500);
});

test('à vista na edição: o texto da prévia', () => {
  const open = purchase();
  assert.equal(
    plain(cashPriceInterestNote(cashPriceInterestPreview(open, open[1]!, 35, 9000))),
    'Juros da compra: R$ 15,00 (16,7%). As 3 parcelas abertas ficam com R$ 15,00; as pagas e as da fatura não mudam.',
  );
  assert.equal(
    plain(cashPriceInterestNote(cashPriceInterestPreview(open, open[1]!, 35, 20000))),
    'Sem juros: o à vista é igual ou maior que o total (R$ 105,00). As 3 parcelas abertas ficam sem juros.',
  );
  const settled = purchase({ 1: { pago: true }, 2: { pago: true }, 3: { invoicePaymentId: 4 } });
  assert.equal(cashPriceInterestNote(cashPriceInterestPreview(settled, settled[1]!, 35, 9000)), 'Todas as parcelas estão pagas ou na fatura: o juros delas não muda.');
});
