import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  federalContractKey,
  headOfficeCnpj,
  inclusionOf,
  isLaterRegistration,
  mapFederalContract,
  normalizeCnpj,
  parseFederalAgency,
  parseFederalUnit,
  pncpAgencyCnpjOf,
  resolveAgencyCnpj,
  type FederalMappingContext,
  type FederalUnit,
  type MappedFederalContract,
} from './federalMapping';
import type { TenderContractRow } from './contractMapping';
import { payloadHash } from './mapping';
import { isContractKey } from '../contractStore/layout';

interface Fixture {
  orgaos: Record<string, unknown>[];
  unidades: Record<string, unknown>[];
  sinteticos: string[];
  contratos: Record<string, Record<string, unknown>>;
}

// Amostra real do Compras.gov.br de 26/10/2026 (UFMG, Ministério da Saúde e Comando do Exército); os casos em
// "sinteticos" são variações de uma linha real. Ver o comentário do próprio arquivo.
const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'comprasgov-contratos.json'), 'utf8')) as Fixture;

const UFMG_CNPJ = '17217985000104';
const units = new Map<string, FederalUnit>();
for (const raw of fixture.unidades) {
  const unit = parseFederalUnit(raw);
  assert.ok(unit, 'unidade da fixture inválida');
  units.set(unit.code, unit);
}
// 45 dias antes de 26/10/2026.
const CONTEXT: FederalMappingContext = { agencyCnpj: UFMG_CNPJ, units, recentFrom: '2026-09-11T00:00:00' };

function raw(name: string): Record<string, unknown> {
  const row = fixture.contratos[name];
  assert.ok(row, `sem o caso ${name} na fixture`);
  return row;
}

function mapped(name: string, context: FederalMappingContext = CONTEXT): Extract<MappedFederalContract, { ok: true }> {
  const result = mapFederalContract(raw(name), context);
  assert.ok(result.ok, `${name}: ${JSON.stringify(result)}`);
  return result;
}

test('CNPJ: confere os dígitos, completa o zero que o cadastro perde e rejeita o que não é CNPJ', () => {
  assert.equal(normalizeCnpj('17217985005840'), '17217985005840');
  assert.equal(normalizeCnpj('2313673000127'), '02313673000127', 'a ANP vem com 13 dígitos no cadastro');
  assert.equal(normalizeCnpj(2313673000127), '02313673000127', 'e pode vir como número');
  assert.equal(normalizeCnpj('394452028458'), '00394452028458');
  for (const invalid of ['0', '', '17217985005841', '123', '12345678901234567', null, undefined, {}]) {
    assert.equal(normalizeCnpj(invalid), null, String(invalid));
  }
});

test('CNPJ do órgão: a matriz (raiz, 0001 e dígitos) e o que o PNCP ensinou vale mais', () => {
  assert.equal(headOfficeCnpj('17217985005840'), UFMG_CNPJ, 'o cadastro da UFMG traz a filial; o PNCP usa a matriz');
  assert.equal(headOfficeCnpj('00394452000103'), '00394452000103', 'a matriz continua a mesma');
  assert.equal(resolveAgencyCnpj(null, '17217985005840'), UFMG_CNPJ);
  assert.equal(resolveAgencyCnpj('11222333000181', '17217985005840'), '11222333000181');
  assert.equal(resolveAgencyCnpj(null, null), null);
  assert.equal(resolveAgencyCnpj('11222333000181', null), '11222333000181');
});

test('CNPJ aprendido: o do número de controle do contrato no PNCP, nunca o da compra', () => {
  assert.equal(pncpAgencyCnpjOf(raw('contratoComPncp')), UFMG_CNPJ);
  assert.equal(pncpAgencyCnpjOf(raw('contratoSemPncp')), null);
  const other = raw('contratoComPncpDeOutroCnpjNaCompra');
  assert.notEqual(String(other['numeroControlePncpCompra']).slice(0, 14), UFMG_CNPJ, 'a compra é de outro órgão');
  assert.equal(pncpAgencyCnpjOf(other), UFMG_CNPJ);
  assert.equal(pncpAgencyCnpjOf({ numeroControlePncpContrato: 'sem formato' }), null);
  assert.equal(pncpAgencyCnpjOf(null), null);
});

