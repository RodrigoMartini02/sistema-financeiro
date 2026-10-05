import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMonths, buildContractSchedule, dateInMonth, lastMonthlyCompetence, scheduledIncomeDescription, splitInstallments,
  type ContractScheduleTerms,
} from './contractSchedule';

const terms = (overrides: Partial<ContractScheduleTerms> = {}): ContractScheduleTerms => ({
  startDate: '2027-01-01',
  endDate: '2027-12-31',
  dueDay: 10,
  monthlyFee: 4500,
  setupFee: null,
  projectFee: null,
  ...overrides,
});

const TODAY = '2026-10-04';

test('mensalidade de janeiro a dezembro com vencimento no dia 10: 12 previstas no dia 10', () => {
  const schedule = buildContractSchedule(terms(), TODAY);
  assert.equal(schedule.length, 12);
  assert.deepEqual(schedule.map((item) => item.dueDate), [
    '2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10', '2027-05-10', '2027-06-10',
    '2027-07-10', '2027-08-10', '2027-09-10', '2027-10-10', '2027-11-10', '2027-12-10',
  ]);
  assert.ok(schedule.every((item) => item.amount === 4500 && item.chargeKind === 'mensalidade' && item.installment === null));
  assert.equal(schedule[0]!.competence, '2027-01-01');
});

test('sem prazo: 12 mensalidades a partir do mês atual, ou do início quando ainda não começou', () => {
  assert.equal(lastMonthlyCompetence('2026-03-01', null, TODAY), '2027-09-01');
  assert.equal(lastMonthlyCompetence('2027-01-01', null, TODAY), '2027-12-01');
  assert.equal(lastMonthlyCompetence('2026-03-01', '2026-11-20', TODAY), '2026-11-01');

  const future = buildContractSchedule(terms({ endDate: null }), TODAY);
  assert.equal(future.length, 12);
  assert.equal(future[11]!.dueDate, '2027-12-10');

  // Começou em março: gera a vigência desde o início, até 12 meses à frente do mês atual.
  const started = buildContractSchedule(terms({ startDate: '2026-03-01', endDate: null }), TODAY);
  assert.equal(started[0]!.competence, '2026-03-01');
  assert.equal(started.at(-1)!.competence, '2027-09-01');
  assert.equal(started.filter((item) => item.competence >= '2026-10-01').length, 12);
});

test('complemento do sem prazo: gera só depois do último mês existente', () => {
  const schedule = buildContractSchedule(terms({ startDate: '2026-03-01', endDate: null }), '2026-11-02', {
    mensalidade: { fromCompetence: '2027-10-01', locked: new Set() },
  });
  assert.deepEqual(schedule.map((item) => item.competence), ['2027-10-01']);
});

test('implantação de R$ 1.000,00 em 3: 333,33 / 333,33 / 333,34, a primeira na data informada', () => {
  assert.deepEqual(splitInstallments(1000, 3), [333.33, 333.33, 333.34]);
  assert.deepEqual(splitInstallments(1200, 1), [1200]);
  assert.deepEqual(splitInstallments(0.03, 3), [0.01, 0.01, 0.01]);

  const schedule = buildContractSchedule(terms({
    monthlyFee: null,
    setupFee: { amount: 1000, installments: 3, firstDate: '2027-01-15' },
  }), TODAY);
  assert.deepEqual(schedule.map((item) => [item.dueDate, item.amount, item.installment, item.installments]), [
    ['2027-01-15', 333.33, 1, 3],
    ['2027-02-15', 333.33, 2, 3],
    ['2027-03-15', 333.34, 3, 3],
  ]);
  assert.ok(schedule.every((item) => item.chargeKind === 'implantacao'));
});

