import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENCIES_ENDPOINT, CONTRACTS_BY_START_ENDPOINT, ComprasGovClient, type ComprasGovClientOptions } from './comprasGovClient';
import { addCalendarDays } from './dates';
import { FEDERAL_MAX_SPLIT_DEPTH, readFederal } from './federalSource';

type Row = Record<string, unknown>;

const YEAR_START = '2024-01-01';
const YEAR = { from: YEAR_START, to: '2024-12-31' };

/** As linhas de um ano (o bissexto de 2024): a linha n cai no dia n % 366, e o número vai no contrato. */
const row = (n: number): Row => ({
  codigoUnidadeGestora: '153254',
  numeroContrato: `${String(n).padStart(5, '0')}/2024`,
  dataVigenciaInicial: `${addCalendarDays(YEAR_START, n % 366)}T00:00:00`,
  objeto: `objeto ${n}`,
});
const indexOf = (item: Row) => Number(String(item['numeroContrato']).slice(0, 5));

interface FakeOptions {
  /** Tamanhos de página em que a paginação erra: a página 2 em diante perde a 1ª linha e repete a última da anterior. */
  flawedSizes?: ReadonlySet<number>;
  /** Linhas que a fonte nunca entrega, em tamanho nenhum, enquanto a janela tiver mais que `whenWindowOver` linhas. */
  neverDelivered?: ReadonlySet<number>;
  whenWindowOver?: number;
  failAfterRequests?: number;
}

/**
 * Uma fonte simulada que filtra as linhas pela janela de datas do pedido e as pagina com o tamanho pedido, errando como a
 * real: repetindo uma linha e perdendo outra, com a soma das páginas igual ao total.
 */
function fakeSource(rows: Row[], options: FakeOptions = {}) {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    if (options.failAfterRequests !== undefined && urls.length > options.failAfterRequests) {
      return new Response('erro', { status: 400 });
    }
    const url = new URL(String(input));
    const size = Number(url.searchParams.get('tamanhoPagina') ?? 500);
    const page = Number(url.searchParams.get('pagina') ?? 1);
    const min = url.searchParams.get('dataVigenciaInicialMin');
    const max = url.searchParams.get('dataVigenciaInicialMax');
    const inWindow = rows.filter((item) => min === null || max === null || (String(item['dataVigenciaInicial']).slice(0, 10) >= min && String(item['dataVigenciaInicial']).slice(0, 10) <= max));
    let slice = inWindow.slice((page - 1) * size, page * size);
    if (options.neverDelivered !== undefined && inWindow.length > (options.whenWindowOver ?? 0)) {
      // No lugar da linha que nunca vem, uma repetida de outra da mesma janela (nunca uma linha de fora dela).
      const filler = inWindow.find((candidate) => !options.neverDelivered?.has(indexOf(candidate)));
      slice = slice.map((item) => (options.neverDelivered?.has(indexOf(item)) && filler !== undefined ? filler : item));
    }
    if (options.flawedSizes?.has(size) && page >= 2) {
      slice = [inWindow[(page - 1) * size - 1] as Row, ...slice.slice(1)];
    }
    const totalPages = Math.max(1, Math.ceil(inWindow.length / size));
    return new Response(
      JSON.stringify({ resultado: slice, totalRegistros: inWindow.length, totalPaginas: totalPages, paginasRestantes: Math.max(0, totalPages - page) }),
      { status: 200 },
    );
  };
  const clientOptions: ComprasGovClientOptions = { baseUrl: 'https://compras.example', requestIntervalMs: 0, sleep: async () => undefined, fetch: fetchImpl, random: () => 0 };
  return { client: new ComprasGovClient(clientOptions), urls };
}

const query = { endpoint: CONTRACTS_BY_START_ENDPOINT, params: { codigoOrgao: '26238' }, window: YEAR };
const rowsOf = (count: number) => Array.from({ length: count }, (_, index) => row(index));

test('janela que cabe numa página: completa na primeira leitura', async () => {
  const { client, urls } = fakeSource(rowsOf(30));
  const read = await readFederal(client, query);
  assert.equal(read.rows.length, 30);
  assert.deepEqual([read.announced, read.complete, read.passes, read.firstPassDistinct, read.repeated, read.pages, read.splits], [30, true, 1, 30, 0, 1, 0]);
  assert.equal(read.failure, null);
  assert.equal(urls.length, 1);
});

test('janela vazia (204 ou total zero) vale como lida, sem linhas', async () => {
  const empty = new ComprasGovClient({ baseUrl: 'https://compras.example', requestIntervalMs: 0, sleep: async () => undefined, fetch: async () => new Response(null, { status: 204 }) });
  const read = await readFederal(empty, query);
  assert.deepEqual([read.rows.length, read.announced, read.complete, read.passes], [0, 0, true, 1]);
});

test('paginação que falha no tamanho normal: relê em outro tamanho e junta só as linhas que faltavam', async () => {
  const { client, urls } = fakeSource(rowsOf(1_122), { flawedSizes: new Set([500]) });
  const read = await readFederal(client, query);

  assert.equal(read.complete, true);
  assert.equal(read.rows.length, 1_122);
  assert.equal(read.passes, 2, 'a primeira leitura (500) veio com falha, a de 499 fechou');
  assert.equal(read.splits, 0);
  assert.ok(read.firstPassDistinct < 1_122, 'a primeira leitura deixou linhas de fora');
  assert.ok(read.repeated > 0, 'e trouxe linhas repetidas, que não entram duas vezes');
  assert.equal(new Set(read.rows.map((item) => JSON.stringify(item))).size, 1_122);
  assert.equal(new Set(urls.map((url) => new URL(url).searchParams.get('tamanhoPagina'))).size, 2);
});

