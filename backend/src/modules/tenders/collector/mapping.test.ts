import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { mapPncpRecord, payloadHash, type TenderNoticeRow } from './mapping';

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

function pageRecords(name: string): Record<string, unknown>[] {
  return (readFixture(name) as { data: Record<string, unknown>[] }).data;
}

function mapOk(record: unknown): TenderNoticeRow {
  const mapped = mapPncpRecord(record);
  if (!mapped.ok) {
    assert.fail(`registro deveria ser válido: ${mapped.reason}`);
  }
  return mapped.row;
}

test('página real do endpoint proposta: todos os registros viram linha', () => {
  const records = pageRecords('proposta-page.json');
  assert.equal(records.length, 10);
  for (const record of records) {
    mapOk(record);
  }
});

test('página real do endpoint atualizacao: todos os registros viram linha', () => {
  for (const record of pageRecords('atualizacao-page.json')) {
    mapOk(record);
  }
});

test('campos do registro: tamanhos, textos aparados, vazios nulos, datas sem fuso e link do PNCP', () => {
  const [record] = pageRecords('proposta-page.json');
  const row = mapOk(record);

  assert.equal(row.pncpControlNumber, '45132495000140-1-000942/2024');
  assert.equal(row.agencyCnpj, '45132495000140');
  assert.equal(row.agencyName, 'MUNICIPIO DE LIMEIRA');
  assert.equal(row.governmentSphere, 'M');
  assert.equal(row.state, 'SP');
  assert.equal(row.cityName, 'Limeira');
  assert.equal(row.cityIbgeCode, '3526902');
  assert.equal(row.unitCode, '1');
  assert.equal(row.unitName, 'PREFEITURA MUNICIPAL DE LIMEIRA');
  assert.equal(row.modalityId, 6);
  assert.equal(row.modalityName, 'Pregão - Eletrônico');
  assert.equal(row.disputeModeId, 1);
  assert.equal(row.situationId, 1);
  assert.equal(row.purchaseYear, 2024);
  assert.equal(row.purchaseSequence, 942);
  assert.equal(row.purchaseNumber, '00180');
  assert.equal(row.processNumber, 'E00180');
  assert.equal(row.procurementObject, 'SISTEMA DE COMBATE A INCENDIO');
  assert.equal(row.additionalInformation, null);
  assert.equal(row.isPriceRegistration, false);
  assert.equal(row.estimatedTotalValue, '200895.14');
  assert.equal(row.publishedAt, '2024-11-05T09:02:18');
  assert.equal(row.proposalOpensAt, '2026-09-25T09:30:00');
  assert.equal(row.proposalClosesAt, '2026-10-20T09:30:00');
  assert.equal(row.pncpUpdatedAt, '2026-09-24T09:45:28');
  assert.equal(row.sourceSystemLink, null);
  assert.equal(row.pncpLink, 'https://pncp.gov.br/app/editais/45132495000140/2024/942');
  assert.deepEqual(row.payload, record);
  assert.match(row.payloadHash, /^[0-9a-f]{64}$/);
});

test('valor estimado 0 (sigiloso ou não informado) fica nulo', () => {
  const row = mapOk(readFixture('record-without-estimated-value.json'));
  assert.equal(row.estimatedTotalValue, null);
});

test('valor estimado negativo (erro na origem) fica nulo, sem perder o edital', () => {
  const [record] = pageRecords('proposta-page.json');
  assert.equal(mapOk({ ...record, valorTotalEstimado: -1500 }).estimatedTotalValue, null);
  assert.equal(mapOk({ ...record, valorTotalEstimado: '-0.01' }).estimatedTotalValue, null);
});

test('situação diferente de 1 é gravada como veio, em número ou texto', () => {
  const suspended = readFixture('record-suspended.json') as Record<string, unknown>;
  assert.equal(mapOk(suspended).situationId, 4);
  assert.equal(mapOk({ ...suspended, situacaoCompraId: '4' }).situationId, 4);
});

test('campos ausentes ou nulos continuam nulos', () => {
  const [record] = pageRecords('proposta-page.json');
  const row = mapOk({
    ...record,
    unidadeOrgao: null,
    valorTotalEstimado: null,
    srp: null,
    dataEncerramentoProposta: null,
    anoCompra: null,
  });
  assert.equal(row.state, null);
  assert.equal(row.cityIbgeCode, null);
  assert.equal(row.estimatedTotalValue, null);
  assert.equal(row.isPriceRegistration, null);
  assert.equal(row.proposalClosesAt, null);
  assert.equal(row.pncpLink, null);
});

test('hash estável: a ordem das chaves não muda o hash, o conteúdo muda', () => {
  const [record] = pageRecords('proposta-page.json');
  const reversed = Object.fromEntries(Object.entries(record ?? {}).reverse());
  assert.equal(payloadHash(reversed), payloadHash(record));
  assert.notEqual(payloadHash({ ...record, objetoCompra: 'OUTRO OBJETO' }), payloadHash(record));
});

test('registro inválido vira erro com o número de controle, sem exceção', () => {
  const [record] = pageRecords('proposta-page.json');

  const withoutControlNumber = mapPncpRecord({ ...record, numeroControlePNCP: undefined });
  assert.equal(withoutControlNumber.ok, false);

  const invalidState = mapPncpRecord({ ...record, unidadeOrgao: { ufSigla: 'SPX' } });
  assert.equal(invalidState.ok, false);
  if (!invalidState.ok) {
    assert.equal(invalidState.controlNumber, '45132495000140-1-000942/2024');
    assert.match(invalidState.reason, /UF/);
  }

  assert.equal(mapPncpRecord({ ...record, orgaoEntidade: { cnpj: '123' } }).ok, false);
  assert.equal(mapPncpRecord({ ...record, valorTotalEstimado: 1e17 }).ok, false);
  assert.equal(mapPncpRecord({ ...record, dataEncerramentoProposta: '20/10/2026' }).ok, false);
  assert.equal(mapPncpRecord('não é objeto').ok, false);
});
