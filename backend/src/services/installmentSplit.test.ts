import assert from 'node:assert/strict';
import test from 'node:test';
import {
  embeddedInstallmentInterests, splitCents, splitInstallments, splitInterestWithinInstallments,
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