test('as duas leituras se completam quando cada uma perde linhas diferentes', async () => {
  const { client } = fakeSource(rowsOf(1_122), { flawedSizes: new Set([500, 499]) });
  const read = await readFederal(client, query);
  assert.equal(read.complete, true);
  assert.equal(read.rows.length, 1_122);
  assert.equal(read.splits, 0, 'uma janela que se pode dividir lê duas vezes antes de dividir');
});

test('linha que a janela grande nunca entrega: a janela é dividida ao meio e cada metade fecha sozinha', async () => {
  // Acima de 600 linhas por janela a fonte perde a linha 777, em qualquer tamanho de página; cada metade tem uns 561.
  const { client } = fakeSource(rowsOf(1_122), { neverDelivered: new Set([777]), whenWindowOver: 600 });
  const read = await readFederal(client, query);
  assert.equal(read.complete, true);
  assert.equal(read.rows.length, 1_122, 'a linha que faltava veio na metade');
  assert.equal(read.splits, 1);
  assert.equal(read.announced, 1_122);
});

test('janela que a fonte nunca completa: divide até o limite e não vale como lida', async () => {
  const { client, urls } = fakeSource(rowsOf(1_122), { neverDelivered: new Set([777]), whenWindowOver: 0 });
  const read = await readFederal(client, query);
  assert.equal(read.complete, false);
  assert.equal(read.rows.length, 1_121, 'o que veio continua disponível');
  assert.ok(read.splits >= 1 && read.splits <= 2 ** FEDERAL_MAX_SPLIT_DEPTH, 'o limite de divisões evita centenas de pedidos');
  assert.ok(urls.length < 400, `pedidos feitos: ${urls.length}`);
});

test('janela de um dia não se divide: lê as quatro vezes e, sem completar, não vale como lida', async () => {
  // A linha 5 cai em 2024-01-06 e a fonte nunca a entrega.
  const { client } = fakeSource(rowsOf(1_122), { neverDelivered: new Set([5]), whenWindowOver: 0 });
  const read = await readFederal(client, { ...query, window: { from: '2024-01-06', to: '2024-01-06' } });
  assert.deepEqual([read.splits, read.passes, read.complete], [0, 4, false]);
  assert.ok(read.rows.length < read.announced);
});

test('falha da fonte no meio da leitura: devolve o que veio, com a falha, sem lançar', async () => {
  const { client } = fakeSource(rowsOf(1_200), { failAfterRequests: 1 });
  const read = await readFederal(client, query);
  assert.equal(read.complete, false);
  assert.equal(read.rows.length, 500, 'a primeira página chegou');
  assert.ok(read.failure);
  assert.equal(read.failure.details.status, 400);
  assert.equal(read.failure.details.endpoint, 'contratos');
});

test('com limite de páginas (sondagem) a leitura é de uma só passada, não se divide e não vale como completa', async () => {
  const { client, urls } = fakeSource(rowsOf(1_200));
  const read = await readFederal(client, { ...query, maxPages: 1 });
  assert.equal(read.rows.length, 500);
  assert.deepEqual([read.complete, read.passes, read.announced, read.splits], [false, 1, 1_200, 0]);
  assert.equal(urls.length, 1);
});

test('lista sem tamanho de página (órgãos): uma passada só e sem janela', async () => {
  const { client, urls } = fakeSource(Array.from({ length: 3 }, (_, index) => ({ codigoOrgao: index })));
  const read = await readFederal(client, { endpoint: AGENCIES_ENDPOINT, params: { statusOrgao: 'true' }, window: null });
  assert.deepEqual([read.rows.length, read.complete, read.passes], [3, true, 1]);
  const url = new URL(urls[0] ?? '');
  assert.equal(url.pathname, '/modulo-uasg/2_consultarOrgao');
  assert.equal(url.searchParams.get('statusOrgao'), 'true');
  assert.equal(url.searchParams.get('tamanhoPagina'), null);
});

test('falha de rede esgota as tentativas e vira falha da fonte, sem linhas', async () => {
  const client = new ComprasGovClient({
    baseUrl: 'https://compras.example',
    requestIntervalMs: 0,
    sleep: async () => undefined,
    fetch: async () => {
      throw new TypeError('sem rede');
    },
    maxAttempts: 2,
  });
  const read = await readFederal(client, query);
  assert.ok(read.failure);
  assert.deepEqual([read.complete, read.rows.length], [false, 0]);
});

test('erro que não é da fonte sobe: um bug não vira janela não lida', async () => {
  const client = new ComprasGovClient({
    baseUrl: 'https://compras.example',
    requestIntervalMs: 0,
    sleep: async () => {
      throw new Error('bug no relógio');
    },
    fetch: async () => new Response('erro', { status: 500 }),
  });
  await assert.rejects(() => readFederal(client, query), /bug no relógio/);
});
