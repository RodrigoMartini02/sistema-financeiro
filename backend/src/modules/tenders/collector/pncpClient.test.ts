import assert from 'node:assert/strict';
import test from 'node:test';
import { PncpClient, PncpRequestError, type PncpClientOptions, type PncpPage } from './pncpClient';

type FakeReply = Response | Error;

function pageResponse(pageNumber: number, remainingPages: number, records: unknown[] = [{ numeroControlePNCP: `x-${pageNumber}` }]): Response {
  return new Response(
    JSON.stringify({
      data: records,
      totalRegistros: records.length * (pageNumber + remainingPages),
      totalPaginas: pageNumber + remainingPages,
      numeroPagina: pageNumber,
      paginasRestantes: remainingPages,
      empty: records.length === 0,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function timeoutError(): Error {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  return error;
}

function createFakeClient(replies: FakeReply[], overrides: Partial<PncpClientOptions> = {}) {
  const requestedUrls: string[] = [];
  const sleeps: number[] = [];
  const queue = [...replies];
  const client = new PncpClient({
    baseUrl: 'https://pncp.example/api/consulta',
    pageSize: 50,
    requestIntervalMs: 0,
    timeoutMs: 30_000,
    maxAttempts: 5,
    random: () => 0,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
    fetch: async (input) => {
      requestedUrls.push(String(input));
      const reply = queue.shift();
      if (!reply) {
        throw new Error('fetch simulado sem resposta preparada');
      }
      if (reply instanceof Error) {
        throw reply;
      }
      return reply;
    },
    ...overrides,
  });
  return { client, requestedUrls, sleeps };
}

async function collectPages(iterable: AsyncIterable<PncpPage>): Promise<PncpPage[]> {
  const pages: PncpPage[] = [];
  for await (const page of iterable) {
    pages.push(page);
  }
  return pages;
}

test('pagina até paginasRestantes = 0, sempre com modalidade e tamanho de página', async () => {
  const { client, requestedUrls } = createFakeClient([pageResponse(1, 2), pageResponse(2, 1), pageResponse(3, 0)]);
  const pages = await collectPages(client.pages('proposta', { dataFinal: '20261204', codigoModalidadeContratacao: 6 }));

  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((page) => page.pageNumber), [1, 2, 3]);
  assert.equal(requestedUrls.length, 3);
  const firstUrl = new URL(requestedUrls[0] ?? '');
  assert.equal(firstUrl.pathname, '/api/consulta/v1/contratacoes/proposta');
  assert.equal(firstUrl.searchParams.get('codigoModalidadeContratacao'), '6');
  assert.equal(firstUrl.searchParams.get('dataFinal'), '20261204');
  assert.equal(firstUrl.searchParams.get('tamanhoPagina'), '50');
  assert.equal(firstUrl.searchParams.get('pagina'), '1');
  assert.equal(new URL(requestedUrls[2] ?? '').searchParams.get('pagina'), '3');
});

test('HTTP 204 é página vazia e encerra a paginação', async () => {
  const { client, requestedUrls } = createFakeClient([new Response(null, { status: 204 })]);
  const pages = await collectPages(client.pages('publicacao', { codigoModalidadeContratacao: 8 }));

  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0]?.records, []);
  assert.equal(requestedUrls.length, 1);
});

test('maxPages limita a coleta manual', async () => {
  const { client } = createFakeClient([pageResponse(1, 5), pageResponse(2, 4)]);
  const pages = await collectPages(client.pages('proposta', { codigoModalidadeContratacao: 6 }, { maxPages: 2 }));
  assert.equal(pages.length, 2);
});

test('repete em HTTP 500 com backoff exponencial e conta as requisições', async () => {
  const retries: number[] = [];
  const { client, sleeps } = createFakeClient(
    [new Response('erro', { status: 500 }), new Response('erro', { status: 502 }), pageResponse(1, 0)],
    { onRetry: (info) => retries.push(info.attempt) },
  );
  const page = await client.fetchPage('proposta', { codigoModalidadeContratacao: 6 }, 1);

  assert.equal(page.pageNumber, 1);
  assert.deepEqual(sleeps, [1000, 2000]);
  assert.deepEqual(retries, [1, 2]);
  assert.equal(client.requestCount, 3);
});

test('o jitter acrescenta até 25% ao backoff', async () => {
  const { client, sleeps } = createFakeClient([new Response('erro', { status: 500 }), pageResponse(1, 0)], { random: () => 0.5 });
  await client.fetchPage('proposta', {}, 1);
  assert.deepEqual(sleeps, [1125]);
});

test('HTTP 429 respeita Retry-After em segundos', async () => {
  const { client, sleeps } = createFakeClient([
    new Response('limite', { status: 429, headers: { 'retry-after': '3' } }),
    pageResponse(1, 0),
  ]);
  await client.fetchPage('proposta', {}, 1);
  assert.deepEqual(sleeps, [3000]);
});

test('Retry-After como data HTTP vira espera até a data', async () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const { client, sleeps } = createFakeClient(
    [new Response('ocupado', { status: 503, headers: { 'retry-after': 'Mon, 05 Oct 2026 12:00:10 GMT' } }), pageResponse(1, 0)],
    { now: () => now },
  );
  await client.fetchPage('proposta', {}, 1);
  assert.deepEqual(sleeps, [10_000]);
});

test('timeout e erro de conexão são repetidos', async () => {
  const { client, sleeps } = createFakeClient([timeoutError(), new TypeError('fetch failed'), pageResponse(1, 0)]);
  const page = await client.fetchPage('atualizacao', {}, 1);
  assert.equal(page.records.length, 1);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('HTTP 400 não é repetido e vira erro tipado', async () => {
  const { client, requestedUrls, sleeps } = createFakeClient([new Response('{"message":"tamanhoPagina inválido"}', { status: 400 })]);

  await assert.rejects(
    client.fetchPage('proposta', {}, 1),
    (error: unknown) =>
      error instanceof PncpRequestError && error.details.status === 400 && error.details.attempts === 1 && /tamanhoPagina/.test(error.message),
  );
  assert.equal(requestedUrls.length, 1);
  assert.deepEqual(sleeps, []);
});

test('desiste depois de PNCP_MAX_ATTEMPTS tentativas', async () => {
  const { client, requestedUrls } = createFakeClient(
    [new Response('', { status: 503 }), new Response('', { status: 503 }), new Response('', { status: 503 })],
    { maxAttempts: 3 },
  );
  await assert.rejects(
    client.fetchPage('proposta', {}, 1),
    (error: unknown) => error instanceof PncpRequestError && error.details.attempts === 3 && error.details.status === 503,
  );
  assert.equal(requestedUrls.length, 3);
});

test('pausa PNCP_REQUEST_INTERVAL_MS entre requisições, nunca antes da primeira', async () => {
  const { client, sleeps } = createFakeClient([pageResponse(1, 1), pageResponse(2, 0)], { requestIntervalMs: 400 });
  await collectPages(client.pages('proposta', {}));
  assert.deepEqual(sleeps, [400]);
});

test('resposta fora do formato de página é repetida', async () => {
  const { client, sleeps } = createFakeClient([new Response('{"inesperado":true}', { status: 200 }), pageResponse(1, 0)]);
  const page = await client.fetchPage('proposta', {}, 1);
  assert.equal(page.pageNumber, 1);
  assert.deepEqual(sleeps, [1000]);
});
