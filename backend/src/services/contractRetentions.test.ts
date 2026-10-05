import assert from 'node:assert/strict';
import test from 'node:test';
import { computeWithholdings, hasWithholdings, incomeAmounts, ratesFromColumns } from './contractRetentions';

test('valores da receita: com retenção, o líquido vale e o bruto fica ao lado; sem retenção, só o valor', () => {
  assert.deepEqual(incomeAmounts(4500, { ir: 4.8, iss: 5 }), {
    gross: 4500,
    withholdings: { ir: 216, pisCofinsCsll: 0, iss: 225, inss: 0 },
    net: 4059,
  });
  assert.deepEqual(incomeAmounts(4500, { iss: 0 }), { gross: 4500, withholdings: null, net: 4500 });
});

test('percentuais do banco: coluna nula fica de fora, zero continua', () => {
  assert.deepEqual(ratesFromColumns({ ir: '4.80', pisCofinsCsll: null, iss: '0.00', inss: null }), { ir: 4.8, iss: 0 });
});

test('R$ 4.500,00 com IR de 4,80% e ISS de 5,00%: retém R$ 441,00 e o líquido é R$ 4.059,00', () => {
  const result = computeWithholdings(4500, { ir: 4.8, iss: 5 });
  assert.deepEqual(result.amounts, { ir: 216, pisCofinsCsll: 0, iss: 225, inss: 0 });
  assert.equal(result.total, 441);
  assert.equal(result.net, 4059);
  assert.equal(result.gross, 4500);
});

test('percentual vazio ou zero não retém nada', () => {
  const result = computeWithholdings(1234.56, {});
  assert.deepEqual(result.amounts, { ir: 0, pisCofinsCsll: 0, iss: 0, inss: 0 });
  assert.equal(result.total, 0);
  assert.equal(result.net, 1234.56);
  assert.equal(computeWithholdings(1000, { iss: 0 }).net, 1000);
  assert.equal(hasWithholdings({}), false);
  assert.equal(hasWithholdings({ iss: 0, ir: 0 }), false);
  assert.equal(hasWithholdings({ iss: 0, inss: 11 }), true);
});

test('cada tributo é arredondado ao centavo, metade para cima, antes de somar', () => {
  // 333,33 × 5,00% = 16,6665 → 16,67; × 4,65% = 15,499845 → 15,50; × 1,50% = 4,99995 → 5,00.
  const result = computeWithholdings(333.33, { iss: 5, pisCofinsCsll: 4.65, ir: 1.5 });
  assert.deepEqual(result.amounts, { ir: 5, pisCofinsCsll: 15.5, iss: 16.67, inss: 0 });
  assert.equal(result.total, 37.17);
  assert.equal(result.net, 296.16);
});

test('retenção total de 100% zera o líquido', () => {
  const result = computeWithholdings(100, { inss: 100 });
  assert.equal(result.total, 100);
  assert.equal(result.net, 0);
});
