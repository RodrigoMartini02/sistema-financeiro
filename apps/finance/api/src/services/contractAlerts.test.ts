import assert from 'node:assert/strict';
import test from 'node:test';
import { isExpiringSoon, isOverdueIncome } from './contractAlerts';

const TODAY = '2026-10-04';

test('contrato vencendo: data final em até 60 dias, ou já passada, com o contrato ativo', () => {
  assert.equal(isExpiringSoon('ativo', '2026-12-03', TODAY), true);
  assert.equal(isExpiringSoon('ativo', '2026-12-04', TODAY), false);
  assert.equal(isExpiringSoon('ativo', '2026-09-30', TODAY), true);
  assert.equal(isExpiringSoon('ativo', null, TODAY), false);
  assert.equal(isExpiringSoon('encerrado', '2026-10-20', TODAY), false);
});

test('receita atrasada: prevista ou faturada com vencimento antes de hoje', () => {
  assert.equal(isOverdueIncome('prevista', '2026-10-03', TODAY), true);
  assert.equal(isOverdueIncome('faturada', '2026-09-10', TODAY), true);
  assert.equal(isOverdueIncome('prevista', TODAY, TODAY), false);
  assert.equal(isOverdueIncome('ativa', '2026-09-10', TODAY), false);
  assert.equal(isOverdueIncome('cancelada', '2026-09-10', TODAY), false);
});
