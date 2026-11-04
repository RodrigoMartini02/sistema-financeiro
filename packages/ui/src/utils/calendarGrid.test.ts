import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALENDAR_DAYS, addDays, addMonths, calendarYears, daysInMonth, isInRange, isValidIso, monthGrid, monthOfIso,
  rangeAfterClick, shiftMonth,
} from './calendarGrid';

test('grade do mês: 6 semanas começando no domingo, com os meses vizinhos', () => {
  const october = monthGrid({ year: 2026, month: 10 });
  assert.equal(october.length, CALENDAR_DAYS);
  // 01/10/2026 é uma quinta-feira: a grade começa no domingo, 27/09.
  assert.deepEqual(october[0], { iso: '2026-09-27', day: 27, inMonth: false });
  assert.deepEqual(october[4], { iso: '2026-10-01', day: 1, inMonth: true });
  assert.deepEqual(october[34], { iso: '2026-10-31', day: 31, inMonth: true });
  assert.deepEqual(october[41], { iso: '2026-11-07', day: 7, inMonth: false });
});

test('mês que começa no domingo não tem dias do mês anterior', () => {
  // 01/02/2026 é domingo.
  assert.deepEqual(monthGrid({ year: 2026, month: 2 })[0], { iso: '2026-02-01', day: 1, inMonth: true });
});

test('fevereiro de ano bissexto e virada de ano', () => {
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(1900, 2), 28);
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 5 }, -17), { year: 2024, month: 12 });
});

test('teclado: dias e meses somados, com o dia limitado ao fim do mês', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-10-05', 7), '2026-10-12');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-03-31', -1), '2028-02-29');
  assert.equal(addMonths('2026-10-05', -12), '2025-10-05');
});

test('data ISO: existe ou não, e o mês mostrado quando falta a data', () => {
  assert.equal(isValidIso('2026-02-29'), false);
  assert.equal(isValidIso('2028-02-29'), true);
  assert.equal(isValidIso('05/10/2026'), false);
  assert.deepEqual(monthOfIso('1985-07-14', '2026-10-05'), { year: 1985, month: 7 });
  assert.deepEqual(monthOfIso('', '2026-10-05'), { year: 2026, month: 10 });
});

test('período: primeiro clique é o início, segundo é o fim, terceiro recomeça', () => {
  const first = rangeAfterClick({ start: null, end: null }, '2026-10-10');
  assert.deepEqual(first, { range: { start: '2026-10-10', end: null }, complete: false });
  const second = rangeAfterClick(first.range, '2026-10-20');
  assert.deepEqual(second, { range: { start: '2026-10-10', end: '2026-10-20' }, complete: true });
  const third = rangeAfterClick(second.range, '2026-11-01');
  assert.deepEqual(third, { range: { start: '2026-11-01', end: null }, complete: false });
});

test('período: segundo clique antes do primeiro inverte as datas; mesmo dia vale', () => {
  assert.deepEqual(rangeAfterClick({ start: '2026-10-10', end: null }, '2026-10-05').range, { start: '2026-10-05', end: '2026-10-10' });
  assert.deepEqual(rangeAfterClick({ start: '2026-10-10', end: null }, '2026-10-10').range, { start: '2026-10-10', end: '2026-10-10' });
});

test('dia dentro do período, inclusive nas pontas e em qualquer ordem', () => {
  assert.equal(isInRange('2026-10-07', '2026-10-10', '2026-10-05'), true);
  assert.equal(isInRange('2026-10-05', '2026-10-05', '2026-10-10'), true);
  assert.equal(isInRange('2026-10-11', '2026-10-05', '2026-10-10'), false);
  assert.equal(isInRange('2026-10-07', '2026-10-05', null), false);
});

test('anos da lista: de 1900 a 20 anos à frente, sempre com o ano mostrado', () => {
  const years = calendarYears(1985, 2026);
  assert.equal(years[0], 1900);
  assert.equal(years.at(-1), 2046);
  assert.equal(years.length, 147);
  assert.equal(calendarYears(1890, 2026)[0], 1890);
  assert.equal(calendarYears(2060, 2026).at(-1), 2060);
});
