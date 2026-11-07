import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyResults,
  formatCents,
  fromWinnerRecord,
  itemKeyOf,
  itemsJson,
  purchaseParts,
  supplierKeyOf,
  toWinnerRecord,
  winnerKey,
  type ApplyOutcome,
  type ResultRecord,
  type SupplierIdentity,
  type WinnerRow,
} from './winnerRows';
import { WINNER_COLUMNS } from './layout';

// Agregação dos vencedores (winnerRows.ts): função pura, sem DuckDB e sem banco. O "estado" dos testes é a lista de
// linhas gravadas; `settle` aplica o resultado de uma agregação a ela, como o gravador faz com as mudanças.

const NOW = '2026-10-25T12:00:00.000Z';
const PURCHASE = '00394460005887-1-000010/2026';
const OTHER_PURCHASE = '00394460005887-1-000011/2026';

function supplier(document: string, name = `Fornecedor ${document}`): SupplierIdentity {
  return { key: document, personType: 'PJ', document, name, size: 'ME' };
}

const ALFA = supplier('11222333000181', 'ALFA LTDA');
const BETA = supplier('99887766000155', 'BETA LTDA');

function result(itemNumber: number, overrides: Partial<ResultRecord> = {}): ResultRecord {
  return {
    purchaseControlNumber: PURCHASE,
    itemNumber,
    sequence: 1,
    situation: 'winner',
    supplier: ALFA,
    valueCents: 10_000,
    resultDate: '2026-09-14',
    updatedAt: '2026-09-14T10:00:00',
    unitCode: '153103',
    state: 'SP',
    rank: 1,
    cancelledOn: null,
    ...overrides,
  };
}