test('lista de órgãos: só os federais, com o CNPJ do cadastro normalizado ou nulo', () => {
  const agencies = fixture.orgaos.map(parseFederalAgency);
  assert.deepEqual(agencies.map((agency) => agency?.code ?? null), ['26238', '52121', '36000', '32205', '32991', null], 'o órgão de esfera E fica de fora');
  assert.deepEqual(agencies[0], { code: '26238', name: 'UNIVERSIDADE FEDERAL DE MINAS GERAIS', cnpj: '17217985005840', usesSisg: true });
  assert.equal(agencies[3]?.cnpj, '02313673000127');
  assert.equal(agencies[3]?.usesSisg, false);
  assert.equal(agencies[4]?.cnpj, null, 'o cadastro com "0" não tem CNPJ');
  assert.equal(parseFederalAgency({ nomeOrgao: 'sem código', esfera: 'F' }), null);
});

test('lista de unidades: UF, município e código do IBGE; o que vier fora do formato fica nulo', () => {
  assert.deepEqual(units.get('153254'), { code: '153254', state: 'MG', cityName: 'BELO HORIZONTE', cityIbgeCode: '3106200' });
  assert.deepEqual(units.get('160089'), { code: '160089', state: 'DF', cityName: 'BRASÍLIA', cityIbgeCode: '5300108' });
  assert.deepEqual(parseFederalUnit({ codigoUasg: 12, siglaUf: 'minas', codigoMunicipioIbge: 99 }), { code: '12', state: null, cityName: null, cityIbgeCode: null });
  assert.equal(parseFederalUnit({ codigoUasg: 'abc' }), null);
});

test('contrato sem número do PNCP: chave, órgão, unidade, datas, valor e fornecedor', () => {
  const result = mapped('contratoSemPncp');
  const { row } = result;
  assert.equal(row.pncpControlNumber, 'comprasgov-153262-50-00019/2024');
  assert.equal(isContractKey(row.pncpControlNumber), true);
  assert.equal(row.contractNumber, '00019/2024');
  assert.equal(row.contractYear, 2024);
  assert.equal(row.contractSequence, 0);
  assert.equal(row.agencyCnpj, UFMG_CNPJ);
  assert.equal(row.agencyName, 'UNIVERSIDADE FEDERAL DE MINAS GERAIS');
  assert.equal(row.governmentSphere, 'F');
  assert.equal(row.unitCode, '153262');
  assert.equal(row.unitName, 'IMPRENSA UNIVERSITARIA/UFMG');
  assert.deepEqual([row.state, row.cityName, row.cityIbgeCode], ['MG', 'BELO HORIZONTE', '3106200']);
  assert.equal(row.processNumber, '23072.279698/2023-41');
  assert.equal(row.termStart, '2024-01-24', 'a hora da vigência (T00:00:00) não entra');
  assert.equal(row.originalTermEnd, '2025-01-24');
  assert.equal(row.expiresOn, '2025-01-24');
  assert.equal(row.publishedAt, '2024-01-24T12:27:07');
  assert.equal(result.includedAt, '2024-01-24T12:27:07');
  assert.equal(row.globalValue, '141499.00');
  assert.equal(row.initialValue, null);
  assert.equal(row.signedAt, null);
  assert.deepEqual([row.contractTypeId, row.contractTypeName], [1, 'Contrato']);
  assert.deepEqual([row.categoryId, row.categoryName], [8, 'Serviços']);
  assert.deepEqual([row.supplierPersonType, row.supplierDocument, row.supplierName], ['PJ', '38680138000151', 'GESMAQ COMERCIO E SERVICOS LTDA']);
  assert.equal(row.amendments, null, 'a fonte não traz aditivos');
  assert.equal(row.amendmentsReference, null);
  assert.equal(row.pncpUpdatedAt, null);
  assert.equal(row.pncpGlobalUpdatedAt, null);
  assert.equal(row.purchaseControlNumber, null);
  assert.equal(result.withoutExpiry, null);
  assert.match(row.payloadHash, /^[0-9a-f]{64}$/);
});

test('empenho: o número da licitação de origem (do PNCP) e o ano do número do empenho', () => {
  const { row } = mapped('empenho');
  assert.equal(row.pncpControlNumber, 'comprasgov-153254-99-2024NE000014');
  assert.equal(row.contractYear, 2024);
  assert.deepEqual([row.contractTypeId, row.contractTypeName], [7, 'Empenho']);
  assert.equal(row.purchaseControlNumber, '17217985000104-1-000705/2022');
  assert.equal(mapped('empenhoSemCompra').row.purchaseControlNumber, null);
});