test('parcela no dia 31 vira o último dia dos meses curtos, inclusive em ano bissexto', () => {
  const schedule = buildContractSchedule(terms({
    monthlyFee: null,
    projectFee: { amount: 300, installments: 3, firstDate: '2028-01-31' },
  }), TODAY);
  assert.deepEqual(schedule.map((item) => item.dueDate), ['2028-01-31', '2028-02-29', '2028-03-31']);
  assert.equal(dateInMonth('2027-02-01', 31), '2027-02-28');
  assert.equal(dateInMonth('2027-04-01', 31), '2027-04-30');
});

test('vencimento no dia 28 cai no dia 28 de fevereiro', () => {
  const schedule = buildContractSchedule(terms({ dueDay: 28, startDate: '2027-02-01', endDate: '2028-02-29' }), TODAY);
  const february = schedule.filter((item) => item.competence.slice(5, 7) === '02');
  assert.deepEqual(february.map((item) => item.dueDate), ['2027-02-28', '2028-02-28']);
});

test('meses travados e meses antes da competência inicial não são gerados', () => {
  const schedule = buildContractSchedule(terms(), TODAY, {
    mensalidade: { fromCompetence: '2027-03-01', locked: new Set(['2027-05-01', '2027-06-01']) },
  });
  assert.deepEqual(schedule.map((item) => item.competence.slice(5, 7)), ['03', '04', '07', '08', '09', '10', '11', '12']);

  const installments = buildContractSchedule(terms({
    monthlyFee: null,
    setupFee: { amount: 1000, installments: 3, firstDate: '2027-01-15' },
  }), TODAY, { implantacao: { fromCompetence: null, locked: new Set(['2027-01-01']) } });
  assert.deepEqual(installments.map((item) => [item.installment, item.amount]), [[2, 333.33], [3, 333.34]]);
});

test('aditivo a partir de fevereiro, com janeiro e fevereiro recebidos no anterior, gera a partir de março', () => {
  const schedule = buildContractSchedule(terms({ startDate: '2027-02-01' }), TODAY, {
    mensalidade: { fromCompetence: '2027-02-01', locked: new Set(['2027-01-01', '2027-02-01']) },
  });
  assert.equal(schedule[0]!.competence, '2027-03-01');
  assert.equal(schedule.length, 10);
});

test('cobranças juntas saem em ordem de vencimento; cada uma respeita o próprio estado', () => {
  const schedule = buildContractSchedule(terms({
    endDate: '2027-03-31',
    setupFee: { amount: 900, installments: 2, firstDate: '2027-01-05' },
    projectFee: { amount: 500, installments: 1, firstDate: '2027-01-10' },
  }), TODAY, { projeto: { fromCompetence: '2027-02-01', locked: new Set() } });
  assert.deepEqual(schedule.map((item) => [item.dueDate, item.chargeKind]), [
    ['2027-01-05', 'implantacao'],
    ['2027-01-10', 'mensalidade'],
    ['2027-02-05', 'implantacao'],
    ['2027-02-10', 'mensalidade'],
    ['2027-03-10', 'mensalidade'],
  ]);
});

test('meses somados atravessam o ano', () => {
  assert.equal(addMonths('2027-12-01', 1), '2028-01-01');
  assert.equal(addMonths('2027-01-01', 13), '2028-02-01');
  assert.equal(addMonths('2027-03-01', -3), '2026-12-01');
});

test('descrição da receita: cobrança, parcela e nome do cliente', () => {
  assert.equal(scheduledIncomeDescription({ chargeKind: 'mensalidade', installment: null, installments: null }, 'Acme'), 'Mensalidade - Acme');
  assert.equal(scheduledIncomeDescription({ chargeKind: 'implantacao', installment: 1, installments: 3 }, 'Acme'), 'Implantação 1/3 - Acme');
  assert.equal(scheduledIncomeDescription({ chargeKind: 'projeto', installment: 2, installments: 5 }, 'Acme'), 'Projeto 2/5 - Acme');
  assert.equal(scheduledIncomeDescription({ chargeKind: 'mensalidade', installment: null, installments: null }, 'A'.repeat(300)).length, 255);
});
