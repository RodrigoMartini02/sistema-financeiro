import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Expense } from '../types/finance';
import {
  canBecomeInstallments, installmentCountNotes, minimumInstallmentCount, previewInstallmentCount, previewSingleInstallments,
  reductionBlock, singleInstallmentsNotes, singleSplitBlock,
} from './installmentCount';

/** Parcela da compra de 5 parcelas de R$ 50,00 (grupo 100), vencendo todo dia 10 a partir de janeiro de 2026. */
function row(number: number, overrides: Partial<Expense> = {}): Expense {
  return {
    id: 100 + number, descricao: 'Notebook', valorFinal: 50, valorOriginal: 50, categoria: 'Geral', formaPagamento: 'pix',
    dataVencimento: `2026-${String(number).padStart(2, '0')}-10`, mes: number - 1, ano: 2026, status: 'ativa', pago: false,
    recorrente: false, parcelado: true, parcelaAtual: number, totalParcelas: 5, grupoParcelamentoId: 101, ...overrides,
  };
}

const FIVE = [row(1), row(2), row(3), row(4), row(5)];
const plain = (text: string) => text.replace(/ /g, ' ');

describe('previewInstallmentCount: aumentar', () => {
  test('de 5 para 7: duas parcelas novas (6 e 7) e o total sobe R$ 100,00', () => {
    const preview = previewInstallmentCount(FIVE, FIVE[1]!, 7, 50);
    assert.deepEqual(preview, {
      kind: 'create', currentCount: 5, nextCount: 7, numbers: [6, 7], newTotalCents: 35000, openDeltaCents: 10000,
      deletedInterestCents: 0, hasInterest: false,
    });
  });

  test('o valor novo da edição vale para as parcelas abertas do alcance e para as novas', () => {
    const preview = previewInstallmentCount(FIVE, FIVE[1]!, 6, 60);
    // 5 parcelas de R$ 60,00 + 1 nova de R$ 60,00 = R$ 360,00; as abertas passam de R$ 250,00 para R$ 360,00.
    assert.equal(preview!.newTotalCents, 36000);
    assert.equal(preview!.openDeltaCents, 11000);
  });

  test('a parcela paga entra no total com o valor novo, mas não no limite do cartão', () => {
    const series = [row(1, { pago: true }), ...FIVE.slice(1)];
    const preview = previewInstallmentCount(series, series[1]!, 6, 60);
    assert.equal(preview!.newTotalCents, 36000);
    // Abertas depois: 4 de R$ 60,00 + 1 nova = R$ 300,00; antes: 4 de R$ 50,00 = R$ 200,00.
    assert.equal(preview!.openDeltaCents, 10000);
  });

  test('parcela cancelada não conta no total', () => {
    const series = [...FIVE.slice(0, 4), row(5, { status: 'cancelada' })];
    assert.equal(previewInstallmentCount(series, series[0]!, 6, 50)!.newTotalCents, 25000);
  });

  test('o juros guardado nas parcelas liga o aviso do "À vista"', () => {
    const series = [row(1, { interest: 5 }), ...FIVE.slice(1)];
    assert.equal(previewInstallmentCount(series, series[1]!, 6, 50)!.hasInterest, true);
  });
});

describe('previewInstallmentCount: reduzir', () => {
  test('de 5 para 3: apaga 4 e 5 (abertas) e o total desce R$ 100,00', () => {
    const preview = previewInstallmentCount(FIVE, FIVE[1]!, 3, 50);
    assert.deepEqual(preview, {
      kind: 'delete', currentCount: 5, nextCount: 3, numbers: [4, 5], newTotalCents: 15000, openDeltaCents: -10000,
      deletedInterestCents: 0, hasInterest: false,
    });
  });

  test('o juros das parcelas apagadas sai junto', () => {
    const series = [...FIVE.slice(0, 3), row(4, { interest: 2.5 }), row(5, { interest: 2.5 })];
    assert.equal(previewInstallmentCount(series, series[0]!, 3, 50)!.deletedInterestCents, 500);
  });

  test('parcela paga na cauda: não há prévia (abaixo do mínimo)', () => {
    const series = [...FIVE.slice(0, 3), row(4, { pago: true }), row(5)];
    assert.equal(previewInstallmentCount(series, series[0]!, 3, 50), null);
  });

  test('o mesmo nº, fora de 2 a 360 ou sem número inteiro: sem prévia', () => {
    for (const next of [5, 1, 361, 3.5]) assert.equal(previewInstallmentCount(FIVE, FIVE[1]!, next, 50), null);
  });
});

