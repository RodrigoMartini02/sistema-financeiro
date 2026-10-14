import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyJobSteps, planLifecycleUrl } from './dailyJobSteps';

const WEEKDAY_STEPS = [
  'plan-lifecycle',
  'tenders-sweep',
  'tenders-deadline-reminders',
  'tenders-contracts-daily',
  'tenders-contracts-cleanup',
  'tenders-contracts-backfill',
];
const SUNDAY_STEPS = [
  'plan-lifecycle',
  'tenders-sweep',
  'tenders-deadline-reminders',
  'tenders-contracts-daily',
  'tenders-contracts-cleanup',
  'tenders-cleanup',
  'tenders-contracts-backfill',
];

test('rotina diária: dia útil roda planos, varredura, lembretes, contratos e, por último, a carga de contratos', () => {
  // Quarta-feira, 06:00 em Brasília (09:00 UTC, o horário do Cron Job).
  assert.deepEqual(dailyJobSteps(new Date('2026-10-07T09:00:00Z')), WEEKDAY_STEPS);
});

test('rotina diária: domingo em Brasília acrescenta a limpeza de editais, antes da carga de contratos', () => {
  assert.deepEqual(dailyJobSteps(new Date('2026-10-11T09:00:00Z')), SUNDAY_STEPS);
});

test('rotina diária: a carga de contratos é sempre a última etapa', () => {
  for (const instant of ['2026-10-07T09:00:00Z', '2026-10-11T09:00:00Z']) {
    assert.equal(dailyJobSteps(new Date(instant)).at(-1), 'tenders-contracts-backfill');
  }
});

test('rotina diária: vale o dia de Brasília, não o de UTC', () => {
  // Sábado 23:00 em Brasília já é domingo em UTC: sem limpeza.
  assert.deepEqual(dailyJobSteps(new Date('2026-10-11T02:00:00Z')), WEEKDAY_STEPS);
  // Domingo 22:00 em Brasília já é segunda em UTC: com limpeza.
  assert.deepEqual(dailyJobSteps(new Date('2026-10-12T01:00:00Z')), SUNDAY_STEPS);
});

test('rotina de planos: sem BACKEND_URL usa o backend de produção', () => {
  const expected = 'https://sistema-financeiro-backend-o199.onrender.com/api/internal-jobs/plan-lifecycle';
  assert.equal(planLifecycleUrl(undefined), expected);
  assert.equal(planLifecycleUrl('  '), expected);
});

test('rotina de planos: BACKEND_URL com ou sem barra no fim', () => {
  assert.equal(planLifecycleUrl('http://localhost:3010'), 'http://localhost:3010/api/internal-jobs/plan-lifecycle');
  assert.equal(planLifecycleUrl('http://localhost:3010/'), 'http://localhost:3010/api/internal-jobs/plan-lifecycle');
});

test('rotina de planos: BACKEND_URL inválida dá erro claro', () => {
  assert.throws(() => planLifecycleUrl('localhost:3010'), /BACKEND_URL inválida/);
  assert.throws(() => planLifecycleUrl('ftp://exemplo.com'), /BACKEND_URL inválida/);
});
