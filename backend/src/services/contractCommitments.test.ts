import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMITMENT_WARNING, commitmentBalances, commitmentWarning, commitmentYear } from './contractCommitments';

test('saldo do ano: empenhado menos o bruto faturado ou recebido naquele ano', () => {
  const balances = commitmentBalances(
    [
      { year: 2028, number: '2028NE0001', amount: 60000 },
      { year: 2027, number: '2027NE0042', amount: 54000 },
    ],
    new Map([[2027, 13500.1]]),
  );
  assert.deepEqual(balances, [
    { year: 2027, number: '2027NE0042', amount: 54000, used: 13500.1, balance: 40499.9 },
    { year: 2028, number: '2028NE0001', amount: 60000, used: 0, balance: 60000 },
  ]);
});

test('faturado além do empenho deixa o saldo negativo', () => {
  const [balance] = commitmentBalances([{ year: 2027, number: 'A', amount: 1000 }], new Map([[2027, 1200.5]]));
  assert.equal(balance!.balance, -200.5);
});

test('aviso ao faturar sem empenho no ano ou acima do saldo; dentro do saldo, sem aviso', () => {
  assert.equal(commitmentWarning(null, 0, 4500), COMMITMENT_WARNING);
  assert.equal(commitmentWarning({ amount: 54000 }, 49500, 4500), null);
  assert.equal(commitmentWarning({ amount: 54000 }, 49500.01, 4500), COMMITMENT_WARNING);
  assert.equal(COMMITMENT_WARNING, 'Empenho sem saldo suficiente');
});

test('o ano da receita é o da competência ou, sem ela, o da data', () => {
  assert.equal(commitmentYear('2027-12-01', '2028-01-10'), 2027);
  assert.equal(commitmentYear(null, '2028-01-10'), 2028);
});
