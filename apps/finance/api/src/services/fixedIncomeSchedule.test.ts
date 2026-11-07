import assert from 'node:assert/strict';
import test from 'node:test';
import { competenceAfter, fixedIncomeRangeDates, planFixedIncomeEndChange } from './fixedIncomeSchedule';

test('intervalo mensal inclui o último mês e vira o ano', () => {
  const dates = fixedIncomeRangeDates('2026-11-10', '2027-02');
  assert.deepEqual(dates.map((item) => item.receiptDate), ['2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10']);
  assert.deepEqual(dates.map((item) => item.competence), ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
});

test('intervalo ancora no dia da referência: dia 29, 30 e 31 caem no último dia dos meses curtos', () => {
  assert.deepEqual(fixedIncomeRangeDates('2027-01-31', '2027-04').map((item) => item.receiptDate),
    ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(fixedIncomeRangeDates('2027-12-30', '2028-03').map((item) => item.receiptDate),
    ['2027-12-30', '2028-01-30', '2028-02-29', '2028-03-30']);
  assert.deepEqual(fixedIncomeRangeDates('2028-01-29', '2028-03').map((item) => item.receiptDate),
    ['2028-01-29', '2028-02-29', '2028-03-29']);
});

test('limite no próprio mês gera só a ocorrência atual; limite anterior ou longe demais não gera nada', () => {
  assert.deepEqual(fixedIncomeRangeDates('2026-11-10', '2026-11').map((item) => item.receiptDate), ['2026-11-10']);
  assert.deepEqual(fixedIncomeRangeDates('2026-11-10', '2026-10'), []);
  assert.deepEqual(fixedIncomeRangeDates('2026-11-10', '4000-01'), []);
});

test('mês seguinte vira o ano em dezembro', () => {
  assert.equal(competenceAfter('2026-10'), '2026-11-01');
  assert.equal(competenceAfter('2026-12'), '2027-01-01');
});

const base = { referenceDate: '2026-11-10', oldEnd: '2027-02', today: '2026-11-15' };

test('ampliar o limite cria só os meses depois do antigo, de hoje em diante', () => {
  const result = planFixedIncomeEndChange({ ...base, newEnd: '2027-04' });
  assert.ok('plan' in result);
  assert.deepEqual(result.plan.create.map((item) => item.receiptDate), ['2027-03-10', '2027-04-10']);
  assert.equal(result.plan.removeFromCompetence, null);
});

test('ampliar não cria mês que já passou (limite antigo no passado)', () => {
  const result = planFixedIncomeEndChange({ referenceDate: '2026-01-10', oldEnd: '2026-06', newEnd: '2026-12', today: '2026-11-15' });
  assert.ok('plan' in result);
  assert.deepEqual(result.plan.create.map((item) => item.receiptDate), ['2026-12-10']);
});

test('reduzir o limite tira as previstas a partir do mês seguinte ao novo limite', () => {
  const result = planFixedIncomeEndChange({ ...base, newEnd: '2026-12' });
  assert.ok('plan' in result);
  assert.deepEqual(result.plan.create, []);
  assert.equal(result.plan.removeFromCompetence, '2027-01-01');
});

test('reduzir até dezembro corta a partir de janeiro do ano seguinte', () => {
  const result = planFixedIncomeEndChange({ ...base, oldEnd: '2028-06', newEnd: '2026-12' });
  assert.ok('plan' in result);
  assert.equal(result.plan.removeFromCompetence, '2027-01-01');
});

test('mesmo limite não muda nada', () => {
  const result = planFixedIncomeEndChange({ ...base, newEnd: '2027-02' });
  assert.deepEqual(result, { plan: { create: [], removeFromCompetence: null } });
});

test('depois de reduzir, ampliar de novo planeja os meses que foram cortados', () => {
  const extended = planFixedIncomeEndChange({ ...base, oldEnd: '2026-12', newEnd: '2027-02' });
  assert.ok('plan' in extended);
  assert.deepEqual(extended.plan.create.map((item) => item.competence), ['2027-01-01', '2027-02-01']);
});

test('limite anterior ao primeiro mês é recusado', () => {
  const result = planFixedIncomeEndChange({ ...base, newEnd: '2026-10' });
  assert.ok('refusal' in result);
});

test('ampliar mais de 36 meses por vez é recusado, e 36 é aceito', () => {
  assert.ok('refusal' in planFixedIncomeEndChange({ ...base, newEnd: '2030-03' }));
  const limit = planFixedIncomeEndChange({ ...base, newEnd: '2030-02' });
  assert.ok('plan' in limit);
  assert.equal(limit.plan.create.length, 36);
});
