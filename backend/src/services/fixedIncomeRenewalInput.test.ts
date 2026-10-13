import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readFixedIncomeRenewalDecisions } from './fixedIncomeRenewalInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('renovação da fixa: lê as decisões, e a fixa repetida vale a última', () => {
  assert.deepEqual(
    readFixedIncomeRenewalDecisions({ decisions: [{ fixedId: 3, renew: true }, { fixedId: 4, renew: false }, { fixedId: 3, renew: false }] }),
    [{ fixedId: 3, renew: false }, { fixedId: 4, renew: false }],
  );
});

test('renovação da fixa: recusa pedido vazio, acima de 100 e tipos errados', () => {
  assertRejects(() => readFixedIncomeRenewalDecisions('texto'), 'Pedido inválido');
  assertRejects(() => readFixedIncomeRenewalDecisions({ decisions: [] }), 'Informe de 1 a 100 decisões');
  assertRejects(
    () => readFixedIncomeRenewalDecisions({ decisions: Array.from({ length: 101 }, (_, index) => ({ fixedId: index + 1, renew: true })) }),
    'Informe de 1 a 100 decisões',
  );
  assertRejects(() => readFixedIncomeRenewalDecisions({ decisions: ['x'] }), 'Decisão inválida');
  assertRejects(() => readFixedIncomeRenewalDecisions({ decisions: [{ fixedId: '3', renew: true }] }), 'Receita fixa inválida');
  assertRejects(() => readFixedIncomeRenewalDecisions({ decisions: [{ renew: true }] }), 'Receita fixa inválida');
  assertRejects(() => readFixedIncomeRenewalDecisions({ decisions: [{ fixedId: 3, renew: 'sim' }] }), 'Informe se a receita fixa continua');
});
