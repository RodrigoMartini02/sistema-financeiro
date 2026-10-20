import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTRACT_COLUMNS, SUPPLIER_COLUMNS, fromStoreRecord, isContractKey, storeFileKey, toStoreRecord, type ContractSearchFields } from './layout';
import { sampleContract } from './storeTestSupport';

const searchFields: ContractSearchFields = {
  stems: ' servic limpez ',
  numberGroups: ['7', '2026'],
  processGroups: ['2026'],
  controlGroups: ['394460005887', '2', '7', '2026'],
  purchaseGroups: [],
};

test('linha do armazém de ida e volta: todos os campos, termos em JSON e a referência com 19 caracteres', () => {
  const amendments = [
    { type: 'Termo Aditivo', number: '1', sequence: 1, signedAt: '2026-09-01', endDate: '2028-01-10', addedValue: '500.00', changesTerm: true },
  ];
  const contract = {
    ...sampleContract(7, { amendments, amendmentsReference: '2026-10-05T10:00:00.123', expiresOn: '2028-01-10' }),
    firstCollectedAt: '2026-10-19T12:00:00.000Z',
    lastCollectedAt: '2026-10-19T12:00:00.000Z',
  };

  const record = toStoreRecord(contract, searchFields);
  assert.deepEqual(Object.keys(record), CONTRACT_COLUMNS.map((spec) => spec.column), 'as colunas na ordem dos arquivos');
  assert.equal(record['aditivos'], JSON.stringify(amendments));
  assert.equal(record['aditivos_referencia'], '2026-10-05T10:00:00');
  assert.equal(record['radicais'], ' servic limpez ');
  assert.deepEqual(record['grupos_controle'], ['394460005887', '2', '7', '2026']);

  assert.deepEqual(fromStoreRecord(record), { ...contract, amendmentsReference: '2026-10-05T10:00:00' });
});

test('termos não conferidos (null) continuam null; conferidos sem termo ficam []', () => {
  const unchecked = toStoreRecord({ ...sampleContract(1), firstCollectedAt: 'a', lastCollectedAt: 'b' }, searchFields);
  assert.equal(unchecked['aditivos'], null);
  assert.equal(fromStoreRecord(unchecked).amendments, null);

  const checked = toStoreRecord({ ...sampleContract(2, { amendments: [] }), firstCollectedAt: 'a', lastCollectedAt: 'b' }, searchFields);
  assert.equal(checked['aditivos'], '[]');
  assert.deepEqual(fromStoreRecord(checked).amendments, []);
});

test('conjunto fornecedor: só colunas que existem nos contratos', () => {
  const contractColumns = new Set(CONTRACT_COLUMNS.map((spec) => spec.column));
  for (const spec of SUPPLIER_COLUMNS) {
    assert.ok(contractColumns.has(spec.column), spec.column);
  }
});

test('nome do arquivo: conjunto, pasta, versão e sequência com 4 dígitos', () => {
  assert.equal(storeFileKey('contratos', '2026', '3331.1', 7), 'contratos/arquivos/contratos/2026/v3331.1-0007.parquet');
  assert.equal(storeFileKey('vigentes', '2026-10-19', '12.2', 1), 'contratos/arquivos/vigentes/2026-10-19/v12.2-0001.parquet');
});

test('chave do contrato: o número de controle do PNCP ou comprasgov-<id>; qualquer outra coisa não entra em consulta', () => {
  for (const valid of ['03353358000196-2-000216/2026', '00394460005887-1-1234567/2021', 'comprasgov-98765']) {
    assert.equal(isContractKey(valid), true, valid);
  }
  const invalid = [
    '',
    '1',
    '03353358000196-2-000216',
    '03353358000196-2-000216/26',
    '3353358000196-2-000216/2026',
    "03353358000196-2-000216/2026'",
    "03353358000196-2-000216/2026'; DROP TABLE contrato; --",
    '03353358000196-2-000216/2026\n',
    'comprasgov-',
    'comprasgov-abc',
    '../03353358000196-2-000216/2026',
    `${'1'.repeat(14)}-2-${'3'.repeat(60)}/2026`,
    null,
    undefined,
    2026,
    {},
  ];
  for (const value of invalid) {
    assert.equal(isContractKey(value), false, String(value));
  }
});
