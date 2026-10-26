import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRACT_COLUMNS,
  CONTRACT_DATASETS,
  MAX_ROWS_PER_FILE,
  PART_KEY,
  PURCHASE_CONTROL_NUMBER,
  ROW_ORDER,
  STORE_DATASETS,
  SUPPLIER_COLUMNS,
  WINNER_COLUMNS,
  WINNER_PARTITION,
  columnsOf,
  contractOriginOf,
  fromStoreRecord,
  isContractKey,
  storeFileKey,
  toStoreRecord,
  type ContractSearchFields,
} from './layout';
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
  // Os vencedores ficam na mesma pasta do armazém, para a limpeza do bucket e a da cópia local protegerem os arquivos pelo manifesto.
  assert.equal(storeFileKey('vencedores', '2026', '4410.2', 3), 'contratos/arquivos/vencedores/2026/v4410.2-0003.parquet');
});

test('conjunto vencedores: colunas próprias, ordem e chave das partes pela chave da linha, e nada mais cai nas colunas de contratos', () => {
  const winners = columnsOf('vencedores');
  assert.equal(winners, WINNER_COLUMNS);
  assert.notEqual(winners, CONTRACT_COLUMNS);
  assert.equal(columnsOf('contratos'), CONTRACT_COLUMNS);
  assert.equal(columnsOf('vigentes'), CONTRACT_COLUMNS);
  assert.equal(columnsOf('fornecedor'), SUPPLIER_COLUMNS);
  assert.equal(PART_KEY.vencedores, 'chave');
  assert.equal(ROW_ORDER.vencedores, 'chave');
  assert.equal(WINNER_PARTITION, 'CAST(ano_compra AS VARCHAR)');
  assert.ok(MAX_ROWS_PER_FILE.vencedores > 0);
  // A chave é a primeira coluna e todas as colunas têm tipo.
  assert.equal(winners[0]?.column, 'chave');
  assert.ok(winners.every((spec) => spec.type.length > 0));
  assert.equal(new Set(winners.map((spec) => spec.column)).size, winners.length, 'sem coluna repetida');
});

test('os conjuntos de contratos são os três de antes, e os vencedores ficam fora deles', () => {
  assert.deepEqual([...CONTRACT_DATASETS], ['vigentes', 'contratos', 'fornecedor']);
  assert.deepEqual([...STORE_DATASETS], [...CONTRACT_DATASETS, 'vencedores']);
});

test('o número de controle da compra: CNPJ do órgão, sequencial sem zeros à esquerda e ano', () => {
  const match = PURCHASE_CONTROL_NUMBER.exec('03353358000196-1-000216/2026');
  assert.deepEqual([match?.[1], match?.[2], match?.[3]], ['03353358000196', '216', '2026']);
  assert.equal(PURCHASE_CONTROL_NUMBER.test('03353358000196-1-000216/26'), false);
});

test('origem do contrato pela chave: a do PNCP começa pelo CNPJ, a federal por comprasgov-', () => {
  assert.equal(contractOriginOf('03353358000196-2-000216/2026'), 'NATIONAL');
  assert.equal(contractOriginOf('comprasgov-153254-50-00586/2023'), 'FEDERAL');
});

test('chave do contrato: o número de controle do PNCP ou comprasgov-<unidade>-<tipo>-<número>; qualquer outra coisa não entra em consulta', () => {
  const valid = [
    '03353358000196-2-000216/2026',
    '00394460005887-1-1234567/2021',
    'comprasgov-153254-50-00586/2023',
    'comprasgov-153254-99-2024NE000014',
    'comprasgov-1-8-A_b.c-1/2',
  ];
  for (const key of valid) {
    assert.equal(isContractKey(key), true, key);
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
    'comprasgov-98765',
    'comprasgov-153254-50',
    'comprasgov-153254-50-',
    "comprasgov-153254-50-00586/2023'",
    'comprasgov-153254-50-00586 2023',
    'comprasgov-153254-50-00586/2023\n',
    `comprasgov-153254-50-${'9'.repeat(41)}`,
    'comprasgov-12345678901-50-1',
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
