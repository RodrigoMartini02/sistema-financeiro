import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeWithholdings, hasWithholdings, incomeAmounts, incomeValueColumns, ratesFromColumns, resolveIncomeAmounts, sumWithholdings,
} from './contractRetentions';

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

test('receita lançada à mão: sem retenção valem o bruto e o líquido digitados; com retenção, só o bruto', () => {
  // Empréstimo de R$ 1.000 com taxa de R$ 100: entrou R$ 900.
  assert.deepEqual(resolveIncomeAmounts({ grossAmount: 1000, netAmount: 900 }, {}), { gross: 1000, withholdings: null, net: 900 });
  // Contrato que retém: o líquido digitado é ignorado e sai dos percentuais.
  const comRetencao = resolveIncomeAmounts({ grossAmount: 4500, netAmount: 4500 }, { ir: 4.8, iss: 5 });
  assert.equal(comRetencao.net, 4059);
  assert.equal(comRetencao.gross, 4500);
  assert.notEqual(comRetencao.withholdings, null);
});

test('colunas de valor da receita: líquido e bruto sempre gravados, retenções só quando existem', () => {
  assert.deepEqual(incomeValueColumns({ gross: 1000, withholdings: null, net: 900 }), { netAmount: '900.00', grossAmount: '1000.00', withholdings: null });
  const colunas = incomeValueColumns(incomeAmounts(4500, { ir: 4.8, iss: 5 }));
  assert.equal(colunas.netAmount, '4059.00');
  assert.equal(colunas.grossAmount, '4500.00');
  assert.equal(sumWithholdings(colunas.withholdings), 441);
  assert.equal(sumWithholdings(null), 0);
});