describe('mínimo e motivo da redução', () => {
  test('sem parcela paga, o mínimo é a posição da parcela editada', () => {
    assert.equal(minimumInstallmentCount(FIVE, FIVE[2]!), 3);
    assert.deepEqual(reductionBlock(FIVE, FIVE[2]!), { minimum: 3, reason: 'é a que você está editando' });
  });

  test('parcela paga mais alta que a editada define o mínimo', () => {
    const series = [FIVE[0]!, FIVE[1]!, FIVE[2]!, row(4, { pago: true }), FIVE[4]!];
    assert.deepEqual(reductionBlock(series, series[0]!), { minimum: 4, reason: 'já foi paga' });
    assert.equal(minimumInstallmentCount(series, series[0]!), 4);
  });

  test('parcela na fatura do cartão tem o motivo da fatura', () => {
    const series = [FIVE[0]!, FIVE[1]!, row(3, { pago: true, invoicePaymentId: 9 }), FIVE[3]!, FIVE[4]!];
    assert.deepEqual(reductionBlock(series, series[0]!), { minimum: 3, reason: 'está numa fatura do cartão' });
  });

  test('o mínimo nunca é menor que 2', () => {
    assert.equal(minimumInstallmentCount([row(1), row(2)], row(1)), 2);
  });

  test('parcela de outra compra e a gerada pela fatura não entram', () => {
    const series = [...FIVE, row(5, { id: 900, grupoParcelamentoId: 555, pago: true }), row(5, { id: 901, invoiceOriginPaymentId: 7, pago: true })];
    assert.equal(minimumInstallmentCount(series, series[0]!), 2);
  });
});

describe('avisos', () => {
  test('aumentar: as parcelas criadas, o total, o juros e o limite do cartão', () => {
    const series = [row(1, { interest: 5 }), ...FIVE.slice(1)];
    const preview = previewInstallmentCount(series, series[1]!, 7, 50)!;
    assert.deepEqual(installmentCountNotes(preview, 50, { name: 'Nubank' }).map(plain), [
      'Cria as parcelas 6/7 e 7/7, de R$ 50,00 cada, em aberto e sem juros.',
      'As parcelas novas não têm juros: informe o "À vista" abaixo para refazer o juros da compra.',
      'Com o novo nº de parcelas, o total da compra fica em R$ 350,00.',
      'O limite usado do cartão Nubank sobe R$ 100,00.',
    ]);
  });

  test('uma parcela só e sem cartão: sem a linha do limite', () => {
    const preview = previewInstallmentCount(FIVE, FIVE[1]!, 6, 50)!;
    assert.deepEqual(installmentCountNotes(preview, 50, null).map(plain), [
      'Cria a parcela 6/6, de R$ 50,00 cada, em aberto e sem juros.',
      'Com o novo nº de parcelas, o total da compra fica em R$ 300,00.',
    ]);
  });

  test('reduzir: as parcelas apagadas com o rótulo de hoje, o juros delas e a volta atrás', () => {
    const series = [...FIVE.slice(0, 3), row(4, { interest: 2.5 }), row(5, { interest: 2.5 })];
    const preview = previewInstallmentCount(series, series[0]!, 3, 50)!;
    assert.deepEqual(installmentCountNotes(preview, 50, { name: 'Nubank' }).map(plain), [
      'Apaga as parcelas 4/5 e 5/5, em aberto. O juros delas (R$ 5,00) sai junto. Para voltar atrás, aumente o nº de parcelas: elas voltam sem anexos e sem juros.',
      'Com o novo nº de parcelas, o total da compra fica em R$ 150,00.',
      'O limite usado do cartão Nubank desce R$ 100,00.',
    ]);
  });

  test('mais de duas parcelas apagadas: de 3/6 a 6/6', () => {
    const six = Array.from({ length: 6 }, (_, index) => row(index + 1, { totalParcelas: 6 }));
    const preview = previewInstallmentCount(six, six[0]!, 2, 50)!;
    assert.match(plain(installmentCountNotes(preview, 50, null)[0]!), /^Apaga as parcelas 3\/6 a 6\/6, em aberto\./);
  });
});