test('cada tipo do Compras vira o do PNCP; credenciamento e tipo novo caem em "Outros" com o nome da origem', () => {
  const types = (name: string) => {
    const { row } = mapped(name);
    return [row.contractTypeId, row.contractTypeName];
  };
  assert.deepEqual(types('contratoSemPncp'), [1, 'Contrato']);
  assert.deepEqual(types('concessao'), [4, 'Concessão']);
  assert.deepEqual(types('convenio'), [6, 'Convênio']);
  assert.deepEqual(types('empenho'), [7, 'Empenho']);
  assert.deepEqual(types('outros'), [8, 'Outros']);
  assert.deepEqual(types('acordoCooperacao'), [10, 'Acordo de cooperação técnica']);
  assert.deepEqual(types('termoCompromisso'), [11, 'Termo de compromisso']);
  assert.deepEqual(types('cartaContrato'), [12, 'Carta contrato']);
  assert.deepEqual(types('credenciamento'), [8, 'Credenciamento']);
  const ted = mapFederalContract({ ...raw('contratoSemPncp'), codigoTipo: '97', nomeTipo: 'Termo de Execução Descentralizada (TED)' }, CONTEXT);
  assert.ok(ted.ok);
  assert.deepEqual([ted.row.contractTypeId, ted.row.contractTypeName], [9, 'Termo de execução descentralizada']);
  assert.deepEqual(types('tipoDesconhecido'), [8, 'Termo Novo']);
});

test('categoria pelo nome (sem acento nem maiúsculas); a desconhecida fica sem id, com o nome', () => {
  const categories = (name: string) => {
    const { row } = mapped(name);
    return [row.categoryId, row.categoryName];
  };
  assert.deepEqual(categories('categoriaLocacaoImoveis'), [5, 'Locação Imóveis']);
  assert.deepEqual(categories('categoriaInformatica'), [3, 'Informática (TIC)']);
  assert.deepEqual(categories('categoriaMaoDeObra'), [6, 'Mão de Obra']);
  assert.deepEqual(categories('categoriaEngenharia'), [9, 'Serviços de Engenharia']);
  assert.deepEqual(categories('contratoSemPncp'), [8, 'Serviços']);
  assert.deepEqual(categories('empenhoSemCompra'), [2, 'Compras']);
  assert.deepEqual(categories('credenciamento'), [1, 'Cessão']);
  assert.deepEqual(categories('categoriaDesconhecida'), [null, 'Categoria Nova']);
  const shouting = mapFederalContract({ ...raw('contratoSemPncp'), nomeCategoria: '  SERVICOS DE ENGENHARIA ' }, CONTEXT);
  assert.ok(shouting.ok);
  assert.equal(shouting.row.categoryId, 9);
});

test('fornecedor: CNPJ é PJ, CPF fica mascarado, outro formato fica sem tipo e sem documento nulo', () => {
  const cpf = mapped('fornecedorCpf').row;
  assert.deepEqual([cpf.supplierPersonType, cpf.supplierDocument], ['PF', '***.456.789-**']);
  assert.doesNotMatch(JSON.stringify(cpf), /12345678901/, 'o CPF inteiro não vai para o armazém');
  const foreign = mapped('fornecedorEstrangeiro').row;
  assert.deepEqual([foreign.supplierPersonType, foreign.supplierDocument, foreign.supplierName], [null, 'AB1234567', 'ACME TRADING LTD']);
  const none = mapped('fornecedorSemDocumento').row;
  assert.deepEqual([none.supplierPersonType, none.supplierDocument], [null, null]);
  assert.equal(mapped('contratoSemPncp').row.supplierDocument, '38680138000151');
});

test('vigência: sem fim e fim fora do normal entram sem vencimento, contados à parte; fim antes do início fica de fora, contado à parte', () => {
  const withoutEnd = mapped('semFim');
  assert.equal(withoutEnd.withoutExpiry, 'withoutEndDate');
  assert.deepEqual([withoutEnd.row.originalTermEnd, withoutEnd.row.expiresOn], [null, null]);
  const implausible = mapped('fimImplausivel');
  assert.equal(implausible.withoutExpiry, 'implausibleTerm');
  assert.deepEqual([implausible.row.originalTermEnd, implausible.row.expiresOn], [null, null]);
  // Cadastro errado da fonte: não é erro (o ciclo releria a linha toda semana e a execução ficaria sempre "Parcial").
  assert.deepEqual(mapFederalContract(raw('fimAntesDoInicio'), CONTEXT), {
    ok: false,
    kind: 'skipped',
    reason: 'termEndsBeforeStart',
    typeCode: '50',
    includedAt: '2024-01-24T12:27:07',
  });
});

