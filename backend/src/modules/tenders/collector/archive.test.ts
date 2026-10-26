import assert from 'node:assert/strict';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage as memoryStorage } from '../objectStorageTestSupport';
import { ARCHIVE_DATASETS, RunArchive, archiveKey } from './archive';
import { createCollectorLogger } from './logger';

const NOW = new Date('2026-10-18T09:15:00.000Z');

function runArchive(storage: ObjectStorage | null, options: { partBytes?: number; failures?: unknown[] } = {}) {
  return new RunArchive({
    storage,
    runId: 4321,
    day: '2026-10-18',
    now: () => NOW,
    logger: createCollectorLogger('error', () => {}),
    onFailure: (failure) => options.failures?.push(failure),
    ...(options.partBytes !== undefined ? { partBytes: options.partBytes } : {}),
  });
}

/** As linhas de uma parte, descompactadas. */
function linesOf(body: Uint8Array | undefined): unknown[] {
  assert.ok(body, 'a parte foi enviada');
  return gunzipSync(body)
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
}

test('chave: fonte, conjunto, dia da coleta, execução e parte com 4 dígitos', () => {
  assert.equal(archiveKey(ARCHIVE_DATASETS.contracts, '2026-10-18', 4321, 1), 'pncp/contratos/2026/10/18/4321-0001.jsonl.gz');
  assert.equal(archiveKey(ARCHIVE_DATASETS.contractTerms, '2026-01-05', 7, 12), 'pncp/contratos-termos/2026/01/05/7-0012.jsonl.gz');
  assert.equal(archiveKey(ARCHIVE_DATASETS.notices, '2026-10-18', 4321, 3), 'pncp/editais/2026/10/18/4321-0003.jsonl.gz');
  // Os resultados das licitações têm a pasta da fonte deles.
  assert.equal(archiveKey(ARCHIVE_DATASETS.results, '2026-10-26', 77, 2), 'comprasgov/resultados/2026/10/26/77-0002.jsonl.gz');
});

test('descarregar o arquivo mais de uma vez numera as partes em sequência, sem repetir (a carga de vencedores faz isso antes de cada publicação)', async () => {
  const { storage, objects } = memoryStorage();
  const archive = runArchive(storage);
  await archive.append(ARCHIVE_DATASETS.results, [{ idCompraItem: 'a' }]);
  await archive.flush();
  await archive.append(ARCHIVE_DATASETS.results, [{ idCompraItem: 'b' }, { idCompraItem: 'c' }]);
  await archive.flush();
  await archive.flush();
  assert.deepEqual([...objects.keys()].sort(), ['comprasgov/resultados/2026/10/18/4321-0001.jsonl.gz', 'comprasgov/resultados/2026/10/18/4321-0002.jsonl.gz']);
  assert.deepEqual(archive.summary(), { enabled: true, files: 2, records: 3, bytes: archive.summary()?.bytes ?? 0, failures: 0 });
});

test('JSON Lines compactado de ida e volta: o registro como veio, com o momento da coleta', async () => {
  const { storage, objects } = memoryStorage();
  const archive = runArchive(storage);
  const contracts = [{ numeroControlePNCP: 'A-1', valorGlobal: 10.5 }, { numeroControlePNCP: 'A-2', objetoContrato: 'Limpeza ç ã' }];

  await archive.append(ARCHIVE_DATASETS.contracts, contracts);
  await archive.append(ARCHIVE_DATASETS.contractTerms, [[{ sequencialTermoContrato: 1 }]], { controlNumber: 'A-1' });
  await archive.append(ARCHIVE_DATASETS.contractTerms, [null], { controlNumber: 'A-2' });
  assert.equal(objects.size, 0, 'parte pequena só vai no fim');
  await archive.flush();

  const collectedAt = '2026-10-18T09:15:00.000Z';
  assert.deepEqual([...objects.keys()].sort(), ['pncp/contratos-termos/2026/10/18/4321-0001.jsonl.gz', 'pncp/contratos/2026/10/18/4321-0001.jsonl.gz']);
  assert.deepEqual(
    linesOf(objects.get('pncp/contratos/2026/10/18/4321-0001.jsonl.gz')),
    contracts.map((record) => ({ collectedAt, record })),
  );
  assert.deepEqual(linesOf(objects.get('pncp/contratos-termos/2026/10/18/4321-0001.jsonl.gz')), [
    { collectedAt, controlNumber: 'A-1', record: [{ sequencialTermoContrato: 1 }] },
    { collectedAt, controlNumber: 'A-2', record: null },
  ]);

  const bytes = [...objects.values()].reduce((total, body) => total + body.length, 0);
  assert.deepEqual(archive.summary(), { enabled: true, files: 2, records: 4, bytes, failures: 0 });
});

