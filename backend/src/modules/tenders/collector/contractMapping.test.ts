import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { contractExpiryFromTerms, hasChangeSignal, mapPncpContract, supplierDocument, type MappedContract } from './contractMapping';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')) as T;
}

// Página real de /v1/contratos de 30/09/2026 (fornecedores pessoa física anonimizados).
const page = fixture<{ data: Record<string, unknown>[] }>('contratos-page.json');

function realRecord(controlNumber: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const record = page.data.find((item) => item.numeroControlePNCP === controlNumber);
  if (!record) {
    assert.fail(`registro ${controlNumber} não está na fixture`);
  }
  return { ...record, ...overrides };
}

const PJ_CONTRACT = '03353358000196-2-000216/2026';
const PF_CONTRACT = '42521088000137-2-000037/2026';

function assertMapped(mapped: MappedContract) {
  if (mapped.ok !== true) {
    assert.fail(`deveria ser gravado: ${JSON.stringify(mapped)}`);
  }
  return mapped;
}

function assertInvalid(mapped: MappedContract, reason: RegExp): void {
  assert.equal(mapped.ok, false);
  if (mapped.ok === false) {
    assert.match(mapped.reason, reason);
  }
}

test('contrato real (termo inicial de 1 ano) vira a linha do contrato', () => {
  const { row, hasChangeSignal: signal } = assertMapped(mapPncpContract(realRecord(PJ_CONTRACT)));
  assert.equal(row.pncpControlNumber, PJ_CONTRACT);
  assert.equal(row.agencyCnpj, '03353358000196');
  assert.equal(row.contractYear, 2026);
  assert.equal(row.contractSequence, 216);
  assert.equal(row.categoryId, 2);
  assert.equal(row.termStart, '2026-09-29');
  assert.equal(row.originalTermEnd, '2027-09-29');
  assert.equal(row.expiresOn, '2027-09-29', 'sem termos conferidos, vale o fim original');
  assert.equal(row.amendments, null);
  assert.equal(row.supplierPersonType, 'PJ');
  assert.match(row.supplierDocument ?? '', /^\d{14}$/);
  assert.match(row.payloadHash, /^[0-9a-f]{64}$/);
  assert.equal(signal, false);
});

test('empenho e "Outros" ficam de fora sem contar erro', () => {
  assert.deepEqual(mapPncpContract(realRecord('08036157000189-2-000354/2026')), { ok: 'skipped', reason: 'notInitialTerm' });
  assert.deepEqual(mapPncpContract(realRecord('17577524000142-2-000090/2026')), { ok: 'skipped', reason: 'notInitialTerm' });
  assert.deepEqual(mapPncpContract({ objetoContrato: 'sem tipo' }), { ok: 'skipped', reason: 'notInitialTerm' });
});

test('vigência original: 180 dias entram, 179 ficam de fora', () => {
  const at180 = mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaInicio: '2026-01-01', dataVigenciaFim: '2026-06-30' }));
  assert.equal(at180.ok, true);
  const at179 = mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaInicio: '2026-01-01', dataVigenciaFim: '2026-06-29' }));
  assert.deepEqual(at179, { ok: 'skipped', reason: 'shortTerm' });
  // Registro real com 4 meses de vigência.
  assert.deepEqual(mapPncpContract(realRecord('03236066000173-2-000147/2026')), { ok: 'skipped', reason: 'shortTerm' });
});

test('registro inválido conta erro com o número de controle e o motivo', () => {
  assertInvalid(mapPncpContract(realRecord(PJ_CONTRACT, { numeroControlePNCP: '' })), /número de controle/);
  assertInvalid(mapPncpContract(realRecord(PJ_CONTRACT, { orgaoEntidade: { cnpj: '123' } })), /14 dígitos/);
  assertInvalid(mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaInicio: '29/09/2026' })), /AAAA-MM-DD/);
  assertInvalid(mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaInicio: '1989-12-31' })), /antes de 1990/);
  assertInvalid(mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaFim: '2026-02-30' })), /AAAA-MM-DD/);
  assertInvalid(mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaFim: '2026-09-01' })), /antes do início/);

  const invalid = mapPncpContract(realRecord(PJ_CONTRACT, { orgaoEntidade: { cnpj: '123' } }));
  assert.equal(invalid.ok === false ? invalid.controlNumber : null, PJ_CONTRACT);
});

