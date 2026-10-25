import assert from 'node:assert/strict';
import test from 'node:test';
import {
  embeddedInstallmentInterests, recalculatedInstallmentInterests, splitCents, splitInstallments, splitInterestWithinInstallments,
} from './installmentSplit';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

test('partes iguais com a diferença de centavos na última', () => {
  assert.deepEqual(splitCents(100000, 3), [33333, 33333, 33334]);
  assert.deepEqual(splitCents(120000, 12), Array.from({ length: 12 }, () => 10000));
  assert.deepEqual(splitInstallments(1000, 3), [333.33, 333.33, 333.34]);
  assert.deepEqual(splitInstallments(1200, 1), [1200]);
  assert.deepEqual(splitInstallments(0.03, 3), [0.01, 0.01, 0.01]);
});

test('juros por parcela: por igual, resto na última', () => {
  assert.deepEqual(splitInterestWithinInstallments(200000, Array.from({ length: 12 }, () => 100000)).slice(-2), [16666, 16674]);
  assert.deepEqual(splitInterestWithinInstallments(1000, [50000, 50000, 50000]), [333, 333, 334]);
});

test('juros por parcela nunca passa do valor da parcela e a soma se mantém', () => {
  // A última parcela é pequena: o que não cabe nela vai para as anteriores.
  const fitted = splitInterestWithinInstallments(900, [1000, 1000, 100]);
  assert.deepEqual(fitted, [300, 500, 100]);
  assert.equal(sum(fitted), 900);

  // A primeira é pequena: o que não cabe nela vai para as seguintes.
  const reversed = splitInterestWithinInstallments(900, [100, 1000, 1000]);
  assert.deepEqual(reversed, [100, 500, 300]);
  assert.equal(sum(reversed), 900);
});

test('juros embutido: soma das parcelas menos o valor à vista, por igual entre as parcelas', () => {
  const amounts = Array.from({ length: 12 }, () => 100000);
  const interests = embeddedInstallmentInterests(amounts, 1000000);
  assert.equal(sum(interests), 200000);
  assert.deepEqual(interests.slice(0, 11), Array.from({ length: 11 }, () => 16666));
  assert.equal(interests[11], 16674);
});

test('juros embutido segue as parcelas ajustadas à mão', () => {
  const interests = embeddedInstallmentInterests([33333, 33333, 33334], 90000);
  assert.equal(sum(interests), 10000);
  assert.deepEqual(interests, [3333, 3333, 3334]);
});

test('sem valor à vista, ou à vista igual ou maior que a soma, não há juros', () => {
  const amounts = [50000, 50000];
  assert.deepEqual(embeddedInstallmentInterests(amounts, null), [0, 0]);
  assert.deepEqual(embeddedInstallmentInterests(amounts, 100000), [0, 0]);
  assert.deepEqual(embeddedInstallmentInterests(amounts, 120000), [0, 0]);
});

const parcel = (id: number, amountCents: number, interestCents = 0, fixed = false) => ({ id, amountCents, interestCents, fixed });

test('à vista informado depois: o juros total é dividido entre as parcelas abertas', () => {
  // 3 × R$ 35,00 com à vista de R$ 90,00: R$ 15,00 de juros, R$ 5,00 em cada.
  const interests = recalculatedInstallmentInterests([parcel(1, 3500), parcel(2, 3500), parcel(3, 3500)], 9000);
  assert.deepEqual([...interests], [[1, 500], [2, 500], [3, 500]]);
});

test('à vista informado depois: a parcela paga ou da fatura mantém o juros e as abertas levam só o resto', () => {
  // Total R$ 15,00; a paga já guarda R$ 2,00 e a da fatura R$ 1,00: sobram R$ 12,00 para as duas abertas.
  const interests = recalculatedInstallmentInterests(
    [parcel(1, 3500, 200, true), parcel(2, 3500, 100, true), parcel(3, 3500), parcel(4, 3500)],
    12500,
  );
  assert.deepEqual([...interests], [[3, 600], [4, 600]]);
});

test('à vista informado depois: à vista igual ou maior que a soma zera o juros das abertas, e as fixas não mudam', () => {
  const rows = [parcel(1, 3500, 500, true), parcel(2, 3500, 500), parcel(3, 3500, 500)];
  assert.deepEqual([...recalculatedInstallmentInterests(rows, 10500)], [[2, 0], [3, 0]]);
  assert.deepEqual([...recalculatedInstallmentInterests(rows, 20000)], [[2, 0], [3, 0]]);
});

test('à vista informado depois: o juros das abertas nunca passa do valor delas e a soma fecha com o que coube', () => {
  // Total de R$ 105,00 e à vista de R$ 50,00: R$ 55,00 de juros. A fixa já guarda R$ 30,00, restam R$ 25,00,
  // mas a aberta só vale R$ 5,00: leva R$ 5,00 e o resto do passado não se refaz.
  const interests = recalculatedInstallmentInterests([parcel(1, 10000, 3000, true), parcel(2, 500)], 5000);
  assert.deepEqual([...interests], [[2, 500]]);
  // Resto de centavos na última das abertas, como no cadastro.
  const split = recalculatedInstallmentInterests([parcel(1, 10000), parcel(2, 10000), parcel(3, 10000)], 29999);
  assert.equal([...split.values()].reduce((sum, cents) => sum + cents, 0), 1);
  assert.deepEqual([...split.values()], [0, 0, 1]);
});

test('à vista informado depois: sem parcela aberta não há o que refazer', () => {
  assert.equal(recalculatedInstallmentInterests([parcel(1, 3500, 500, true)], 3000).size, 0);
});
