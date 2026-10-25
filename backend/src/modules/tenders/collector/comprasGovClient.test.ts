import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ComprasGovClient, ComprasGovRequestError, RESULTS_PATH, windowParams, type ComprasGovClientOptions, type ComprasGovPage,
} from './comprasGovClient';

type FakeReply = Response | Error;

function pageResponse(pageNumber: number, remainingPages: number, records: unknown[] = [{ idContratacaoPNCP: `x-${pageNumber}` }]): Response {
  return new Response(
    JSON.stringify({
      resultado: records,
      totalRegistros: records.length * (pageNumber + remainingPages),
      totalPaginas: pageNumber + remainingPages,
      paginasRestantes: remainingPages,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function timeoutError(): Error {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  return error;
}

function createFakeClient(replies: FakeReply[], overrides: Partial<ComprasGovClientOptions> = {}) {
  const requestedUrls: string[] = [];
  const sleeps: number[] = [];
  const queue = [...replies];
  const client = new ComprasGovClient({
    baseUrl: 'https://compras.example',
    pageSize: 500,
    requestIntervalMs: 0,
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

async function collectPages(iterable: AsyncIterable<ComprasGovPage>): Promise<ComprasGovPage[]> {
  const pages: ComprasGovPage[] = [];
  for await (const page of iterable) {
    pages.push(page);
  }
  return pages;
}

const WINDOW = { from: '2026-09-14', to: '2026-09-14' };

test('o fim da janela é exclusivo: pede o último dia mais um', () => {
  assert.deepEqual(windowParams(WINDOW), { initial: '2026-09-14', final: '2026-09-15' });
  // Vira o mês e o ano pelo calendário.
  assert.deepEqual(windowParams({ from: '2026-12-01', to: '2026-12-31' }), { initial: '2026-12-01', final: '2027-01-01' });
});

test('pagina até paginasRestantes = 0, sempre com as datas e o tamanho de página', async () => {
  const { client, requestedUrls } = createFakeClient([pageResponse(1, 2), pageResponse(2, 1), pageResponse(3, 0)]);
  const pages = await collectPages(client.pages(WINDOW));

  assert.deepEqual(pages.map((page) => page.pageNumber), [1, 2, 3]);
  assert.equal(requestedUrls.length, 3);
  const firstUrl = new URL(requestedUrls[0] ?? '');
  assert.equal(firstUrl.pathname, RESULTS_PATH);
  assert.equal(firstUrl.searchParams.get('dataResultadoPncpInicial'), '2026-09-14');
  assert.equal(firstUrl.searchParams.get('dataResultadoPncpFinal'), '2026-09-15');
  assert.equal(firstUrl.searchParams.get('tamanhoPagina'), '500');
  assert.equal(firstUrl.searchParams.get('pagina'), '1');
  assert.equal(new URL(requestedUrls[2] ?? '').searchParams.get('pagina'), '3');
  assert.equal(pages[0]?.totalPages, 3);
});

test('HTTP 204 e página vazia encerram a paginação', async () => {
  const noContent = createFakeClient([new Response(null, { status: 204 })]);
  const pages204 = await collectPages(noContent.client.pages(WINDOW));
  assert.equal(pages204.length, 1);
  assert.deepEqual(pages204[0]?.records, []);

  // Lista vazia com 200, mesmo dizendo que há páginas restantes: não segue (contra laço sem fim).
  const empty = createFakeClient([pageResponse(1, 3, [])]);
  assert.equal((await collectPages(empty.client.pages(WINDOW))).length, 1);
});

test('maxPages limita a leitura', async () => {
  const { client } = createFakeClient([pageResponse(1, 5), pageResponse(2, 4)]);
  assert.equal((await collectPages(client.pages(WINDOW, { maxPages: 2 }))).length, 2);
});

test('repete em 5xx e erro de rede com backoff de 1, 2 e 4 s e conta as requisições repetidas', async () => {
  const retries: number[] = [];
  const { client, sleeps } = createFakeClient(
    [new Response('erro', { status: 500 }), new Error('socket'), new Response('erro', { status: 502 }), pageResponse(1, 0)],
    { onRetry: (info) => retries.push(info.attempt) },
  );
  const page = await client.fetchPage(WINDOW, 1);

  assert.equal(page.pageNumber, 1);
  assert.deepEqual(sleeps, [1000, 2000, 4000]);
  assert.deepEqual(retries, [1, 2, 3]);
  assert.equal(client.requestCount, 4);
});

test('429 espera 30, 60 e 120 s (teto de 2 min) e o Retry-After vale mais que o backoff', async () => {
  const limited = createFakeClient([
    new Response('x', { status: 429 }),
    new Response('x', { status: 429 }),
    new Response('x', { status: 429 }),
    new Response('x', { status: 429 }),
    pageResponse(1, 0),
  ]);
  await limited.client.fetchPage(WINDOW, 1);
  assert.deepEqual(limited.sleeps, [30_000, 60_000, 120_000, 120_000]);

  const withHeader = createFakeClient([new Response('x', { status: 429, headers: { 'retry-after': '7' } }), pageResponse(1, 0)]);
  await withHeader.client.fetchPage(WINDOW, 1);
  assert.deepEqual(withHeader.sleeps, [7000]);

  const capped = createFakeClient([new Response('x', { status: 429, headers: { 'retry-after': '3600' } }), pageResponse(1, 0)]);
  await capped.client.fetchPage(WINDOW, 1);
  assert.deepEqual(capped.sleeps, [120_000]);
});

test('timeout e corpo fora do formato são falhas passageiras que repetem', async () => {
  const { client, sleeps } = createFakeClient([
    timeoutError(),
    new Response('<html>erro</html>', { status: 200 }),
    new Response(JSON.stringify({ resultado: 'não é lista' }), { status: 200 }),
    pageResponse(1, 0),
  ]);
  const page = await client.fetchPage(WINDOW, 1);
  assert.equal(page.records.length, 1);
  assert.equal(sleeps.length, 3);
});

test('ao desistir, o erro é tipado e não cita a fonte nem o corpo da resposta', async () => {
  const { client } = createFakeClient(Array.from({ length: 5 }, () => new Response('corpo secreto da fonte', { status: 503 })), {
    maxAttempts: 5,
  });
  await assert.rejects(
    () => client.fetchPage(WINDOW, 4),
    (error: unknown) => {
      assert.ok(error instanceof ComprasGovRequestError);
      assert.deepEqual(error.details, { endpoint: 'resultados', page: 4, attempts: 5, status: 503 });
      assert.match(error.message, /falhou após 5 tentativa/);
      assert.doesNotMatch(error.message, /compras|gov|secreto/i);
      return true;
    },
  );
});

test('HTTP 400 não repete e a mensagem não leva o corpo da resposta', async () => {
  const { client, sleeps } = createFakeClient([new Response('parâmetro inválido: dataResultadoPncpFinal', { status: 400 })]);
  await assert.rejects(
    () => client.fetchPage(WINDOW, 1),
    (error: unknown) => {
      assert.ok(error instanceof ComprasGovRequestError);
      assert.equal(error.details.status, 400);
      assert.equal(error.message, 'A consulta de resultados recebeu HTTP 400');
      return true;
    },
  );
  assert.deepEqual(sleeps, []);
  assert.equal(client.requestCount, 1);
});

test('respeita o intervalo entre pedidos, menos antes do primeiro', async () => {
  const { client, sleeps } = createFakeClient([pageResponse(1, 1), pageResponse(2, 0)], { requestIntervalMs: 1500 });
  await collectPages(client.pages(WINDOW));
  assert.deepEqual(sleeps, [1500]);
});

test('requestRaw devolve o que veio sem interpretar: 200 com JSON, 400, 429 e falha de rede', async () => {
  const { client, requestedUrls } = createFakeClient([
    pageResponse(1, 0),
    new Response('tamanhoPagina deve ser até 500', { status: 400 }),
    new Response(`${'x'.repeat(300)}`, { status: 429, headers: { 'retry-after': '45' } }),
    new Error('socket'),
  ]);
  const ok = await client.requestRaw({ initial: '2026-09-14', final: '2026-09-14' }, 1);
  assert.equal(ok.status, 200);
  assert.ok(ok.json && typeof ok.json === 'object' && 'resultado' in ok.json);
  assert.equal(ok.errorPreview, '');

  const tooBig = await client.requestRaw({ initial: '2026-09-14', final: '2026-09-15' }, 1, 501);
  assert.equal(tooBig.status, 400);
  assert.equal(tooBig.json, null);
  assert.equal(tooBig.errorPreview, 'tamanhoPagina deve ser até 500');
  assert.equal(new URL(requestedUrls[1] ?? '').searchParams.get('tamanhoPagina'), '501');
  assert.equal(new URL(requestedUrls[1] ?? '').searchParams.get('dataResultadoPncpFinal'), '2026-09-15');

  const limited = await client.requestRaw({ initial: '2026-09-14', final: '2026-09-14' }, 1);
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfter, '45');
  assert.equal(limited.errorPreview.length, 200);

  const failed = await client.requestRaw({ initial: '2026-09-14', final: '2026-09-14' }, 1);
  assert.equal(failed.status, 0);
  assert.equal(failed.errorPreview, 'erro de conexão');
  // O requestRaw não repete: 4 pedidos, 4 respostas.
  assert.equal(client.requestCount, 4);
});

test('requestRaw passa parâmetros extras (filtro de fornecedor) e mede o tempo', async () => {
  let now = 1_000;
  const { client, requestedUrls } = createFakeClient([pageResponse(1, 0)], {
    now: () => {
      now += 250;
      return now;
    },
  });
  const raw = await client.requestRaw({ initial: '2026-09-14', final: '2026-09-15' }, 1, 10, { niFornecedor: '00000000000191' });
  assert.equal(new URL(requestedUrls[0] ?? '').searchParams.get('niFornecedor'), '00000000000191');
  assert.equal(raw.elapsedMs, 250);
});