/** O estado depois de aplicar o resultado: lápides saem, linhas novas e alteradas entram. */
function settle(current: readonly WinnerRow[], outcome: ApplyOutcome): WinnerRow[] {
  const removed = new Set(outcome.removals.map((row) => row.key));
  const replaced = new Map(outcome.upserts.map((row) => [row.key, row]));
  const kept = current.filter((row) => !removed.has(row.key) && !replaced.has(row.key));
  return [...kept, ...replaced.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

function apply(current: readonly WinnerRow[], records: readonly ResultRecord[], now = NOW): { state: WinnerRow[]; outcome: ApplyOutcome } {
  const outcome = applyResults(current, records, now);
  return { state: settle(current, outcome), outcome };
}

const rowOf = (state: readonly WinnerRow[], document: string, purchase = PURCHASE): WinnerRow | undefined =>
  state.find((row) => row.key === winnerKey(document, purchase));

test('item novo: cria a linha do fornecedor com o mapa, os totais e a ligação com a compra', () => {
  const { state, outcome } = apply([], [result(1), result(2, { valueCents: 25_050, resultDate: '2026-09-16' })]);

  assert.deepEqual(outcome.counts, { inserted: 1, updated: 0, removed: 0, unchanged: 0 });
  assert.equal(state.length, 1);
  const row = rowOf(state, ALFA.key);
  assert.ok(row);
  assert.equal(row.key, `${ALFA.key}|${PURCHASE}`);
  assert.equal(row.purchaseYear, 2026);
  assert.equal(row.agencyCnpj, '00394460005887');
  assert.deepEqual(row.items, { '1/1': [100, '2026-09-14'], '2/1': [250.5, '2026-09-16'] });
  assert.equal(row.itemCount, 2);
  assert.equal(row.totalValue, '350.50');
  assert.equal(row.firstResultDate, '2026-09-14');
  assert.equal(row.lastResultDate, '2026-09-16');
  assert.equal(row.firstCollectedAt, NOW);
  assert.equal(row.lastChangedAt, NOW);
  assert.deepEqual([...outcome.alteredRecords].sort(), [0, 1]);
});

test('reler o mesmo resultado não muda nada: nenhuma linha, nenhuma alteração', () => {
  const records = [result(1), result(2)];
  const first = apply([], records);
  const second = apply(first.state, records, '2026-10-26T12:00:00.000Z');

  assert.deepEqual(second.outcome.counts, { inserted: 0, updated: 0, removed: 0, unchanged: 1 });
  assert.equal(second.outcome.upserts.length, 0);
  assert.equal(second.outcome.removals.length, 0);
  assert.equal(second.outcome.alteredRecords.size, 0);
  assert.deepEqual(second.state, first.state, 'a linha segue igual, inclusive a data da última alteração');
});

test('valor corrigido recalcula o total pelo mapa: nunca soma em dobro', () => {
  const first = apply([], [result(1, { valueCents: 10_000 }), result(2, { valueCents: 5_000 })]);
  assert.equal(rowOf(first.state, ALFA.key)?.totalValue, '150.00');

  const corrected = apply(first.state, [result(1, { valueCents: 12_000, updatedAt: '2026-09-20T09:00:00' })], '2026-10-26T12:00:00.000Z');
  const row = rowOf(corrected.state, ALFA.key);
  assert.equal(row?.totalValue, '170.00');
  assert.equal(row?.itemCount, 2);
  assert.equal(row?.firstCollectedAt, NOW, 'a primeira coleta fica');
  assert.equal(row?.lastChangedAt, '2026-10-26T12:00:00.000Z');
  assert.deepEqual(corrected.outcome.counts, { inserted: 0, updated: 1, removed: 0, unchanged: 0 });
  assert.deepEqual(corrected.outcome.updatedKeys, [`${ALFA.key}|${PURCHASE}`]);
  assert.deepEqual([...corrected.outcome.alteredRecords], [0]);
});

test('cancelar um de dois itens tira só a chave dele; cancelar o último gera a lápide', () => {
  const first = apply([], [result(1), result(2)]);

  const cancelOne = apply(first.state, [result(1, { situation: 'cancelled', updatedAt: '2026-09-18T10:00:00' })]);
  assert.deepEqual(Object.keys(rowOf(cancelOne.state, ALFA.key)?.items ?? {}), ['2/1']);
  assert.equal(rowOf(cancelOne.state, ALFA.key)?.totalValue, '100.00');

  const cancelLast = apply(cancelOne.state, [result(2, { situation: 'cancelled', updatedAt: '2026-09-19T10:00:00' })]);
  assert.equal(cancelLast.state.length, 0, 'a linha sem itens sai');
  assert.deepEqual(cancelLast.outcome.counts, { inserted: 0, updated: 0, removed: 1, unchanged: 0 });
  assert.deepEqual(cancelLast.outcome.removedKeys, [`${ALFA.key}|${PURCHASE}`]);
  assert.equal(cancelLast.outcome.removals[0]?.items['2/1']?.[0], 100, 'a lápide leva a linha como estava');
});

test('cancelar item ou linha desconhecidos é ignorado', () => {
  const first = apply([], [result(1)]);
  const unknownItem = apply(first.state, [result(7, { situation: 'cancelled' })]);
  assert.equal(unknownItem.outcome.upserts.length + unknownItem.outcome.removals.length, 0);
  assert.equal(unknownItem.outcome.alteredRecords.size, 0);

  const unknownPurchase = apply(first.state, [result(1, { purchaseControlNumber: OTHER_PURCHASE, situation: 'cancelled' })]);
  assert.deepEqual(unknownPurchase.outcome.counts, { inserted: 0, updated: 0, removed: 0, unchanged: 0 });
  assert.equal(unknownPurchase.state.length, 1);
});

test('troca de fornecedor do mesmo item: move a chave e só esvazia a linha antiga se era a única', () => {
  const single = apply([], [result(1)]);
  const swapped = apply(single.state, [result(1, { supplier: BETA, updatedAt: '2026-09-25T10:00:00' })]);
  assert.equal(rowOf(swapped.state, ALFA.key), undefined, 'a linha do primeiro fornecedor saiu');
  assert.deepEqual(Object.keys(rowOf(swapped.state, BETA.key)?.items ?? {}), ['1/1']);
  assert.deepEqual(swapped.outcome.counts, { inserted: 1, updated: 0, removed: 1, unchanged: 0 });

  const double = apply([], [result(1), result(2)]);
  const swapOne = apply(double.state, [result(2, { supplier: BETA, updatedAt: '2026-09-25T10:00:00' })]);
  assert.deepEqual(Object.keys(rowOf(swapOne.state, ALFA.key)?.items ?? {}), ['1/1']);
  assert.deepEqual(Object.keys(rowOf(swapOne.state, BETA.key)?.items ?? {}), ['2/1']);
  assert.equal(swapOne.state.length, 2);
});

test('cancelado e reinformado com outra sequência: o item novo vale e o cancelado sai', () => {
  const first = apply([], [result(1, { sequence: 1 })]);
  const { state } = apply(first.state, [
    result(1, { sequence: 1, situation: 'cancelled', updatedAt: '2026-09-18T10:00:00' }),
    result(1, { sequence: 2, supplier: BETA, valueCents: 9_000, updatedAt: '2026-09-18T11:00:00' }),
  ]);
  assert.equal(rowOf(state, ALFA.key), undefined);
  assert.deepEqual(rowOf(state, BETA.key)?.items, { '1/2': [90, '2026-09-14'] });
});

test('cancelado que volta a ser informado volta para o mapa', () => {
  const first = apply([], [result(1)]);
  const cancelled = apply(first.state, [result(1, { situation: 'cancelled', updatedAt: '2026-09-18T10:00:00' })]);
  assert.equal(cancelled.state.length, 0);
  const reinstated = apply(cancelled.state, [result(1, { updatedAt: '2026-09-19T10:00:00' })]);
  assert.deepEqual(Object.keys(rowOf(reinstated.state, ALFA.key)?.items ?? {}), ['1/1']);
});

test('retificação de data recalcula a primeira e a última data da linha', () => {
  const first = apply([], [result(1, { resultDate: '2026-09-10' }), result(2, { resultDate: '2026-09-20' })]);
  assert.equal(rowOf(first.state, ALFA.key)?.firstResultDate, '2026-09-10');
  const corrected = apply(first.state, [result(1, { resultDate: '2026-09-25', updatedAt: '2026-09-26T10:00:00' })]);
  const row = rowOf(corrected.state, ALFA.key);
  assert.equal(row?.firstResultDate, '2026-09-20');
  assert.equal(row?.lastResultDate, '2026-09-25');
});

test('cadastro de reserva e outras situações não entram, e tiram o item se ele estava lá', () => {
  const reserveOnly = apply([], [result(1, { situation: 'reserve' }), result(2, { situation: 'other' })]);
  assert.equal(reserveOnly.state.length, 0);
  assert.equal(reserveOnly.outcome.alteredRecords.size, 0, 'nada mudou no estado');

  const first = apply([], [result(1)]);
  const demoted = apply(first.state, [result(1, { situation: 'reserve', updatedAt: '2026-09-18T10:00:00' })]);
  assert.equal(demoted.state.length, 0);
  assert.deepEqual([...demoted.outcome.alteredRecords], [0]);
});

test('dois CPFs mascarados iguais com nomes diferentes na mesma compra geram duas linhas', () => {
  const personA: SupplierIdentity = { key: supplierKeyOf('PF', '***.123.456-**', 'MARIA DA SILVA'), personType: 'PF', document: '***.123.456-**', name: 'MARIA DA SILVA', size: null };
  const personB: SupplierIdentity = { key: supplierKeyOf('PF', '***.123.456-**', 'JOSE DA SILVA'), personType: 'PF', document: '***.123.456-**', name: 'JOSE DA SILVA', size: null };
  assert.notEqual(personA.key, personB.key);

  const { state } = apply([], [result(1, { supplier: personA }), result(2, { supplier: personB })]);
  assert.equal(state.length, 2);
  assert.deepEqual(state.map((row) => row.supplierName).sort(), ['JOSE DA SILVA', 'MARIA DA SILVA']);
});

test('soma exata em centavos: 0,10 mais 0,20 dá 0,30, e valor sem valor conta como zero', () => {
  const { state } = apply([], [result(1, { valueCents: 10 }), result(2, { valueCents: 20 }), result(3, { valueCents: null })]);
  const row = rowOf(state, ALFA.key);
  assert.equal(row?.totalValue, '0.30');
  assert.equal(row?.itemCount, 3, 'o item sem valor existe e conta');
  assert.deepEqual(row?.items['3/1'], [null, '2026-09-14']);
});

test('soma de valores grandes sem perder centavos', () => {
  // Dois itens de quase 10 trilhões (o limite por item é 1e13), com centavos: a soma sai exata.
  const { state } = apply([], [result(1, { valueCents: 999_999_999_999_900 }), result(2, { valueCents: 999_999_999_999_901 })]);
  assert.equal(rowOf(state, ALFA.key)?.totalValue, '19999999999998.01');
});

test('o mesmo item duas vezes no lote: vale a maior atualização, e no empate o último lido', () => {
  const older = result(1, { valueCents: 10_000, updatedAt: '2026-09-14T10:00:00' });
  const newer = result(1, { valueCents: 20_000, updatedAt: '2026-09-15T10:00:00' });
  assert.equal(rowOf(apply([], [older, newer]).state, ALFA.key)?.totalValue, '200.00');
  assert.equal(rowOf(apply([], [newer, older]).state, ALFA.key)?.totalValue, '200.00');

  const tieFirst = result(1, { valueCents: 10_000 });
  const tieLast = result(1, { valueCents: 30_000 });
  assert.equal(rowOf(apply([], [tieFirst, tieLast]).state, ALFA.key)?.totalValue, '300.00');
  const { outcome } = apply([], [tieFirst, tieLast]);
  assert.deepEqual([...outcome.alteredRecords], [1], 'só o registro que valeu mudou o estado');
});

test('as compras do lote são independentes: cancelar numa não mexe na outra', () => {
  const first = apply([], [result(1), result(1, { purchaseControlNumber: OTHER_PURCHASE })]);
  assert.equal(first.state.length, 2);
  const { state } = apply(first.state, [result(1, { situation: 'cancelled' })]);
  assert.equal(state.length, 1);
  assert.equal(state[0]?.purchaseControlNumber, OTHER_PURCHASE);
});

test('os dados do fornecedor corrigidos na fonte atualizam a linha (nome e porte de PJ)', () => {
  const first = apply([], [result(1)]);
  const renamed = apply(first.state, [result(1, { supplier: { ...ALFA, name: 'ALFA S/A', size: 'Demais' }, updatedAt: '2026-09-20T10:00:00' })]);
  const row = rowOf(renamed.state, ALFA.key);
  assert.equal(row?.supplierName, 'ALFA S/A');
  assert.equal(row?.supplierSize, 'Demais');
  assert.deepEqual(renamed.outcome.counts, { inserted: 0, updated: 1, removed: 0, unchanged: 0 });
});

test('o porte e a unidade da linha vêm do primeiro item, em qualquer ordem e em qualquer divisão em lotes (o caso real: ME nos itens de um dia e Demais nos do outro)', () => {
  // Itens 1 e 5 do dia 29 com "Demais"; 2, 3 e 4 do dia 28 com "ME" e outra unidade: como na fonte real.
  const demais = { ...ALFA, size: 'Demais' };
  const records = [
    result(1, { supplier: demais, resultDate: '2026-09-29', unitCode: '782801', updatedAt: '2026-09-29T09:45:59' }),
    result(2, { supplier: ALFA, resultDate: '2026-09-28', unitCode: '999999', updatedAt: '2026-09-29T09:45:59' }),
    result(3, { supplier: ALFA, resultDate: '2026-09-28', unitCode: '999999', updatedAt: '2026-09-29T09:45:21' }),
    result(4, { supplier: ALFA, resultDate: '2026-09-28', unitCode: '999999', updatedAt: '2026-09-29T09:45:20' }),
    result(5, { supplier: demais, resultDate: '2026-09-29', unitCode: '782801', updatedAt: '2026-09-29T09:45:21' }),
  ];
  const baseline = rowOf(apply([], records).state, ALFA.key);
  assert.equal(baseline?.supplierSize, 'Demais', 'o item 1 manda');
  assert.equal(baseline?.unitCode, '782801');

  // Por dia (a coleta lê um dia por vez), do mais novo ao mais antigo e ao contrário, e uma leitura em duas partes.
  const day29 = [records[0] as ResultRecord, records[4] as ResultRecord];
  const day28 = [records[1] as ResultRecord, records[2] as ResultRecord, records[3] as ResultRecord];
  for (const batches of [[day29, day28], [day28, day29], [[records[4] as ResultRecord], [records[1] as ResultRecord, records[3] as ResultRecord], [records[0] as ResultRecord], [records[2] as ResultRecord]]]) {
    let state: WinnerRow[] = [];
    for (const batch of batches) {
      state = apply(state, batch).state;
    }
    assert.deepEqual(rowOf(state, ALFA.key), baseline);
  }

  // Reler um dia sozinho, com a linha já gravada, não muda nada: nem o porte nem a unidade vão para a do outro dia.
  assert.equal(apply(apply([], records).state, day28).outcome.upserts.length, 0);
  assert.equal(apply(apply([], records).state, day29).outcome.upserts.length, 0);
});

test('um item de número menor que chega depois passa a mandar no fornecedor da linha; um maior não', () => {
  const first = apply([], [result(3, { supplier: { ...ALFA, size: 'EPP' }, unitCode: '333' })]);
  assert.equal(rowOf(first.state, ALFA.key)?.supplierSize, 'EPP');

  const later = apply(first.state, [result(5, { supplier: { ...ALFA, size: 'Demais' }, unitCode: '555' })]);
  assert.equal(rowOf(later.state, ALFA.key)?.supplierSize, 'EPP', 'o item 5 não é o primeiro');
  assert.equal(rowOf(later.state, ALFA.key)?.unitCode, '333');

  const lower = apply(later.state, [result(2, { supplier: { ...ALFA, size: 'ME' }, unitCode: '222' })]);
  assert.equal(rowOf(lower.state, ALFA.key)?.supplierSize, 'ME', 'o item 2 passa a ser o primeiro');
  assert.equal(rowOf(lower.state, ALFA.key)?.unitCode, '222');
  assert.deepEqual(Object.keys(JSON.parse(itemsJson(rowOf(lower.state, ALFA.key)?.items ?? {})) as object), ['2/1', '3/1', '5/1']);
});

test('sem o primeiro item (cancelado), a linha guarda o fornecedor até o novo primeiro item ser lido', () => {
  const first = apply([], [result(1, { supplier: { ...ALFA, size: 'Demais' } }), result(2, { supplier: { ...ALFA, size: 'ME' } })]);
  const cancelled = apply(first.state, [result(1, { situation: 'cancelled', updatedAt: '2026-09-18T10:00:00' })]);
  assert.equal(rowOf(cancelled.state, ALFA.key)?.supplierSize, 'Demais', 'ainda é o do item cancelado');
  assert.equal(cancelled.outcome.counts.updated, 1);

  // Quando o item 2, agora o primeiro, é lido de novo, a linha passa a ter o porte dele.
  const reread = apply(cancelled.state, [result(2, { supplier: { ...ALFA, size: 'ME' } })]);
  assert.equal(rowOf(reread.state, ALFA.key)?.supplierSize, 'ME');
});

test('chaves: PJ é o CNPJ; as outras levam o documento mascarado e um hash curto do nome', () => {
  assert.equal(supplierKeyOf('PJ', '11222333000181', 'ALFA'), '11222333000181');
  const person = supplierKeyOf('PF', '***.123.456-**', 'Maria da Silva');
  assert.match(person, /^\*\*\*\.123\.456-\*\*#[0-9a-f]{8}$/);
  // O nome entra sem acento, em maiúsculas e com espaços simples.
  assert.equal(supplierKeyOf('PF', '***.123.456-**', '  MARIA  DA SILVÁ '), supplierKeyOf('PF', '***.123.456-**', 'maria da silva'));
  assert.match(supplierKeyOf('PF', null, 'Maria'), /^sem-documento#[0-9a-f]{8}$/);
  assert.match(supplierKeyOf('PE', 'AB 12|3#4', 'Foreign Co'), /^AB-12-3-4#[0-9a-f]{8}$/, 'o texto da pessoa estrangeira é saneado');
  // PJ sem CNPJ válido cai no caminho das outras pessoas.
  assert.match(supplierKeyOf('PJ', null, 'Sem CNPJ'), /^sem-documento#/);
  assert.equal(winnerKey('11222333000181', PURCHASE), `11222333000181|${PURCHASE}`);
  assert.equal(itemKeyOf(3, 2), '3/2');
});

test('número de controle: CNPJ do órgão e ano da compra; fora do formato, nada', () => {
  assert.deepEqual(purchaseParts(PURCHASE), { agencyCnpj: '00394460005887', year: 2026 });
  assert.equal(purchaseParts('formato-diferente-123'), null);
  assert.equal(purchaseParts('00394460005887-1-000010/26'), null);
});

test('o mapa de itens sai em ordem numérica: 2/1 antes de 10/1', () => {
  assert.equal(
    itemsJson({ '10/1': [1, '2026-09-14'], '2/1': [2, '2026-09-14'], '2/10': [3, '2026-09-14'], '2/2': [4, '2026-09-14'] }),
    '{"2/1":[2,"2026-09-14"],"2/2":[4,"2026-09-14"],"2/10":[3,"2026-09-14"],"10/1":[1,"2026-09-14"]}',
  );
});

test('centavos como reais com 2 casas, sem ponto flutuante', () => {
  assert.equal(formatCents(0n), '0.00');
  assert.equal(formatCents(5n), '0.05');
  assert.equal(formatCents(123_456_789n), '1234567.89');
  assert.equal(formatCents(-250n), '-2.50');
});

test('linha do arquivo de ida e volta: as colunas na ordem dos arquivos e o mapa em JSON', () => {
  const { state } = apply([], [result(1), result(10, { valueCents: 505 }), result(2)]);
  const row = state[0];
  assert.ok(row);
  const record = toWinnerRecord(row);
  assert.deepEqual(Object.keys(record), WINNER_COLUMNS.map((spec) => spec.column));
  assert.equal(record['itens'], itemsJson(row.items));
  assert.equal(record['valor_homologado_total'], '205.05');
  // O DECIMAL e o DATE chegam do DuckDB como texto; o resto, como número.
  assert.deepEqual(fromWinnerRecord(record), row);
  assert.throws(() => fromWinnerRecord({ ...record, itens: '[1,2]' }), /fora do formato/);
  assert.throws(() => fromWinnerRecord({ ...record, itens: '{"1/1":["x","2026-09-14"]}' }), /fora do formato/);
});

// ---- Propriedades: a ordem do lote e a leitura parcial não mudam o estado final ----

/** Gerador pseudoaleatório com semente fixa (mulberry32), para o teste ser repetível. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

const STATES = ['SP', 'RJ', 'MG'];
const SIZES = ['ME', 'EPP', 'Demais'];

/** O mesmo fornecedor com o nome e o porte que a fonte traz num item: eles variam de um item para outro (medido na fonte real). */
function describedAs(base: SupplierIdentity, counter: number): SupplierIdentity {
  return { ...base, name: `${base.name} ${counter % 3}`, size: SIZES[counter % SIZES.length] ?? null };
}

function scenario(): ResultRecord[] {
  const gamma = supplier('55444333000122', 'GAMA LTDA');
  const records: ResultRecord[] = [];
  const purchases = [PURCHASE, OTHER_PURCHASE, '00394460005887-1-000012/2025'];
  const suppliers = [ALFA, BETA, gamma];
  const situations: ResultRecord['situation'][] = ['winner', 'winner', 'winner', 'cancelled', 'reserve', 'other'];
  let counter = 0;
  for (const purchase of purchases) {
    for (let item = 1; item <= 6; item += 1) {
      for (let sequence = 1; sequence <= 2; sequence += 1) {
        counter += 1;
        records.push(
          result(item, {
            purchaseControlNumber: purchase,
            sequence,
            // O porte, o nome e a unidade mudam de um item para outro da mesma linha, como na fonte real.
            supplier: describedAs(suppliers[counter % suppliers.length] as SupplierIdentity, counter),
            unitCode: `15${counter % 4}`,
            state: STATES[counter % STATES.length] ?? null,
            situation: situations[counter % situations.length] as ResultRecord['situation'],
            valueCents: counter % 7 === 0 ? null : counter * 137 + 1,
            resultDate: `2026-09-${String(10 + (counter % 15)).padStart(2, '0')}`,
            updatedAt: `2026-09-${String(10 + (counter % 15)).padStart(2, '0')}T${String(counter % 24).padStart(2, '0')}:00:00`,
          }),
        );
      }
    }
  }
  return records;
}

test('propriedade: mil permutações do mesmo conjunto dão o mesmo estado', () => {
  const records = scenario();
  const baseline = apply([], records).state;
  assert.ok(baseline.length > 3, 'o cenário gera várias linhas');

  const random = seeded(20_261_025);
  for (let round = 0; round < 1_000; round += 1) {
    const state = apply([], shuffled(records, random)).state;
    assert.deepEqual(state, baseline, `permutação ${round}`);
  }
});

test('propriedade: aplicar em lotes na ordem que for dá o mesmo estado que aplicar tudo de uma vez', () => {
  const records = scenario();
  const baseline = apply([], records).state;
  const random = seeded(42);
  for (let round = 0; round < 200; round += 1) {
    const order = shuffled(records, random);
    const cut = Math.floor(random() * order.length);
    let state: WinnerRow[] = [];
    for (const batch of [order.slice(0, cut), order.slice(cut)]) {
      state = apply(state, batch).state;
    }
    assert.deepEqual(state, baseline, `corte ${cut}, rodada ${round}`);
  }
});

test('propriedade: leitura parcial seguida da completa dá o estado da completa', () => {
  const records = scenario();
  const baseline = apply([], records).state;
  const random = seeded(7);
  for (let round = 0; round < 200; round += 1) {
    const partial = shuffled(records, random).slice(0, Math.floor(random() * records.length));
    const afterPartial = apply([], partial).state;
    assert.deepEqual(apply(afterPartial, records).state, baseline, `rodada ${round}`);
  }
});

test('propriedade: reler tudo de novo não muda nenhuma linha', () => {
  const records = scenario();
  const first = apply([], records);
  const again = apply(first.state, shuffled(records, seeded(3)));
  assert.equal(again.outcome.upserts.length, 0);
  assert.equal(again.outcome.removals.length, 0);
  assert.equal(again.outcome.alteredRecords.size, 0);
  assert.deepEqual(again.state, first.state);
});