test('parte nova ao passar do tamanho da parte, numerada em sequência; o resto vai no fim', async () => {
  const { storage, objects } = memoryStorage();
  const archive = runArchive(storage, { partBytes: 200 });
  const records = Array.from({ length: 7 }, (_, index) => ({ numeroControlePNCP: `B-${index}`, objeto: 'x'.repeat(60) }));

  for (const record of records) {
    await archive.append(ARCHIVE_DATASETS.notices, [record]);
  }
  await archive.flush();

  const keys = [...objects.keys()];
  assert.deepEqual(keys, keys.slice().sort(), 'enviadas na ordem das partes');
  assert.ok(keys.length >= 3, `várias partes (${keys.length})`);
  keys.forEach((key, index) => assert.equal(key, archiveKey(ARCHIVE_DATASETS.notices, '2026-10-18', 4321, index + 1)));
  const archived = keys.flatMap((key) => linesOf(objects.get(key)).map((line) => (line as { record: unknown }).record));
  assert.deepEqual(archived, records, 'nenhum registro perdido nem repetido');
  assert.equal(archive.summary()?.records, 7);
});

test('desligado: nada é enviado, e o resumo diz que está desligado', async () => {
  const archive = runArchive(null);
  await archive.append(ARCHIVE_DATASETS.contracts, [{ numeroControlePNCP: 'C-1' }]);
  await archive.flush();
  assert.deepEqual(archive.summary(), { enabled: false, files: 0, records: 0, bytes: 0, failures: 0 });
});

test('execução que não passa pelo arquivo não tem resumo', async () => {
  const { storage } = memoryStorage();
  const archive = runArchive(storage);
  await archive.flush();
  assert.equal(archive.summary(), null);
});

test('falha no envio: conta a falha, descarta a parte e segue com a próxima', async () => {
  const { storage, objects } = memoryStorage((key) => key.endsWith('-0001.jsonl.gz'));
  const failures: unknown[] = [];
  const archive = runArchive(storage, { partBytes: 100, failures });

  await archive.append(ARCHIVE_DATASETS.contracts, [{ numeroControlePNCP: 'D-1', objeto: 'y'.repeat(80) }]);
  await archive.append(ARCHIVE_DATASETS.contracts, [{ numeroControlePNCP: 'D-2', objeto: 'y'.repeat(80) }]);
  await archive.flush();

  assert.deepEqual(failures, [{ key: 'pncp/contratos/2026/10/18/4321-0001.jsonl.gz', message: 'R2 fora do ar' }]);
  assert.deepEqual([...objects.keys()], ['pncp/contratos/2026/10/18/4321-0002.jsonl.gz']);
  assert.deepEqual(
    linesOf(objects.get('pncp/contratos/2026/10/18/4321-0002.jsonl.gz')).map((line) => (line as { record: { numeroControlePNCP: string } }).record.numeroControlePNCP),
    ['D-2'],
  );
  const summary = archive.summary();
  assert.equal(summary?.files, 1);
  assert.equal(summary?.records, 1);
  assert.equal(summary?.failures, 1);
});
