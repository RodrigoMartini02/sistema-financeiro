import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { createR2Storage } from './objectStorage';

interface ReceivedRequest {
  method: string | undefined;
  url: URL;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

const BUCKET = 'licitacoes-dados';
const LIST_PAGE_SIZE = 2;

function xmlError(code: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;
}

/**
 * S3 local para o cliente do R2: guarda os objetos enviados, responde download,
 * listagem paginada (de 2 em 2) e exclusão, e anota cada pedido. Com `status`,
 * recusa tudo com esse código.
 */
async function withFakeS3(run: (endpoint: string, requests: ReceivedRequest[]) => Promise<void>, status = 200): Promise<void> {
  const requests: ReceivedRequest[] = [];
  const objects = new Map<string, Buffer>();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const body = Buffer.concat(chunks);
      requests.push({ method: request.method, url, headers: request.headers, body });
      if (status !== 200) {
        response.writeHead(status, { 'content-type': 'application/xml' }).end(xmlError('AccessDenied', 'Access Denied'));
        return;
      }
      const key = decodeURIComponent(url.pathname.slice(`/${BUCKET}/`.length));
      if (request.method === 'PUT') {
        objects.set(key, body);
        response.writeHead(200, { etag: '"teste"' }).end();
      } else if (request.method === 'DELETE') {
        objects.delete(key);
        response.writeHead(204).end();
      } else if (url.searchParams.get('list-type') === '2') {
        const prefix = url.searchParams.get('prefix') ?? '';
        const keys = [...objects.keys()].filter((name) => name.startsWith(prefix)).sort();
        const start = Number(url.searchParams.get('continuation-token') ?? 0);
        const page = keys.slice(start, start + LIST_PAGE_SIZE);
        const truncated = start + LIST_PAGE_SIZE < keys.length;
        response.writeHead(200, { 'content-type': 'application/xml' }).end(
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
            `<Name>${BUCKET}</Name><Prefix>${prefix}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>1000</MaxKeys>` +
            `<IsTruncated>${truncated}</IsTruncated>` +
            page.map((name) => `<Contents><Key>${name}</Key><Size>${objects.get(name)?.length ?? 0}</Size></Contents>`).join('') +
            (truncated ? `<NextContinuationToken>${start + LIST_PAGE_SIZE}</NextContinuationToken>` : '') +
            `</ListBucketResult>`,
        );
      } else {
        const stored = objects.get(key);
        if (!stored) {
          response.writeHead(404, { 'content-type': 'application/xml' }).end(xmlError('NoSuchKey', 'The specified key does not exist.'));
          return;
        }
        response.writeHead(200, { 'content-length': stored.length }).end(stored);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const fakeSettings = { bucket: BUCKET, accessKeyId: 'chave-de-teste', secretAccessKey: 'segredo-de-teste', prefix: 'local' };

test('R2: o envio é um PUT assinado na pasta do ambiente, com o corpo e o tipo, sem checksum a mais', async () => {
  await withFakeS3(async (endpoint, requests) => {
    const storage = createR2Storage({ endpoint, ...fakeSettings });
    const body = gzipSync('{"record":1}\n');
    try {
      await storage.putObject('pncp/contratos/2026/10/18/1-0001.jsonl.gz', body, 'application/gzip');
    } finally {
      storage.close();
    }

    assert.equal(requests.length, 1);
    const [request] = requests;
    assert.equal(request?.method, 'PUT');
    // O SDK acrescenta ?x-id=PutObject: vale o caminho.
    assert.equal(request?.url.pathname, '/licitacoes-dados/local/pncp/contratos/2026/10/18/1-0001.jsonl.gz');
    assert.equal(request?.headers['content-type'], 'application/gzip');
    assert.match(String(request?.headers.authorization), /^AWS4-HMAC-SHA256 Credential=chave-de-teste\/\d{8}\/auto\/s3\/aws4_request/);
    assert.deepEqual(
      Object.keys(request?.headers ?? {}).filter((name) => name.startsWith('x-amz-checksum') || name === 'x-amz-sdk-checksum-algorithm'),
      [],
    );
    assert.deepEqual(request?.body, body);
  });
});

test('R2: lê, baixa para arquivo, lista (todas as páginas) e apaga, só dentro da pasta do ambiente', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'r2-teste-'));
  try {
    await withFakeS3(async (endpoint) => {
      const local = createR2Storage({ endpoint, ...fakeSettings });
      const production = createR2Storage({ endpoint, ...fakeSettings, prefix: 'producao' });
      try {
        await production.putObject('contratos/manifesto.json', Buffer.from('{"producao":true}'), 'application/json');
        for (const name of ['a', 'b', 'c']) {
          await local.putObject(`contratos/arquivos/${name}.parquet`, Buffer.from(name), 'application/vnd.apache.parquet');
        }
        await local.putObject('contratos/manifesto.json', Buffer.from('{"versao":1}'), 'application/json');

        assert.equal(Buffer.from((await local.getObject('contratos/manifesto.json')) ?? []).toString(), '{"versao":1}');
        assert.equal(await local.getObject('contratos/inexistente.json'), null, 'objeto que não existe: null');
        assert.deepEqual(await local.listKeys('contratos/'), [
          'contratos/arquivos/a.parquet',
          'contratos/arquivos/b.parquet',
          'contratos/arquivos/c.parquet',
          'contratos/manifesto.json',
        ]);

        const filePath = join(directory, 'sub', 'b.parquet');
        await local.downloadToFile('contratos/arquivos/b.parquet', filePath);
        assert.equal(await readFile(filePath, 'utf8'), 'b');

        await local.deleteObject('contratos/arquivos/a.parquet');
        assert.deepEqual(await local.listKeys('contratos/arquivos/'), ['contratos/arquivos/b.parquet', 'contratos/arquivos/c.parquet']);
        assert.equal(Buffer.from((await production.getObject('contratos/manifesto.json')) ?? []).toString(), '{"producao":true}', 'a produção não muda');
      } finally {
        local.close();
        production.close();
      }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('R2: resposta de erro vira exceção, sem as chaves na mensagem', async () => {
  await withFakeS3(async (endpoint) => {
    const storage = createR2Storage({ endpoint, ...fakeSettings });
    try {
      await assert.rejects(storage.putObject('pncp/editais/2026/10/18/1-0001.jsonl.gz', gzipSync('{}\n'), 'application/gzip'), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Access Denied/);
        assert.doesNotMatch(error.message, /segredo-de-teste/);
        return true;
      });
      await assert.rejects(storage.getObject('contratos/manifesto.json'), /Access Denied/, 'erro que não é "não existe" continua erro');
    } finally {
      storage.close();
    }
  }, 403);
});