test('sem data de fim e vigência de mais de 35 anos ficam de fora sem contar erro (dado que falta na origem)', () => {
  assert.deepEqual(mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaFim: null })), { ok: 'skipped', reason: 'withoutEndDate' });
  assert.deepEqual(mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaFim: '' })), { ok: 'skipped', reason: 'withoutEndDate' });
  // Vistos no piloto: 2227 no lugar de 2027, e água e energia com 2100 e 3024.
  assert.deepEqual(mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaFim: '2227-09-24' })), { ok: 'skipped', reason: 'implausibleTerm' });
  assert.deepEqual(mapPncpContract(realRecord(PJ_CONTRACT, { dataVigenciaFim: '7203-01-01' })), { ok: 'skipped', reason: 'implausibleTerm' });
});

test('data opcional vazia vale como não informada', () => {
  const { row } = assertMapped(mapPncpContract(realRecord(PJ_CONTRACT, { dataAssinatura: '', dataAtualizacaoGlobal: '' })));
  assert.equal(row.signedAt, null);
  assert.equal(row.pncpGlobalUpdatedAt, null);
});

test('fornecedor pessoa física: o CPF fica só mascarado (registro real anonimizado)', () => {
  const { row } = assertMapped(mapPncpContract(realRecord(PF_CONTRACT)));
  assert.equal(row.supplierPersonType, 'PF');
  assert.equal(row.supplierDocument, '***.456.789-**');
  assert.equal(supplierDocument('PF', '123.456.789-09'), '***.456.789-**');
  assert.equal(supplierDocument('PF', '1234'), null, 'CPF sem 11 dígitos não é guardado');
  assert.equal(supplierDocument('PJ', '11.222.333/0001-81'), '11222333000181');
  assert.equal(supplierDocument('PE', ' EXT-998 '), 'EXT-998');
});

test('valor 0 e negativo viram nulo', () => {
  const { row } = assertMapped(mapPncpContract(realRecord(PJ_CONTRACT, { valorInicial: 0, valorGlobal: -10 })));
  assert.equal(row.initialValue, null);
  assert.equal(row.globalValue, null);
  const valued = assertMapped(mapPncpContract(realRecord(PJ_CONTRACT, { valorGlobal: 1234.5 })));
  assert.equal(valued.row.globalValue, '1234.50');
});

test('hash estável: a ordem das chaves do registro não muda o hash', () => {
  const record = realRecord(PJ_CONTRACT);
  const reversed = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(assertMapped(mapPncpContract(record)).row.payloadHash, assertMapped(mapPncpContract(reversed)).row.payloadHash);
  const changed = assertMapped(mapPncpContract({ ...record, objetoContrato: 'Outro objeto' }));
  assert.notEqual(changed.row.payloadHash, assertMapped(mapPncpContract(record)).row.payloadHash);
});

test('sinal de alteração: atualização global mais de 24 h depois da publicação', () => {
  assert.equal(hasChangeSignal('2026-09-30T07:00:00', '2026-10-01T07:00:00'), false, '24 h exatas não contam');
  assert.equal(hasChangeSignal('2026-09-30T07:00:00', '2026-10-01T07:00:01'), true);
  assert.equal(hasChangeSignal('2026-09-30T07:13:35', '2026-09-30T07:23:43'), false);
  assert.equal(hasChangeSignal('2026-09-30T07:00:00', null), false);
  const { hasChangeSignal: signal } = assertMapped(mapPncpContract(realRecord(PJ_CONTRACT, { dataAtualizacaoGlobal: '2026-10-09T10:00:00' })));
  assert.equal(signal, true);
});

test('vencimento: a prorrogação do aditivo vale (registro real)', () => {
  // 83831719000100-2-000007/2024: fim em 31/12/2025 no contrato e em 31/12/2026 no aditivo.
  const expiry = contractExpiryFromTerms('2025-12-31', fixture<unknown[]>('termos-prorrogacao.json'));
  assert.equal(expiry.expiresOn, '2026-12-31');
  assert.deepEqual(expiry.invalidTerms, []);
  assert.deepEqual(expiry.amendments, [
    { type: 'Termo Aditivo', number: '7/2024-1', sequence: 1, signedAt: '2025-12-12', endDate: '2026-12-31', addedValue: null, changesTerm: true },
  ]);
});

