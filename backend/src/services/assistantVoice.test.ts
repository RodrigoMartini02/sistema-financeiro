import assert from 'node:assert/strict';
import test from 'node:test';
import {
  spellCurrency,
  spellDate,
  spellInteger,
  spellPercent,
  toSpeakableText,
} from './assistantVoice';

test('inteiros simples', () => {
  assert.equal(spellInteger(0), 'zero');
  assert.equal(spellInteger(1), 'um');
  assert.equal(spellInteger(15), 'quinze');
  assert.equal(spellInteger(21), 'vinte e um');
  assert.equal(spellInteger(99), 'noventa e nove');
});

test('cem é exato; cento quando acompanhado', () => {
  assert.equal(spellInteger(100), 'cem');
  assert.equal(spellInteger(101), 'cento e um');
  assert.equal(spellInteger(182), 'cento e oitenta e dois');
  assert.equal(spellInteger(200), 'duzentos');
  assert.equal(spellInteger(640), 'seiscentos e quarenta');
});

test('mil nunca vem precedido de um', () => {
  assert.equal(spellInteger(1000), 'mil');
  assert.equal(spellInteger(1200), 'mil e duzentos');
  assert.equal(spellInteger(2000), 'dois mil');
  assert.equal(spellInteger(5000), 'cinco mil');
});

test('milhares com resto', () => {
  assert.equal(spellInteger(1234), 'mil, duzentos e trinta e quatro');
  assert.equal(spellInteger(3050), 'tres mil e cinquenta');
  assert.equal(spellInteger(10500), 'dez mil e quinhentos');
});

test('milhoes', () => {
  assert.equal(spellInteger(1_000_000), 'um milhao');
  assert.equal(spellInteger(2_000_000), 'dois milhoes');
});

test('valores em reais, com e sem centavos', () => {
  assert.equal(spellCurrency(640), 'seiscentos e quarenta reais');
  assert.equal(spellCurrency(1), 'um real');
  assert.equal(spellCurrency(0), 'zero reais');
  assert.equal(spellCurrency(42.9), 'quarenta e dois reais e noventa centavos');
  assert.equal(spellCurrency(1200), 'mil e duzentos reais');
  assert.equal(spellCurrency(0.5), 'cinquenta centavos');
  assert.equal(spellCurrency(0.01), 'um centavo');
});

test('valor negativo é dito como menos', () => {
  assert.equal(spellCurrency(-182), 'menos cento e oitenta e dois reais');
});

test('percentual por extenso', () => {
  assert.equal(spellPercent(32), 'trinta e dois por cento');
  assert.equal(spellPercent(7.5), 'sete vírgula cinco por cento');
  assert.equal(spellPercent(100), 'cem por cento');
});

test('datas faladas', () => {
  assert.equal(spellDate('2026-09-03', '2026-09-08'), 'dia tres de setembro');
  assert.equal(spellDate('2026-09-01', '2026-09-08'), 'dia primeiro de setembro');
  // Ano diferente do corrente aparece na fala.
  assert.equal(spellDate('2025-12-10', '2026-09-08'), 'dia dez de dezembro de dois mil e vinte e cinco');
});

test('texto do modelo com R$ vira fala', () => {
  const falado = toSpeakableText('Em setembro você gastou R$ 640,00 com mercado.', '2026-09-08');
  assert.ok(falado.includes('seiscentos e quarenta reais'), falado);
  assert.ok(!falado.includes('R$'), falado);
});

test('markdown e simbolos somem da fala', () => {
  const falado = toSpeakableText('**Total**: R$ 100,00\n- item um\n- item dois', '2026-09-08');
  assert.ok(!falado.includes('*'), falado);
  assert.ok(!falado.includes('-'), falado);
  assert.ok(falado.includes('cem reais'), falado);
});

test('data em digito vira data falada', () => {
  const falado = toSpeakableText('A conta venceu em 03/09/2026.', '2026-09-08');
  assert.ok(falado.includes('dia tres de setembro'), falado);
  assert.ok(!falado.includes('03/09'), falado);
});

test('percentual em digito vira extenso', () => {
  const falado = toSpeakableText('Você comprometeu 32% da renda.', '2026-09-08');
  assert.ok(falado.includes('trinta e dois por cento'), falado);
});

test('numero solto restante tambem e falado', () => {
  const falado = toSpeakableText('Foram 9 compras.', '2026-09-08');
  assert.ok(falado.includes('nove compras'), falado);
});
