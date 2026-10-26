import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { mapResult, maskPersonDocument, resolveSupplier, sourceRowKey, type MappedResult } from './resultMapping';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')) as T;
}

// Página real de resultados de 14/09/2026, da sondagem (`winners-probe`): o documento e o nome de pessoa física já
// vêm sem dado pessoal. 2 empresas (PJ), 2 pessoas físicas (PF) e 2 estrangeiras (PE), todas "Informado".
const page = fixture<{ resultado: Record<string, unknown>[]; totalRegistros: number }>('comprasgov-resultados.json');
const [PJ_ONE, PJ_TWO, PF_ONE, , PE_ONE] = page.resultado as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];

const FULL_CPF = '12345678901';

/** Um registro válido da fonte, com o que a sondagem mostrou, para os testes mexerem num campo de cada vez. */
function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idContratacaoPNCP: '24365710000183-1-000022/2027',
    numeroControlePNCPCompra: '24365710000183-1-000022/2027',
    numeroItemPncp: 3,
    sequencialResultado: 1,
    niFornecedor: '57507378000365',
    tipoPessoa: 'PJ',
    nomeRazaoSocialFornecedor: 'EMS S/A',
    porteFornecedorNome: 'Demais',
    valorTotalHomologado: 18206720,
    dataResultadoPncp: '2026-09-14T00:00:00',
    dataAtualizacaoPncp: '2026-09-14T15:54:35',
    dataCancelamentoPncp: null,
    situacaoCompraItemResultadoId: 1,
    unidadeOrgaoCodigoUnidade: '153103',
    unidadeOrgaoUfSigla: 'RN',
    ordemClassificacaoSrp: 1,
    ...overrides,
  };
}

function mapped(overrides: Record<string, unknown> = {}) {
  const result = mapResult(raw(overrides));
  assert.ok(result.ok, result.ok ? '' : result.reason);
  return result.record;
}

function refused(input: unknown): Extract<MappedResult, { ok: false }> {
  const result = mapResult(input);
  assert.equal(result.ok, false);
  return result as Extract<MappedResult, { ok: false }>;
}

test('a página da sondagem: empresa, pessoa física e estrangeira, todas viram resultado vencedor', () => {
  assert.equal(page.resultado.length, 6);
  for (const record of page.resultado) {
    const result = mapResult(record);
    assert.ok(result.ok, JSON.stringify(record).slice(0, 200));
    assert.equal(result.record.situation, 'winner');
    assert.match(result.record.purchaseControlNumber, /^\d{14}-1-\d{6}\/\d{4}$/);
  }
});

test('empresa (PJ): o CNPJ é a chave do fornecedor, e o resto do registro vem como a fonte mandou', () => {
  const result = mapResult(PJ_ONE);
  assert.ok(result.ok);
  assert.deepEqual(result.record, {
    purchaseControlNumber: '24365710000183-1-000022/2027',
    itemNumber: 1,
    sequence: 1,
    situation: 'winner',
    supplier: { key: '57507378000365', personType: 'PJ', document: '57507378000365', name: 'EMS S/A', size: 'Demais' },
    valueCents: 1_820_672_000,
    resultDate: '2026-09-14',
    updatedAt: '2026-09-14T15:54:35',
    unitCode: '153103',
    state: 'RN',
    rank: 1,
    cancelledOn: null,
  });
  const second = mapResult(PJ_TWO);
  assert.ok(second.ok);
  assert.equal(second.record.itemNumber, 2);
  assert.equal(second.record.valueCents, 4_334_631_392);
});