test('vencimento: vale o termo mais recente que muda a vigência; apostilamento e aditivo sem prazo não contam (registro real)', () => {
  // 19 termos: aditivos de prazo nos sequenciais 4, 7 e 18; reajustes e apostilamentos nos demais.
  const expiry = contractExpiryFromTerms('2025-06-03', fixture<unknown[]>('termos-aditivos-e-apostilamentos.json'));
  assert.equal(expiry.expiresOn, '2026-12-03');
  assert.equal(expiry.amendments.length, 15, 'os 4 apostilamentos ficam fora do resumo');
  assert.deepEqual(
    expiry.amendments.filter((term) => term.changesTerm).map((term) => term.sequence),
    [4, 7, 18],
  );
  assert.deepEqual(expiry.invalidTerms, []);
});

const term = (overrides: Record<string, unknown>) => ({
  tipoTermoContratoNome: 'Termo Aditivo',
  sequencialTermoContrato: 1,
  dataAssinatura: '2026-01-10',
  dataVigenciaFim: null,
  qualificacaoVigencia: false,
  ...overrides,
});

test('vencimento: rescisão vale o fim informado ou, sem ele, a data de assinatura', () => {
  const withEnd = contractExpiryFromTerms('2027-12-31', [
    term({ tipoTermoContratoNome: 'Termo de Rescisão', dataAssinatura: '2026-05-02', dataVigenciaFim: '2026-05-31' }),
  ]);
  assert.equal(withEnd.expiresOn, '2026-05-31');
  const withoutEnd = contractExpiryFromTerms('2027-12-31', [term({ tipoTermoContratoNome: 'Termo de Rescisão', dataAssinatura: '2026-05-02' })]);
  assert.equal(withoutEnd.expiresOn, '2026-05-02');
});

test('vencimento: apostilamento com prazo é ignorado', () => {
  const expiry = contractExpiryFromTerms('2026-12-31', [
    term({ tipoTermoContratoNome: 'Termo de Apostilamento', qualificacaoVigencia: true, dataVigenciaFim: '2030-01-01' }),
  ]);
  assert.equal(expiry.expiresOn, '2026-12-31');
  assert.deepEqual(expiry.amendments, []);
});

test('vencimento: na mesma data de assinatura, vale o sequencial maior', () => {
  const expiry = contractExpiryFromTerms('2026-12-31', [
    term({ sequencialTermoContrato: 3, qualificacaoVigencia: true, dataAssinatura: '2026-06-01', dataVigenciaFim: '2028-06-01' }),
    term({ sequencialTermoContrato: 2, qualificacaoVigencia: true, dataAssinatura: '2026-06-01', dataVigenciaFim: '2027-06-01' }),
  ]);
  assert.equal(expiry.expiresOn, '2028-06-01');
});

test('vencimento: termo com data fora do formato mantém o vencimento anterior e conta erro', () => {
  const expiry = contractExpiryFromTerms('2026-12-31', [
    term({ sequencialTermoContrato: 1, qualificacaoVigencia: true, dataAssinatura: '2026-01-10', dataVigenciaFim: '2027-12-31' }),
    term({ sequencialTermoContrato: 2, qualificacaoVigencia: true, dataAssinatura: '2026-03-10', dataVigenciaFim: '31/12/2028' }),
  ]);
  assert.equal(expiry.expiresOn, '2027-12-31');
  assert.equal(expiry.invalidTerms.length, 1);
  assert.match(expiry.invalidTerms[0] ?? '', /termo 2: data de fim fora do formato/);
  assert.equal(expiry.undatedTerms, 0);
});

test('vencimento: aditivo de prazo sem a data nova mantém o vencimento anterior e conta à parte, sem erro', () => {
  // Visto no piloto: "prorrogação da vigência" com qualificacaoVigencia e sem dataVigenciaFim.
  const expiry = contractExpiryFromTerms('2026-12-31', [
    term({ sequencialTermoContrato: 1, qualificacaoVigencia: true, dataAssinatura: '2026-01-10', dataVigenciaFim: '2027-12-31' }),
    term({ sequencialTermoContrato: 2, qualificacaoVigencia: true, dataAssinatura: '2026-03-10', dataVigenciaFim: null }),
    term({ sequencialTermoContrato: 3, qualificacaoVigencia: true, dataAssinatura: '2026-04-10', dataVigenciaFim: '' }),
  ]);
  assert.equal(expiry.expiresOn, '2027-12-31');
  assert.deepEqual(expiry.invalidTerms, []);
  assert.equal(expiry.undatedTerms, 2);
});

test('vencimento: sem termos, vale o fim original', () => {
  assert.deepEqual(contractExpiryFromTerms('2026-12-31', []), { expiresOn: '2026-12-31', amendments: [], invalidTerms: [], undatedTerms: 0 });
});
