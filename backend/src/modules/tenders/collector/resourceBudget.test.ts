import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { CollectorResourceBudget, CollectorResourceLimitError, measureCollectorDisk, type CollectorDiskUsage } from './resourceBudget';

const usage = (totalBytes: number): CollectorDiskUsage => ({
  totalBytes, parquetBytes: totalBytes, databaseBytes: 0, walBytes: 0, temporaryBytes: 0, otherBytes: 0, files: 1,
});

test('orçamento: reserva a publicação e o próximo arquivo antes de admitir trabalho', async () => {
  let used = 50;
  const budget = new CollectorResourceBudget({ directory: 'nao-usado', limitBytes: 100, publicationReserveBytes: 20, sampleDisk: async () => usage(used) });
  assert.equal(await budget.canContinue(30), true, 'a fronteira exata ainda cabe');
  assert.equal(await budget.canContinue(31), false);
  assert.equal(await budget.availableTempBytes(), 30);
  await assert.rejects(budget.check('download', 40, 20), (error: unknown) => {
    assert.ok(error instanceof CollectorResourceLimitError);
    assert.equal(error.reason, 'disk');
    assert.equal(error.usedBytes, 50);
    assert.equal(error.requiredBytes, 60);
    return true;
  });
  used = 110;
  assert.equal(await budget.availableTempBytes(), 0);
  assert.equal(budget.summary().limitExceeded, true);
});

test('orçamento: falha de medição não autoriza novo trabalho com capacidade desconhecida', async () => {
  const budget = new CollectorResourceBudget({
    directory: 'nao-usado',
    sampleDisk: async () => { throw new Error('medição indisponível'); },
  });
  await assert.rejects(budget.canContinue(), /medição indisponível/);
  assert.equal(budget.summary().measurementFailures, 1);
  assert.equal(budget.summary().last, null);
});

test('orçamento: amostra o pico durante uma operação, sem deixar timer depois dela', async () => {
  let used = 10;
  let calls = 0;
  const budget = new CollectorResourceBudget({
    directory: 'nao-usado', limitBytes: 100, publicationReserveBytes: 10, sampleIntervalMs: 5,
    sampleDisk: async () => { calls += 1; return usage(used); },
  });
  assert.equal(await budget.measure('consulta', async () => {
    used = 90;
    await delay(30);
    used = 10;
    return 'publicado';
  }), 'publicado');
  assert.equal(budget.summary().peakBytes, 90);
  assert.equal(budget.summary().last?.totalBytes, 10);
  const after = calls;
  await delay(20);
  assert.equal(calls, after);
});

test('orçamento: a métrica final não esconde o erro original nem uma operação confirmada', async () => {
  let fail = false;
  const budget = new CollectorResourceBudget({ directory: 'nao-usado', sampleDisk: async () => {
    if (fail) {
      throw new Error('falha da métrica');
    }
    return usage(10);
  } });
  await assert.rejects(budget.measure('consulta', async () => {
    fail = true;
    throw new Error('erro original');
  }), /erro original/);
  fail = false;
  assert.equal(await budget.measure('manifesto', async () => {
    fail = true;
    return 'confirmado';
  }), 'confirmado');
  assert.equal(budget.summary().measurementFailures, 2);
});

test('medição: soma componentes e arquivos de outras etapas sem seguir links de diretórios', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcamento-coletor-'));
  try {
    // Um ancestral chamado tmp não transforma todos os arquivos da raiz em spill.
    const root = join(directory, 'tmp', 'execucao');
    const outside = join(directory, 'fora');
    await mkdir(join(root, 'tmp'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, 'atual.parquet'), Buffer.alloc(11));
    await writeFile(join(root, 'trabalho.duckdb'), Buffer.alloc(12));
    await writeFile(join(root, 'trabalho.duckdb.wal'), Buffer.alloc(13));
    await writeFile(join(root, 'tmp', 'duckdb_temp_storage-0.tmp'), Buffer.alloc(14));
    await writeFile(join(root, 'outra-etapa.json'), Buffer.alloc(15));
    await writeFile(join(outside, 'fora.parquet'), Buffer.alloc(100_000));
    await symlink(outside, join(root, 'link'), 'junction');
    const result = await measureCollectorDisk(root);
    assert.equal(result.files, 5);
    assert.ok(result.parquetBytes >= 11);
    assert.ok(result.parquetBytes < 100_000, 'o arquivo do diretório externo fica fora da medição');
    assert.ok(result.databaseBytes >= 12);
    assert.ok(result.walBytes >= 13);
    assert.ok(result.temporaryBytes >= 14);
    assert.ok(result.otherBytes >= 15);
    assert.equal(result.totalBytes, result.parquetBytes + result.databaseBytes + result.walBytes + result.temporaryBytes + result.otherBytes);
    assert.equal((await measureCollectorDisk(join(root, 'ainda-nao-criada'))).totalBytes, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