test('pessoa física com o documento já mascarado na fonte: fornecedor sem documento, com o nome na chave', () => {
  const result = mapResult(PF_ONE);
  assert.ok(result.ok);
  assert.equal(result.record.supplier.personType, 'PF');
  assert.equal(result.record.supplier.document, null);
  assert.match(result.record.supplier.key, /^sem-documento#[0-9a-f]{8}$/);
});

test('pessoa estrangeira (PE): o documento fica como veio, e entra na chave com o nome', () => {
  const result = mapResult(PE_ONE);
  assert.ok(result.ok);
  assert.equal(result.record.supplier.personType, 'PE');
  assert.equal(result.record.supplier.document, '*********');
  assert.match(result.record.supplier.key, /^\*{9}#[0-9a-f]{8}$/);
});

test('o CPF inteiro nunca sai sem máscara, com e sem o tipo de pessoa', () => {
  for (const personType of ['PF', 'PE', undefined, null, '', 'xx']) {
    const record = mapped({ niFornecedor: FULL_CPF, tipoPessoa: personType });
    assert.equal(record.supplier.document, '***.456.789-**', `tipo ${String(personType)}`);
    assert.doesNotMatch(JSON.stringify(record), new RegExp(FULL_CPF), `tipo ${String(personType)}`);
  }
  // Formatado e numérico também.
  assert.equal(mapped({ niFornecedor: '123.456.789-01', tipoPessoa: 'PF' }).supplier.document, '***.456.789-**');
  assert.equal(mapped({ niFornecedor: 12345678901, tipoPessoa: 'PF' }).supplier.document, '***.456.789-**');
  // Tipo PJ com 11 dígitos é cadastro errado: sem documento, e o CPF também não aparece.
  const mislabeled = mapped({ niFornecedor: FULL_CPF, tipoPessoa: 'PJ' });
  assert.equal(mislabeled.supplier.document, null);
  assert.doesNotMatch(JSON.stringify(mislabeled), new RegExp(FULL_CPF));
});

test('tipo de pessoa que falta sai dos dígitos: 14 é empresa, 11 é pessoa física', () => {
  assert.deepEqual(
    [mapped({ niFornecedor: '57507378000365', tipoPessoa: null }).supplier.personType, mapped({ niFornecedor: FULL_CPF, tipoPessoa: null }).supplier.personType],
    ['PJ', 'PF'],
  );
  assert.equal(mapped({ niFornecedor: '57.507.378/0003-65', tipoPessoa: undefined }).supplier.key, '57507378000365');
  // Sem tipo e sem dígitos que digam alguma coisa: segue sem tipo e sem CPF.
  const unknown = mapped({ niFornecedor: null, tipoPessoa: null });
  assert.equal(unknown.supplier.personType, null);
  assert.equal(unknown.supplier.document, null);
});

test('empresa com CNPJ de tamanho errado vira fornecedor sem documento, sem descartar o resultado', () => {
  const record = mapped({ niFornecedor: '1234', tipoPessoa: 'PJ' });
  assert.equal(record.supplier.document, null);
  assert.match(record.supplier.key, /^sem-documento#/);
  assert.equal(record.situation, 'winner');
});

test('número de controle: usa o da licitação e, sem ele, o da compra; fora do formato é recusado sem lançar', () => {
  assert.equal(mapped({ idContratacaoPNCP: undefined }).purchaseControlNumber, '24365710000183-1-000022/2027');
  for (const invalid of ['formato-diferente-123', '24365710000183-1-000022/27', '', '   ']) {
    const result = refused(raw({ idContratacaoPNCP: invalid, numeroControlePNCPCompra: invalid }));
    assert.match(result.reason, /número de controle da compra/);
  }
  const purchase = refused(raw({ idContratacaoPNCP: 'abc', numeroControlePNCPCompra: 'abc' })).purchase;
  assert.equal(purchase, 'abc', 'o número recusado vai para o detalhe do erro');
});

test('valor: ausente, zero e negativo viram "sem valor"; acima de 1e13 é erro do registro', () => {
  for (const value of [null, undefined, 0, -5, '0', '-10.50']) {
    assert.equal(mapped({ valorTotalHomologado: value }).valueCents, null, String(value));
  }
  assert.equal(mapped({ valorTotalHomologado: '1234.567' }).valueCents, 123_457);
  assert.equal(mapped({ valorTotalHomologado: 0.004 }).valueCents, null, 'menos de um centavo');
  assert.equal(mapped({ valorTotalHomologado: 1e13 }).valueCents, 1_000_000_000_000_000);
  assert.match(refused(raw({ valorTotalHomologado: 1e13 + 1 })).reason, /valorTotalHomologado/);
  assert.match(refused(raw({ valorTotalHomologado: 'abc' })).reason, /valorTotalHomologado/);
});

test('data do resultado: precisa existir e ser de 1990 em diante; só o dia vale', () => {
  assert.equal(mapped({ dataResultadoPncp: '2026-09-14' }).resultDate, '2026-09-14');
  assert.equal(mapped({ dataResultadoPncp: '2026-09-14T23:59:59' }).resultDate, '2026-09-14');
  for (const invalid of ['2026-02-30', '1989-12-31', '14/09/2026', 'ontem', '', undefined, null]) {
    assert.match(refused(raw({ dataResultadoPncp: invalid })).reason, /dataResultadoPncp/, String(invalid));
  }
});

test('situações: 1 vence, 2 e a data de cancelamento cancelam, 3 é reserva e o resto não vence', () => {
  assert.equal(mapped({ situacaoCompraItemResultadoId: 1 }).situation, 'winner');
  assert.equal(mapped({ situacaoCompraItemResultadoId: '1' }).situation, 'winner');
  assert.equal(mapped({ situacaoCompraItemResultadoId: 2 }).situation, 'cancelled');
  assert.equal(mapped({ situacaoCompraItemResultadoId: 3 }).situation, 'reserve');
  for (const other of [4, 9, null, undefined]) {
    assert.equal(mapped({ situacaoCompraItemResultadoId: other }).situation, 'other', String(other));
  }
  // A data de cancelamento cancela mesmo com a situação "informado".
  const cancelled = mapped({ situacaoCompraItemResultadoId: 1, dataCancelamentoPncp: '2026-09-20T08:30:00' });
  assert.equal(cancelled.situation, 'cancelled');
  assert.equal(cancelled.cancelledOn, '2026-09-20');
  // Data de cancelamento que não é data: continua cancelado, sem o dia.
  const garbled = mapped({ dataCancelamentoPncp: 'xx' });
  assert.equal(garbled.situation, 'cancelled');
  assert.equal(garbled.cancelledOn, null);
  assert.equal(mapped({ dataCancelamentoPncp: '' }).situation, 'winner');
});

test('campos opcionais: sequência ausente vale 1, classificação e atualização em formato livre ficam nulas ou vazias', () => {
  const record = mapped({ sequencialResultado: undefined, ordemClassificacaoSrp: '2', dataAtualizacaoPncp: 'ontem', unidadeOrgaoUfSigla: 'xx1', unidadeOrgaoCodigoUnidade: 153103 });
  assert.equal(record.sequence, 1);
  assert.equal(record.rank, 2);
  assert.equal(record.updatedAt, '');
  assert.equal(record.state, null);
  assert.equal(record.unitCode, '153103');
  assert.equal(mapped({ ordemClassificacaoSrp: null }).rank, null);
  assert.equal(mapped({ unidadeOrgaoUfSigla: 'ma' }).state, 'MA');
});

test('item sem número é erro do registro, e o que não é objeto não derruba nada', () => {
  assert.match(refused(raw({ numeroItemPncp: undefined })).reason, /numeroItemPncp/);
  assert.match(refused(raw({ numeroItemPncp: -1 })).reason, /numeroItemPncp/);
  for (const input of [null, undefined, 'texto', 42, [], {}]) {
    const result = mapResult(input);
    assert.equal(result.ok, false);
  }
  // No máximo três motivos por registro.
  const reason = refused({ numeroItemPncp: 'x', dataResultadoPncp: 'y', valorTotalHomologado: 'z', situacaoCompraItemResultadoId: 'w' }).reason;
  assert.ok(reason.split(';').length <= 3, reason);
});

test('bruto: o CPF de 11 dígitos sai mascarado, sem mexer no registro original nem no resto', () => {
  const original = raw({ niFornecedor: FULL_CPF, tipoPessoa: 'PF', nomeRazaoSocialFornecedor: 'MARIA DA SILVA' });
  const copy = maskPersonDocument(original) as Record<string, unknown>;
  assert.equal(copy['niFornecedor'], '***.456.789-**');
  assert.equal(original['niFornecedor'], FULL_CPF, 'o original não é alterado');
  assert.equal(copy['nomeRazaoSocialFornecedor'], 'MARIA DA SILVA', 'o resto vai como veio');
  assert.equal(copy['valorTotalHomologado'], original['valorTotalHomologado']);
  assert.doesNotMatch(JSON.stringify(copy), new RegExp(FULL_CPF));

  // O CPF vira máscara mesmo com o tipo errado, e como número ou formatado.
  assert.equal((maskPersonDocument(raw({ niFornecedor: FULL_CPF, tipoPessoa: 'PJ' })) as Record<string, unknown>)['niFornecedor'], '***.456.789-**');
  assert.equal((maskPersonDocument(raw({ niFornecedor: 12345678901 })) as Record<string, unknown>)['niFornecedor'], '***.456.789-**');
  assert.equal((maskPersonDocument(raw({ niFornecedor: '123.456.789-01' })) as Record<string, unknown>)['niFornecedor'], '***.456.789-**');
  // CNPJ (dado público), estrangeiro e o que não é objeto ficam como estão.
  const company = raw();
  assert.equal(maskPersonDocument(company), company);
  assert.equal(maskPersonDocument(PE_ONE), PE_ONE);
  assert.equal(maskPersonDocument(null), null);
  assert.equal(maskPersonDocument('texto'), 'texto');
});

test('identidade da linha da fonte: licitação, item e sequência, lidos do registro como veio', () => {
  assert.equal(sourceRowKey(raw()), '24365710000183-1-000022/2027|3|1');
  assert.equal(sourceRowKey(raw({ sequencialResultado: 2 })), '24365710000183-1-000022/2027|3|2');
  assert.notEqual(sourceRowKey(raw({ numeroItemPncp: 4 })), sourceRowKey(raw()));
  // Sequência ausente vale 1, como no mapeamento, e número como texto é o mesmo número.
  assert.equal(sourceRowKey(raw({ sequencialResultado: null })), sourceRowKey(raw({ sequencialResultado: 1 })));
  assert.equal(sourceRowKey(raw({ numeroItemPncp: '3' })), sourceRowKey(raw()));
  // Sem o número da licitação em `idContratacaoPNCP`, vale o da compra.
  assert.equal(sourceRowKey(raw({ idContratacaoPNCP: undefined })), sourceRowKey(raw()));
  // O fornecedor e o resto do registro não entram: o mesmo item lido duas vezes é a mesma linha.
  assert.equal(sourceRowKey(raw({ niFornecedor: '11222333000181', valorTotalHomologado: 1 })), sourceRowKey(raw()));
  // Vale também para o registro que o mapeamento recusa, e é nula quando falta a licitação ou o item.
  assert.equal(sourceRowKey(raw({ idContratacaoPNCP: 'formato-diferente', numeroControlePNCPCompra: 'formato-diferente' })), 'formato-diferente|3|1');
  assert.equal(sourceRowKey(raw({ idContratacaoPNCP: undefined, numeroControlePNCPCompra: undefined })), null);
  assert.equal(sourceRowKey(raw({ numeroItemPncp: undefined })), null);
  assert.equal(sourceRowKey(null), null);
  assert.equal(sourceRowKey('texto'), null);
  assert.equal(sourceRowKey([raw()]), null);
});

test('identidade do fornecedor: a mesma pessoa jurídica por CNPJ com ou sem formatação, nomes iguais não se fundem sem documento', () => {
  const plain = resolveSupplier('PJ', '57507378000365', 'EMS S/A', null);
  const formatted = resolveSupplier('PJ', '57.507.378/0003-65', 'EMS SA', 'Demais');
  assert.equal(plain.key, formatted.key);
  const maria = resolveSupplier('PF', FULL_CPF, 'MARIA DA SILVA', null);
  const joana = resolveSupplier('PF', FULL_CPF, 'JOANA DA SILVA', null);
  assert.equal(maria.document, joana.document, 'a mesma máscara');
  assert.notEqual(maria.key, joana.key, 'chaves diferentes por causa do nome');
});