test('valor: zero e negativo viram "sem valor"; o negativo não é erro', () => {
  assert.equal(mapped('valorZero').row.globalValue, null);
  assert.equal(mapped('valorNegativo').row.globalValue, null);
  assert.equal(mapped('acordoCooperacao').row.globalValue, null);
  assert.equal(mapped('empenho').row.globalValue, '11711.57');
  const huge = mapFederalContract({ ...raw('contratoSemPncp'), valorGlobal: 1e20 }, CONTEXT);
  assert.equal(huge.ok, false);
});

test('chave: caractere fora do permitido vira "_", o número sem ano usa o ano do início e o grande demais é recusado', () => {
  assert.equal(federalContractKey('153254', '50', '00586/2023'), 'comprasgov-153254-50-00586/2023');
  assert.equal(mapped('numeroComCaractereEstranho').row.pncpControlNumber, 'comprasgov-153262-50-00908/2024__A_');
  const noYear = mapped('numeroSemAno').row;
  assert.equal(noYear.pncpControlNumber, 'comprasgov-153262-50-000909');
  assert.equal(noYear.contractYear, 2023, 'o ano do início da vigência');
  const tooLong = mapFederalContract(raw('numeroGrandeDemais'), CONTEXT);
  assert.deepEqual(tooLong, { ok: false, kind: 'invalid', reason: 'número do contrato fora do formato da chave' });
  assert.equal(isContractKey(mapped('contratoSemPncp').row.pncpControlNumber), true);
});

test('unidade sem cadastro: entra, só sem UF e município', () => {
  const { row } = mapped('unidadeSemCadastro');
  assert.equal(row.unitCode, '999999');
  assert.equal(row.unitName, 'UNIDADE SEM CADASTRO');
  assert.deepEqual([row.state, row.cityName, row.cityIbgeCode], [null, null, null]);
});

test('o que o PNCP já tem ou não deve entrar é pulado com o motivo, e o tipo vai junto', () => {
  assert.deepEqual(mapFederalContract(raw('contratoComPncp'), CONTEXT), {
    ok: false,
    kind: 'skipped',
    reason: 'withPncpNumber',
    typeCode: '50',
    includedAt: '2023-12-29T10:10:36',
  });
  assert.deepEqual(mapFederalContract(raw('excluido'), CONTEXT), { ok: false, kind: 'skipped', reason: 'excluded', typeCode: '98', includedAt: '2026-04-30T14:18:46' });
  assert.deepEqual(mapFederalContract(raw('incluidoRecente'), CONTEXT), { ok: false, kind: 'skipped', reason: 'recent', typeCode: '50', includedAt: '2026-10-20T10:00:00' });
  assert.deepEqual(mapFederalContract(raw('orgaoSemCnpj'), { ...CONTEXT, agencyCnpj: null }), {
    ok: false,
    kind: 'skipped',
    reason: 'agencyWithoutCnpj',
    typeCode: '50',
    includedAt: '2024-01-24T12:27:07',
  });
});

test('carência: a inclusão no limite ainda entra; um segundo depois, espera', () => {
  const included = String(raw('contratoSemPncp')['dataHoraInclusao']);
  assert.equal(mapFederalContract(raw('contratoSemPncp'), { ...CONTEXT, recentFrom: included }).ok, true);
  const before = mapFederalContract(raw('contratoSemPncp'), { ...CONTEXT, recentFrom: '2024-01-24T12:27:06' });
  assert.ok(!before.ok && before.kind === 'skipped' && before.reason === 'recent');
});

test('linha inválida vira erro com o motivo, sem derrubar nada', () => {
  const reason = (name: string): string => {
    const result = mapFederalContract(raw(name), CONTEXT);
    assert.ok(!result.ok && result.kind === 'invalid', `${name} deveria ser inválida`);
    return result.reason;
  };
  assert.match(reason('semNumero'), /numeroContrato: sem número do contrato/);
  assert.match(reason('dataInvalida'), /dataVigenciaInicial: data fora do formato/);
  const withoutInclusion = mapFederalContract({ ...raw('contratoSemPncp'), dataHoraInclusao: 'ontem' }, CONTEXT);
  assert.ok(!withoutInclusion.ok && withoutInclusion.kind === 'invalid');
  assert.deepEqual(mapFederalContract('texto', CONTEXT).ok, false);
  assert.deepEqual(mapFederalContract(null, CONTEXT).ok, false);
});

