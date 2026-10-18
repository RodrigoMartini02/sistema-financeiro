import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ARCHIVE_DATASETS, RunArchive, archiveKey, createR2Storage, type ArchiveStorage } from './archive';
import { createCollectorLogger } from './logger';

const NOW = new Date('2026-10-18T09:15:00.000Z');

/** R2 simulado: guarda cada parte enviada; `fails` recusa as chaves indicadas. */
function memoryStorage(fails: (key: string) => boolean = () => false) {
  const objects = new Map<string, Uint8Array>();
  const storage: ArchiveStorage = {
    async putObject(key, body) {
      if (fails(key)) {
        throw new Error('R2 fora do ar');
      }
      objects.set(key, body);
    },
    close: () => {},
  };
  return { storage, objects };
}

function runArchive(storage: ArchiveStorage | null, options: { partBytes?: number; failures?: unknown[] } = {}) {
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

interface ReceivedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** S3 local para o cliente do R2: anota cada pedido e responde com `status`. */
async function withFakeS3(status: number, run: (endpoint: string, requests: ReceivedRequest[]) => Promise<void>): Promise<void> {
  const requests: ReceivedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks) });
      if (status === 200) {
        response.writeHead(200, { etag: '"teste"' }).end();
        return;
      }
      response
        .writeHead(status, { 'content-type': 'application/xml' })
        .end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const fakeCredentials = { bucket: 'licitacoes-dados', accessKeyId: 'chave-de-teste', secretAccessKey: 'segredo-de-teste' };

test('R2: o envio é um PUT assinado na chave do bucket, com o corpo e o tipo, sem checksum a mais', async () => {
  await withFakeS3(200, async (endpoint, requests) => {
    const storage = createR2Storage({ endpoint, ...fakeCredentials });
    const body = gzipSync('{"record":1}\n');
    try {
      await storage.putObject('pncp/contratos/2026/10/18/1-0001.jsonl.gz', body);
    } finally {
      storage.close();
    }

    assert.equal(requests.length, 1);
    const [request] = requests;
    assert.equal(request?.method, 'PUT');
    // O SDK acrescenta ?x-id=PutObject: vale o caminho.
    assert.equal(new URL(request?.url ?? '', endpoint).pathname, '/licitacoes-dados/pncp/contratos/2026/10/18/1-0001.jsonl.gz');
    assert.equal(request?.headers['content-type'], 'application/gzip');
    assert.match(String(request?.headers.authorization), /^AWS4-HMAC-SHA256 Credential=chave-de-teste\/\d{8}\/auto\/s3\/aws4_request/);
    assert.deepEqual(
      Object.keys(request?.headers ?? {}).filter((name) => name.startsWith('x-amz-checksum') || name === 'x-amz-sdk-checksum-algorithm'),
      [],
    );
    assert.deepEqual(request?.body, body);
  });
});

test('R2: resposta de erro vira exceção, sem as chaves na mensagem', async () => {
  await withFakeS3(403, async (endpoint) => {
    const storage = createR2Storage({ endpoint, ...fakeCredentials });
    try {
      await assert.rejects(storage.putObject('pncp/editais/2026/10/18/1-0001.jsonl.gz', gzipSync('{}\n')), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Access Denied/);
        assert.doesNotMatch(error.message, /segredo-de-teste/);
        return true;
      });
    } finally {
      storage.close();
    }
  });
});