describe('despesa única que vira parcelada', () => {
  test('a prévia por parcela: a última vence N - 1 meses depois e o total é o valor vezes N', () => {
    assert.deepEqual(previewSingleInstallments('2026-01-31', 3, 100), {
      count: 3, mode: 'perInstallment', lastDueDate: '2026-03-31', amountsCents: [10000, 10000, 10000], newTotalCents: 30000,
    });
    assert.equal(previewSingleInstallments('2026-01-31', 1, 100), null);
    assert.equal(previewSingleInstallments('2026-01-31', 361, 100), null);
  });

  test('a prévia do total divide o valor com o resto na última e a compra não cresce', () => {
    assert.deepEqual(previewSingleInstallments('2026-10-31', 3, 100, 'total'), {
      count: 3, mode: 'total', lastDueDate: '2026-12-31', amountsCents: [3333, 3333, 3334], newTotalCents: 10000,
    });
    // Centavos que sobram em número qualquer de parcelas: a soma é sempre o valor.
    for (const [amount, count] of [[0.07, 7], [1234.56, 13], [99.99, 360], [100, 7]] as const) {
      const preview = previewSingleInstallments('2026-10-10', count, amount, 'total')!;
      assert.equal(preview.amountsCents.length, count);
      assert.equal(preview.newTotalCents, Math.round(amount * 100));
      assert.equal(preview.amountsCents.reduce((sum, cents) => sum + cents, 0), Math.round(amount * 100));
    }
  });

  test('o total que não dá R$ 0,01 por parcela não tem prévia (o servidor recusa)', () => {
    assert.equal(previewSingleInstallments('2026-10-10', 3, 0.02, 'total'), null);
    assert.notEqual(previewSingleInstallments('2026-10-10', 3, 0.03, 'total'), null);
    assert.equal(previewSingleInstallments('2026-10-10', 2, 0, 'total'), null);
  });

  test('o aviso por parcela diz a parcela 1, as criadas, a última data, o total e o limite do cartão', () => {
    const preview = previewSingleInstallments('2026-10-31', 3, 100)!;
    assert.deepEqual(singleInstallmentsNotes(preview, { name: 'Nubank' }).map(plain), [
      'A despesa vira a parcela 1/3 e as parcelas 2 a 3 são criadas, de R$ 100,00 cada, uma por mês, até 31/12/2026. O total da compra passa a ser R$ 300,00.',
      'O limite usado do cartão Nubank sobe R$ 200,00.',
    ]);
    const two = previewSingleInstallments('2026-10-31', 2, 100)!;
    assert.match(plain(singleInstallmentsNotes(two, null)[0]!), /^A despesa vira a parcela 1\/2 e a parcela 2 é criada,/);
  });

  test('o aviso da paga: o valor é dividido, a compra não cresce e o pagamento fica na data original', () => {
    const preview = previewSingleInstallments('2026-10-31', 3, 100, 'total')!;
    assert.deepEqual(singleInstallmentsNotes(preview, null, { paidCents: 10500, paymentDate: '2026-10-10' }).map(plain), [
      'A despesa de R$ 100,00 é dividida em 3 parcelas de R$ 33,33 cada, a última de R$ 33,34, uma por mês, até 31/12/2026: ela vira a parcela 1/3 e as parcelas 2 a 3 são criadas. O total da compra continua R$ 100,00.',
      'O pagamento de R$ 105,00 é dividido entre as parcelas, todas pagas em 10/10/2026: o caixa não passa para os meses seguintes.',
    ]);
  });

  test('o aviso da paga com divisão exata não cita a última e a de duas parcelas fala no singular', () => {
    const even = previewSingleInstallments('2026-10-10', 3, 90, 'total')!;
    assert.match(plain(singleInstallmentsNotes(even, null)[0]!), /^A despesa de R\$ 90,00 é dividida em 3 parcelas de R\$ 30,00 cada, uma por mês,/);
    const two = previewSingleInstallments('2026-10-10', 2, 50, 'total')!;
    assert.match(plain(singleInstallmentsNotes(two, null)[0]!), /ela vira a parcela 1\/2 e a parcela 2 é criada\./);
  });

  test('o total não sobe o limite do cartão', () => {
    const preview = previewSingleInstallments('2026-10-10', 3, 100, 'total')!;
    assert.equal(singleInstallmentsNotes(preview, { name: 'Nubank' }).some((note) => note.includes('limite')), false);
  });

  const single = {
    parcelado: false, recorrente: false, pago: false, status: 'ativa' as const, invoicePaymentId: null, invoiceOriginPaymentId: null,
    grupoParcelamentoId: null, formaPagamento: 'pix', cartaoId: null,
  };

  test('a despesa única, em aberto ou paga, sem fatura nem grupo, pode virar parcelada', () => {
    assert.equal(canBecomeInstallments(single), true);
    assert.equal(canBecomeInstallments({ ...single, pago: true }), true);
    for (const patch of [
      { parcelado: true }, { recorrente: true }, { status: 'cancelada' as const },
      { invoicePaymentId: 3 }, { invoiceOriginPaymentId: 3 }, { grupoParcelamentoId: 3 },
    ]) {
      assert.equal(canBecomeInstallments({ ...single, ...patch }), false);
      assert.equal(canBecomeInstallments({ ...single, ...patch, pago: true }), false);
    }
  });

  test('mudar o pagamento na mesma edição trava o parcelamento até salvar; mudar só a data ou o valor pago não', () => {
    const message = 'Salve a mudança do pagamento antes de parcelar a despesa.';
    assert.equal(singleSplitBlock({ pago: false }, { paid: true }), message);
    assert.equal(singleSplitBlock({ pago: true }, { paid: false }), message);
    assert.equal(singleSplitBlock({ pago: true }, { paid: true }), null);
    assert.equal(singleSplitBlock({ pago: false }, { paid: false }), null);
  });

  test('no crédito com cartão só a despesa em aberto vira parcelada: a paga é paga pela fatura', () => {
    const credit = { ...single, formaPagamento: 'credito', cartaoId: 7 };
    assert.equal(canBecomeInstallments(credit), true);
    assert.equal(canBecomeInstallments({ ...credit, pago: true }), false);
    // Crédito sem cartão não passa pela fatura.
    assert.equal(canBecomeInstallments({ ...credit, cartaoId: null, pago: true }), true);
  });
});