test('a linha inválida vem antes do pulo: formato quebrado da fonte aparece mesmo nas excluídas', () => {
  const brokenExcluded = mapFederalContract({ ...raw('excluido'), dataHoraInclusao: 'x' }, CONTEXT);
  assert.ok(!brokenExcluded.ok && brokenExcluded.kind === 'invalid');
});

test('o hash vem dos campos guardados: valorAcumulado e parcelas não mudam o contrato, o objeto muda', () => {
  const base = mapped('contratoSemPncp').row.payloadHash;
  const paid = mapFederalContract({ ...raw('contratoSemPncp'), valorAcumulado: 99999.99, valorParcela: 1, numeroParcelas: 12 }, CONTEXT);
  assert.ok(paid.ok);
  assert.equal(paid.row.payloadHash, base);
  const edited = mapFederalContract({ ...raw('contratoSemPncp'), objeto: 'OUTRO OBJETO' }, CONTEXT);
  assert.ok(edited.ok);
  assert.notEqual(edited.row.payloadHash, base);
  const otherOrder = mapFederalContract(Object.fromEntries(Object.entries(raw('contratoSemPncp')).reverse()), CONTEXT);
  assert.ok(otherOrder.ok);
  assert.equal(otherOrder.row.payloadHash, base, 'a ordem dos campos não conta');
});

test('colisão da chave: vale a inclusão mais recente e, no empate, o maior fim', () => {
  const first = mapped('contratoSemPncp').row;
  const second = mapped('colisaoMaisRecente').row;
  assert.equal(first.pncpControlNumber, second.pncpControlNumber, 'o mesmo contrato registrado duas vezes');
  assert.equal(isLaterRegistration(second, first), true);
  assert.equal(isLaterRegistration(first, second), false);
  const sameInclusion: TenderContractRow = { ...first, expiresOn: '2026-01-01' };
  assert.equal(isLaterRegistration(sameInclusion, first), true, 'empate de inclusão: o de maior fim');
  assert.equal(isLaterRegistration({ ...first, expiresOn: null }, first), false);
  assert.equal(isLaterRegistration(first, { ...first, expiresOn: null }), true, 'com fim vale mais que sem fim');
  assert.equal(isLaterRegistration(first, first), false);
});

test('data e hora da inclusão: lida do registro como veio, nula se não tiver o formato', () => {
  assert.equal(inclusionOf(raw('contratoSemPncp')), '2024-01-24T12:27:07');
  assert.equal(inclusionOf({ dataHoraInclusao: 'ontem' }), null);
  assert.equal(inclusionOf({}), null);
  assert.equal(inclusionOf(null), null);
});

test('nenhuma linha da fixture é igual a outra: a conferência de completude conta linhas distintas', () => {
  const identities = new Set(Object.values(fixture.contratos).map((row) => payloadHash(row)));
  assert.equal(identities.size, Object.keys(fixture.contratos).length);
});

test('todos os casos da fixture mapeiam sem erro inesperado', () => {
  const outcomes = new Map<string, string>();
  for (const name of Object.keys(fixture.contratos)) {
    const result = mapFederalContract(raw(name), CONTEXT);
    outcomes.set(name, result.ok ? 'ok' : result.kind === 'skipped' ? `pulada:${result.reason}` : 'inválida');
  }
  const invalid = [...outcomes].filter(([, outcome]) => outcome === 'inválida').map(([name]) => name).sort();
  assert.deepEqual(invalid, ['dataInvalida', 'numeroGrandeDemais', 'semNumero']);
  const skipped = [...outcomes].filter(([, outcome]) => outcome.startsWith('pulada')).sort();
  assert.deepEqual(skipped, [
    ['contratoComPncp', 'pulada:withPncpNumber'],
    ['contratoComPncpDeOutroCnpjNaCompra', 'pulada:withPncpNumber'],
    ['excluido', 'pulada:excluded'],
    ['fimAntesDoInicio', 'pulada:termEndsBeforeStart'],
    ['incluidoRecente', 'pulada:recent'],
  ]);
  assert.equal(fixture.sinteticos.length > 0, true);
});
