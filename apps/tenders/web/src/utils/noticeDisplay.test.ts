import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrency } from '../../screens/finance/formatters';
import { CLOSED_LABEL, NO_DEADLINE_LABEL, countdownFor } from './countdown';
import { addDaysToIsoDate, formatIsoDate, formatIsoDateTime, isValidIsoDate } from './dates';
import { highlightSegments } from './highlight';
import { formatCnpj } from './labels';
import { VALUE_NOT_INFORMED, decimalToReais, formatMoneyValue, reaisToDecimal } from './money';

const NOW = new Date('2026-10-05T12:00:00-03:00');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const closesIn = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

test('contagem regressiva: âmbar abaixo de 7 dias, vermelho abaixo de 2', () => {
  assert.deepEqual(countdownFor(closesIn(10 * DAY), NOW), { label: 'Encerra em 10 dias', tone: 'normal' });
  assert.deepEqual(countdownFor(closesIn(7 * DAY), NOW), { label: 'Encerra em 7 dias', tone: 'normal' });
  assert.deepEqual(countdownFor(closesIn(7 * DAY - 1), NOW), { label: 'Encerra em 6 dias', tone: 'warning' });
  assert.deepEqual(countdownFor(closesIn(2 * DAY), NOW), { label: 'Encerra em 2 dias', tone: 'warning' });
  assert.deepEqual(countdownFor(closesIn(2 * DAY - 1), NOW), { label: 'Encerra em 1 dia', tone: 'danger' });
  assert.deepEqual(countdownFor(closesIn(5 * HOUR), NOW), { label: 'Encerra em 5 horas', tone: 'danger' });
  assert.deepEqual(countdownFor(closesIn(HOUR), NOW), { label: 'Encerra em 1 hora', tone: 'danger' });
  assert.deepEqual(countdownFor(closesIn(90 * 1000), NOW), { label: 'Encerra em 2 minutos', tone: 'danger' });
});

test('contagem regressiva: sem prazo e encerrado', () => {
  assert.deepEqual(countdownFor(null, NOW), { label: NO_DEADLINE_LABEL, tone: 'none' });
  assert.deepEqual(countdownFor('data ruim', NOW), { label: NO_DEADLINE_LABEL, tone: 'none' });
  assert.deepEqual(countdownFor(closesIn(0), NOW), { label: CLOSED_LABEL, tone: 'closed' });
  assert.deepEqual(countdownFor('2026-10-01T09:00:00-03:00', NOW), { label: CLOSED_LABEL, tone: 'closed' });
});

test('destaque: trechos marcados viram destaque, o resto é texto', () => {
  assert.deepEqual(highlightSegments('Aquisição de <<software>> e <<licenças>> de uso'), [
    { text: 'Aquisição de ', highlighted: false },
    { text: 'software', highlighted: true },
    { text: ' e ', highlighted: false },
    { text: 'licenças', highlighted: true },
    { text: ' de uso', highlighted: false },
  ]);
  assert.deepEqual(highlightSegments('<<obra>>'), [{ text: 'obra', highlighted: true }]);
});

test('destaque: sem marcador ou com marcador sem par, tudo texto', () => {
  assert.deepEqual(highlightSegments('Reforma da escola'), [{ text: 'Reforma da escola', highlighted: false }]);
  assert.deepEqual(highlightSegments('valor << 10 mil'), [{ text: 'valor << 10 mil', highlighted: false }]);
  assert.deepEqual(highlightSegments('a >> b <<c>> d <<e'), [
    { text: 'a >> b ', highlighted: false },
    { text: 'c', highlighted: true },
    { text: ' d <<e', highlighted: false },
  ]);
  assert.deepEqual(highlightSegments('<<>>vazio'), [{ text: 'vazio', highlighted: false }]);
  assert.deepEqual(highlightSegments(''), []);
});

test('valores: reais ↔ decimal da API', () => {
  assert.equal(reaisToDecimal(1500.5), '1500.50');
  assert.equal(reaisToDecimal(0), null, 'zero é campo vazio');
  assert.equal(reaisToDecimal(null), null);
  assert.equal(reaisToDecimal(-5), null);
  assert.equal(reaisToDecimal(1e17), null, 'acima de 16 dígitos');
  assert.equal(decimalToReais('150000.50'), 150000.5);
  assert.equal(decimalToReais('1,5'), null);
  assert.equal(decimalToReais(null), null);
  assert.equal(formatMoneyValue(null), VALUE_NOT_INFORMED);
  assert.equal(formatMoneyValue(0), formatCurrency(0));
  assert.equal(formatMoneyValue(1234.5), formatCurrency(1234.5));
});

test('datas: relógio de Brasília como veio da API', () => {
  assert.equal(formatIsoDateTime('2026-10-20T09:30:00-03:00'), '20/10/2026 09:30');
  assert.equal(formatIsoDateTime('2026-10-20'), '20/10/2026');
  assert.equal(formatIsoDateTime(null), '—');
  assert.equal(formatIsoDate('2026-10-20T23:59:00-03:00'), '20/10/2026');
  assert.equal(formatIsoDate('ruim'), '—');
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2028-02-29'), true);
  assert.equal(addDaysToIsoDate('2026-12-30', 3), '2027-01-02');
});

test('CNPJ com pontuação', () => {
  assert.equal(formatCnpj('46395000000139'), '46.395.000/0001-39');
  assert.equal(formatCnpj('123'), '123');
  assert.equal(formatCnpj(null), '');
});
