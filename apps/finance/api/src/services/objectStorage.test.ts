import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createR2Storage } from './objectStorage';

interface ReceivedRequest {
  method: string | undefined;
  url: URL;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

const BUCKET = 'anexos-dados';
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
    const body = Buffer.from('conteúdo do anexo');
    try {
      await storage.putObject('anexos/abc', body, 'application/pdf');
    } finally {
      storage.close();
    }

    assert.equal(requests.length, 1);
    const [request] = requests;
    assert.equal(request?.method, 'PUT');
    // O SDK acrescenta ?x-id=PutObject: vale o caminho.
    assert.equal(request?.url.pathname, '/anexos-dados/local/anexos/abc');
    assert.equal(request?.headers['content-type'], 'application/pdf');
    assert.match(String(request?.headers.authorization), /^AWS4-HMAC-SHA256 Credential=chave-de-teste\/\d{8}\/auto\/s3\/aws4_request/);
    assert.deepEqual(
      Object.keys(request?.headers ?? {}).filter((name) => name.startsWith('x-amz-checksum') || name === 'x-amz-sdk-checksum-algorithm'),
      [],
    );
    assert.deepEqual(request?.body, body);
  });
});

test('R2: o envio leva Content-Disposition e Cache-Control só quando informados', async () => {
  await withFakeS3(async (endpoint, requests) => {
    const storage = createR2Storage({ endpoint, ...fakeSettings });
    try {
      await storage.putObject('anexos/a', Buffer.from('%PDF-1.7'), 'application/pdf', {
        contentDisposition: `inline; filename="nota.pdf"; filename*=UTF-8''nota.pdf`,
        cacheControl: 'private, no-store',
      });
      await storage.putObject('anexos/b', Buffer.from('b'), 'text/plain');
    } finally {
      storage.close();
    }

    const [withHeaders, withoutHeaders] = requests;
    assert.equal(withHeaders?.headers['content-type'], 'application/pdf');
    assert.equal(withHeaders?.headers['content-disposition'], `inline; filename="nota.pdf"; filename*=UTF-8''nota.pdf`);
    assert.equal(withHeaders?.headers['cache-control'], 'private, no-store');
    assert.equal(withoutHeaders?.headers['content-disposition'], undefined);
    assert.equal(withoutHeaders?.headers['cache-control'], undefined);
  });
});

test('R2: o link assinado é calculado sem chamar o R2, vale o tempo pedido e baixa sem credencial', async () => {
  await withFakeS3(async (endpoint, requests) => {
    const storage = createR2Storage({ endpoint, ...fakeSettings });
    try {
      await storage.putObject('anexos/abc', Buffer.from('conteúdo do anexo'), 'text/plain');
      requests.length = 0;

      const link = await storage.signedGetUrl?.('anexos/abc', 120);
      assert.ok(link, 'o cliente real assina links');
      assert.equal(requests.length, 0, 'assinar não chama o R2');

      const url = new URL(link);
      assert.equal(url.origin, endpoint);
      assert.equal(url.pathname, '/anexos-dados/local/anexos/abc');
      assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
      assert.equal(url.searchParams.get('X-Amz-Expires'), '120');
      assert.match(url.searchParams.get('X-Amz-Credential') ?? '', /^chave-de-teste\/\d{8}\/auto\/s3\/aws4_request$/);
      assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
      assert.doesNotMatch(link, /segredo-de-teste/, 'o segredo nunca vai no link');

      const response = await fetch(link);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'conteúdo do anexo');
      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.headers.authorization, undefined, 'quem abre o link não manda credencial: a assinatura está na URL');
    } finally {
      storage.close();
    }
  });
});

test('R2: lê, lista (todas as páginas) e apaga, só dentro da pasta do ambiente', async () => {
  await withFakeS3(async (endpoint) => {
    const local = createR2Storage({ endpoint, ...fakeSettings });
    const production = createR2Storage({ endpoint, ...fakeSettings, prefix: 'producao' });
    try {
      await production.putObject('anexos/manifesto', Buffer.from('producao'), 'text/plain');
      for (const name of ['a', 'b', 'c']) {
        await local.putObject(`anexos/arquivos/${name}`, Buffer.from(name), 'text/plain');
      }
      await local.putObject('anexos/manifesto', Buffer.from('local'), 'text/plain');

      assert.equal(Buffer.from((await local.getObject('anexos/manifesto')) ?? []).toString(), 'local');
      assert.equal(await local.getObject('anexos/inexistente'), null, 'objeto que não existe: null');
      assert.deepEqual(await local.listKeys('anexos/'), ['anexos/arquivos/a', 'anexos/arquivos/b', 'anexos/arquivos/c', 'anexos/manifesto']);

      await local.deleteObject('anexos/arquivos/a');
      assert.deepEqual(await local.listKeys('anexos/arquivos/'), ['anexos/arquivos/b', 'anexos/arquivos/c']);
      assert.equal(Buffer.from((await production.getObject('anexos/manifesto')) ?? []).toString(), 'producao', 'a produção não muda');
    } finally {
      local.close();
      production.close();
    }
  });
});

test('R2: resposta de erro vira exceção, sem as chaves na mensagem', async () => {
  await withFakeS3(async (endpoint) => {
    const storage = createR2Storage({ endpoint, ...fakeSettings });
    try {
      await assert.rejects(storage.putObject('anexos/recusado', Buffer.from('abc'), 'text/plain'), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Access Denied/);
        assert.doesNotMatch(error.message, /segredo-de-teste/);
        return true;
      });
      await assert.rejects(storage.getObject('anexos/manifesto'), /Access Denied/, 'erro que não é "não existe" continua erro');
    } finally {
      storage.close();
    }
  }, 403);
});
