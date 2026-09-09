import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertValidRange,
  currentMonthRange,
  DateRangeError,
  describeRange,
  resolveDateRange,
} from './assistantDateRange';

// Terca-feira, para as contas de semana ficarem verificaveis a olho.
const HOJE = '2026-09-08';

test('resolve hoje e ontem', () => {
  assert.deepEqual(resolveDateRange('quanto gastei hoje?', HOJE), {
    inicio: '2026-09-08', fim: '2026-09-08', label: 'hoje',
  });
  assert.deepEqual(resolveDateRange('o que paguei ontem?', HOJE), {
    inicio: '2026-09-07', fim: '2026-09-07', label: 'ontem',
  });
});

test('resolve mes corrente e mes passado', () => {
  const esteMes = resolveDateRange('qual meu saldo esse mes?', HOJE);
  assert.equal(esteMes?.inicio, '2026-09-01');
  assert.equal(esteMes?.fim, '2026-09-30');

  const mesPassado = resolveDateRange('gastei mais que mes passado?', HOJE);
  assert.equal(mesPassado?.inicio, '2026-08-01');
  assert.equal(mesPassado?.fim, '2026-08-31');
});

test('semana vai de segunda a domingo', () => {
  const semana = resolveDateRange('o que vence essa semana?', HOJE);
  assert.equal(semana?.inicio, '2026-09-07');
  assert.equal(semana?.fim, '2026-09-13');

  const passada = resolveDateRange('quanto gastei semana passada?', HOJE);
  assert.equal(passada?.inicio, '2026-08-31');
  assert.equal(passada?.fim, '2026-09-06');
});

test('semana calculada no domingo pertence a semana que termina nele', () => {
  const domingo = resolveDateRange('essa semana', '2026-09-13');
  assert.equal(domingo?.inicio, '2026-09-07');
  assert.equal(domingo?.fim, '2026-09-13');
});

test('resolve ultimos N meses e N dias', () => {
  const meses = resolveDateRange('ultimos 3 meses', HOJE);
  assert.equal(meses?.inicio, '2026-07-01');
  assert.equal(meses?.fim, '2026-09-30');

  const dias = resolveDateRange('ultimos 30 dias', HOJE);
  assert.equal(dias?.inicio, '2026-08-10');
  assert.equal(dias?.fim, '2026-09-08');
});

test('ultimos meses atravessam a virada de ano', () => {
  const meses = resolveDateRange('ultimos 3 meses', '2026-01-15');
  assert.equal(meses?.inicio, '2025-11-01');
  assert.equal(meses?.fim, '2026-01-31');
});

test('resolve ano corrente e ano passado', () => {
  assert.equal(resolveDateRange('quanto gastei no ano?', HOJE)?.inicio, '2026-01-01');
  assert.equal(resolveDateRange('quanto gastei no ano?', HOJE)?.fim, '2026-12-31');
  assert.equal(resolveDateRange('e no ano passado?', HOJE)?.inicio, '2025-01-01');
});

test('resolve mes pelo nome, assumindo o passado quando o mes ainda nao chegou', () => {
  const julho = resolveDateRange('quanto paguei na farmacia em julho?', HOJE);
  assert.equal(julho?.inicio, '2026-07-01');

  // Dezembro ainda nao aconteceu em setembro: a pergunta fala do ano passado.
  const dezembro = resolveDateRange('quanto gastei em dezembro?', HOJE);
  assert.equal(dezembro?.inicio, '2025-12-01');

  const comAno = resolveDateRange('quanto gastei em dezembro de 2024?', HOJE);
  assert.equal(comAno?.inicio, '2024-12-01');
});

test('fevereiro em ano bissexto termina no dia 29', () => {
  assert.equal(resolveDateRange('fevereiro de 2024', HOJE)?.fim, '2024-02-29');
  assert.equal(resolveDateRange('fevereiro de 2026', HOJE)?.fim, '2026-02-28');
});

test('pergunta sem periodo devolve null, para quem chama assumir o mes corrente', () => {
  assert.equal(resolveDateRange('quanto gastei com mercado?', HOJE), null);
  assert.equal(currentMonthRange(HOJE).inicio, '2026-09-01');
});

test('periodo invalido do modelo e recusado', () => {
  assert.throws(() => assertValidRange('2026-13-01', '2026-09-30'), DateRangeError);
  assert.throws(() => assertValidRange('2026-09-30', '2026-09-01'), DateRangeError);
  assert.throws(() => assertValidRange('2000-01-01', '2026-09-30'), DateRangeError);
  assert.doesNotThrow(() => assertValidRange('2026-09-01', '2026-09-30'));
});

test('descreve o periodo usado para a resposta poder cita-lo', () => {
  assert.equal(describeRange('2026-09-01', '2026-09-30'), 'setembro de 2026');
  assert.equal(describeRange('2026-09-08', '2026-09-08'), '8 de setembro');
  assert.equal(describeRange('2026-09-05', '2026-09-20'), '5 de setembro a 20 de setembro de 2026');
});
