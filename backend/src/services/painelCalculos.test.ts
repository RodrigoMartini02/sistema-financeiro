import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agregarContasEmAberto,
  agregarEmDia,
  agregarFormasPagamento,
  agregarTipoGasto,
  baldesDaSerie,
  classificarPagamento,
  dataIsoValida,
  fatorMetaProporcional,
  janelaDaSerie,
  montarSerie,
  percentual,
  periodoAnterior,
  resumirPeriodo,
  ticketMedio,
  ultimoDiaDoMes,
  validarPeriodo,
  variacaoPercentual,
  type DespesaPainel,
  type ReceitaPainel,
} from './painelCalculos';

function despesa(parcial: Partial<DespesaPainel>): DespesaPainel {
  return {
    usuarioId: 1,
    categoriaId: null,
    cartaoId: null,
    formaPagamento: 'pix',
    dataVencimento: '2026-09-10',
    dataPagamento: null,
    pago: false,
    valorOriginal: 100,
    valorPago: null,
    parcelado: false,
    recorrente: false,
    ...parcial,
  };
}

function receita(parcial: Partial<ReceitaPainel>): ReceitaPainel {
  return { usuarioId: 1, dataRecebimento: '2026-09-05', valor: 1000, contratoId: null, ...parcial };
}

test('valida datas ISO reais e rejeita datas inexistentes', () => {
  assert.equal(dataIsoValida('2026-02-28'), true);
  assert.equal(dataIsoValida('2026-02-30'), false);
  assert.equal(dataIsoValida('28/02/2026'), false);
});

test('rejeita período invertido e período maior que 10 anos', () => {
  assert.equal(validarPeriodo('2026-09-30', '2026-09-01').valido, false);
  assert.equal(validarPeriodo('2010-01-01', '2026-09-30').valido, false);
  assert.deepEqual(validarPeriodo('2026-09-01', '2026-09-30'), { valido: true, periodo: { de: '2026-09-01', ate: '2026-09-30' } });
});

test('mês inteiro compara com o mês anterior inteiro', () => {
  assert.deepEqual(periodoAnterior({ de: '2026-03-01', ate: '2026-03-31' }), { de: '2026-02-01', ate: '2026-02-28' });
});

test('recorte de dias compara com o mesmo número de dias logo antes', () => {
  assert.deepEqual(periodoAnterior({ de: '2026-09-10', ate: '2026-09-19' }), { de: '2026-08-31', ate: '2026-09-09' });
});

test('a série cobre o próprio período, por semana até 62 dias', () => {
  assert.deepEqual(janelaDaSerie({ de: '2026-09-01', ate: '2026-09-30' }), { de: '2026-09-01', ate: '2026-09-30', granularidade: 'semana' });
  assert.equal(janelaDaSerie({ de: '2026-08-01', ate: '2026-10-01' }).granularidade, 'semana');
  assert.equal(janelaDaSerie({ de: '2026-08-01', ate: '2026-10-02' }).granularidade, 'mes');
});

test('período que atravessa mais de 24 meses vira série anual', () => {
  assert.equal(janelaDaSerie({ de: '2023-01-01', ate: '2026-09-30' }).granularidade, 'ano');
  assert.equal(janelaDaSerie({ de: '2026-01-01', ate: '2026-09-30' }).granularidade, 'mes');
});

test('semanas de 7 dias a partir da data inicial, a última recortada ao período', () => {
  const semanasDeSetembro = baldesDaSerie({ de: '2026-09-01', ate: '2026-09-30', granularidade: 'semana' });
  assert.equal(semanasDeSetembro.length, 5);
  assert.deepEqual(semanasDeSetembro[4], { inicio: '2026-09-29', fim: '2026-09-30' });
  const semanasDeOutubro = baldesDaSerie({ de: '2026-10-01', ate: '2026-10-31', granularidade: 'semana' });
  assert.deepEqual(semanasDeOutubro[4], { inicio: '2026-10-29', fim: '2026-10-31' });
  assert.deepEqual(baldesDaSerie({ de: '2026-09-25', ate: '2026-10-10', granularidade: 'semana' }), [
    { inicio: '2026-09-25', fim: '2026-10-01' },
    { inicio: '2026-10-02', fim: '2026-10-08' },
    { inicio: '2026-10-09', fim: '2026-10-10' },
  ]);
});

test('meses com as pontas recortadas ao período', () => {
  assert.deepEqual(baldesDaSerie({ de: '2026-08-15', ate: '2026-10-10', granularidade: 'mes' }), [
    { inicio: '2026-08-15', fim: '2026-08-31' },
    { inicio: '2026-09-01', fim: '2026-09-30' },
    { inicio: '2026-10-01', fim: '2026-10-10' },
  ]);
});

test('último dia do mês respeita fevereiro', () => {
  assert.equal(ultimoDiaDoMes('2028-02-10'), '2028-02-29');
});

test('pago até o vencimento ou sem data de pagamento é em dia; depois, com atraso', () => {
  assert.equal(classificarPagamento(despesa({ pago: true, dataPagamento: '2026-09-10' })), 'em_dia');
  assert.equal(classificarPagamento(despesa({ pago: true, dataPagamento: null })), 'em_dia');
  assert.equal(classificarPagamento(despesa({ pago: true, dataPagamento: '2026-09-11' })), 'com_atraso');
  assert.equal(classificarPagamento(despesa({ pago: false })), 'em_aberto');
});

test('resumo usa o valor pago nas quitadas e separa pago de a pagar', () => {
  const resumo = resumirPeriodo(
    [despesa({ pago: true, valorPago: 110 }), despesa({ valorOriginal: 50 })],
    [receita({ valor: 1000 })],
  );
  assert.deepEqual(resumo, { entrou: 1000, saiu: 160, pago: 110, aPagar: 50 });
});

test('tipo de gasto: fixa é recorrente, parcela é parcelada não recorrente, resto é livre', () => {
  const totais = agregarTipoGasto([
    despesa({ recorrente: true, valorOriginal: 10 }),
    despesa({ parcelado: true, valorOriginal: 20 }),
    despesa({ recorrente: true, parcelado: true, valorOriginal: 5 }),
    despesa({ valorOriginal: 40 }),
  ]);
  assert.deepEqual(totais, { fixo: 15, parcela: 20, livre: 40 });
});

test('formas de pagamento somam valor, quantidade e juros, da maior para a menor', () => {
  const formas = agregarFormasPagamento([
    despesa({ formaPagamento: 'credito', valorOriginal: 100, pago: true, valorPago: 105 }),
    despesa({ formaPagamento: 'credito', valorOriginal: 100 }),
    despesa({ formaPagamento: 'pix', valorOriginal: 50 }),
  ]);
  assert.deepEqual(formas[0], { forma: 'credito', valor: 205, quantidade: 2, juros: 5 });
  assert.equal(formas[1]!.forma, 'pix');
});

test('em dia separa o que venceu no período e o atraso quitado de vencimentos anteriores', () => {
  const periodo = { de: '2026-09-01', ate: '2026-09-30' };
  const totais = agregarEmDia([
    despesa({ dataVencimento: '2026-09-10', pago: true, dataPagamento: '2026-09-09' }),
    despesa({ dataVencimento: '2026-09-10', pago: true, dataPagamento: '2026-09-15' }),
    despesa({ dataVencimento: '2026-09-20' }),
    despesa({ dataVencimento: '2026-08-20', pago: true, dataPagamento: '2026-09-02', valorOriginal: 30 }),
  ], periodo);
  assert.deepEqual(totais, { cadastrado: 300, pagoEmDia: 100, pagoComAtraso: 100, emAberto: 100, quitadoDeAnteriores: 30 });
});

test('contas em aberto: atraso antes de hoje, próximos 30 dias e comprometido em 6 meses', () => {
  const resultado = agregarContasEmAberto([
    despesa({ dataVencimento: '2026-09-01' }),
    despesa({ dataVencimento: '2026-09-27', parcelado: true }),
    despesa({ dataVencimento: '2027-02-15' }),
    despesa({ dataVencimento: '2027-03-01' }),
  ], '2026-09-27');
  assert.deepEqual(resultado.atraso, { valor: 100, quantidade: 1 });
  assert.deepEqual(resultado.proximos30Dias, { valor: 100, quantidade: 1 });
  assert.equal(resultado.comprometido.length, 6);
  assert.deepEqual(resultado.comprometido[0], { ano: 2026, mes: 8, parcelas: 100, outras: 0 });
  assert.deepEqual(resultado.comprometido[5], { ano: 2027, mes: 1, parcelas: 0, outras: 100 });
});

test('série: despesa pelo vencimento, pago pela data de pagamento', () => {
  const serie = montarSerie(
    [despesa({ dataVencimento: '2026-08-10', pago: true, dataPagamento: '2026-09-02', formaPagamento: 'credito' })],
    [receita({ dataRecebimento: '2026-09-05' })],
    { de: '2026-08-01', ate: '2026-09-30', granularidade: 'mes' },
  );
  assert.deepEqual(serie, [
    { inicio: '2026-08-01', fim: '2026-08-31', receitas: 0, despesas: 100, credito: 100, pago: 0 },
    { inicio: '2026-09-01', fim: '2026-09-30', receitas: 1000, despesas: 0, credito: 0, pago: 100 },
  ]);
});

test('série semanal: o último dia da semana cai na semana certa', () => {
  const serie = montarSerie(
    [despesa({ dataVencimento: '2026-09-07' }), despesa({ dataVencimento: '2026-09-08', valorOriginal: 40 })],
    [],
    { de: '2026-09-01', ate: '2026-09-30', granularidade: 'semana' },
  );
  assert.equal(serie[0]!.despesas, 100);
  assert.equal(serie[1]!.despesas, 40);
});

test('indicadores sem base devolvem null em vez de dividir por zero', () => {
  assert.equal(variacaoPercentual(100, 0), null);
  assert.equal(variacaoPercentual(110, 100), 10);
  assert.equal(percentual(50, 0), null);
  assert.equal(ticketMedio(100, 0), null);
  assert.equal(ticketMedio(100, 4), 25);
});

test('meta proporcional: mês inteiro vale 1, metade do mês vale metade', () => {
  assert.equal(fatorMetaProporcional({ de: '2026-09-01', ate: '2026-09-30' }), 1);
  assert.equal(fatorMetaProporcional({ de: '2026-09-01', ate: '2026-09-15' }), 0.5);
});
