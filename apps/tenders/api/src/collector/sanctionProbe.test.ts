import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSanctionProbeReport, runSanctionProbe, shapeOfValue } from './sanctionProbe';

// Sondagem do portal de sanções (item 6), com `fetch` simulado: nada chama o portal de verdade. O que mais pesa é o que NUNCA
// pode aparecer no relatório (nome, documento, nem parcial, URL, chave ou valor de campo) e o que ele precisa mostrar (a forma
// dos campos, das datas e dos códigos, o tamanho da página, como "sem registro" volta, se o filtro casa).

const KEY = 'chave-secreta-de-sondagem-987';
const CNPJ = '11222333000181';
const OTHER_CNPJ = '12345678000195';
const CPF = '52998224725';
const SANCTIONED_NAME = 'FULANO DE TAL SANCIONADO';

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 4242,
    dataReferencia: '10/11/2026',
    dataInicioSancao: '01/01/2025',
    dataFimSancao: '31/12/2026',
    tipoSancao: { descricaoResumida: 'Impedimento de licitar' },
    fundamentacao: [{ codigo: 'Art. 156', descricao: 'Lei 14.133/2021' }],
    orgaoSancionador: { nome: 'Ministério Exemplo', esfera: 'FEDERAL' },
    sancionado: { nome: SANCTIONED_NAME, codigoFormatado: '***.456.789-**' },
    pessoa: { id: 1, nome: SANCTIONED_NAME, cpfFormatado: '***.456.789-**', cnpjFormatado: null },
    numeroProcesso: '12345.000001/2025-00',
    ...overrides,
  };
}

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

interface FakeCall {
  url: URL;
  headers: Record<string, string>;
}

function fakeFetch(handler: (call: FakeCall) => Response | Error) {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: FakeCall = { url: new URL(String(input)), headers: Object.fromEntries(new Headers(init?.headers).entries()) };
    calls.push(call);
    const outcome = handler(call);
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: async (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

function runWith(fetchImpl: typeof fetch, options: { cnpjs?: string[]; cpf?: string | null } = {}, intervalMs = 1000) {
  const clock = fakeClock();
  const progress: string[] = [];
  const promise = runSanctionProbe(
    { apiKey: KEY, fetchImpl, requestIntervalMs: intervalMs, now: clock.now, sleep: clock.sleep, progress: (message) => progress.push(message) },
    { cnpjs: options.cnpjs ?? [], cpf: options.cpf ?? null },
  );
  return { promise, progress, clock };
}

test('a forma de um valor: dígitos viram 9, letras viram A, a máscara e a pontuação ficam', () => {
  assert.equal(shapeOfValue('31/12/2026'), '99/99/9999');
  assert.equal(shapeOfValue('2026-12-31'), '9999-99-99');
  assert.equal(shapeOfValue('***.456.789-**'), '***.999.999-**');
  assert.equal(shapeOfValue('11.222.333/0001-81'), '99.999.999/9999-99');
  assert.equal(shapeOfValue('Impedimento'), 'AAAAAAAAAAA');
  assert.equal(shapeOfValue('x'.repeat(100)).length, 40);
});

test('sem documentos: só a primeira página sem filtro de cada base, com a chave no cabeçalho e o intervalo entre os pedidos', async () => {
  const { fetchImpl, calls } = fakeFetch(() => json([record(), record({ id: 4243, dataFimSancao: null })]));
  const run = runWith(fetchImpl);
  const report = await run.promise;

  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((call) => `${call.url.pathname}?${call.url.searchParams.toString()}`),
    ['/api-de-dados/ceis?pagina=1', '/api-de-dados/cnep?pagina=1', '/api-de-dados/cepim?pagina=1'],
  );
  assert.ok(calls.every((call) => call.headers['chave-api-dados'] === KEY));
  assert.equal(report.requests, 3);
  assert.equal(run.clock.now(), 2000, 'espaçados pelo intervalo: dois intervalos para três pedidos');
  assert.deepEqual(run.progress, ['CEIS: primeira página sem filtro', 'CNEP: primeira página sem filtro', 'CEPIM: primeira página sem filtro']);
  assert.equal(report.ok, true);
  assert.deepEqual(report.lookups, []);

  const ceis = report.samples.CEIS;
  assert.equal(ceis.pageSize, 2);
  assert.equal(ceis.bodyShape, 'array');
  assert.equal(ceis.request.status, 200);
  assert.ok(ceis.fieldPaths.includes('tipoSancao.descricaoResumida'));
  assert.ok(ceis.fieldPaths.includes('fundamentacao[]'));
  assert.ok(ceis.fieldPaths.includes('sancionado.codigoFormatado'));
  assert.deepEqual(ceis.dateShapes['dataFimSancao'], { '99/99/9999': 1 });
  assert.deepEqual(ceis.dateShapes['dataInicioSancao'], { '99/99/9999': 2 });
  assert.deepEqual(ceis.codeShapes['sancionado.codigoFormatado'], { '***.999.999-**': 2 });
});

test('cabeçalhos de limite aparecem com o valor; os outros cabeçalhos não', async () => {
  const { fetchImpl } = fakeFetch(() => json([], { 'x-ratelimit-limit': '90', 'x-ratelimit-remaining': '89', 'retry-after': '60', 'set-cookie': 'sessao=segredo', server: 'nginx' }));
  const report = await runWith(fetchImpl).promise;
  assert.deepEqual(report.samples.CEIS.request.rateLimitHeaders, { 'x-ratelimit-limit': '90', 'x-ratelimit-remaining': '89', 'retry-after': '60' });
  assert.ok(!JSON.stringify(report).includes('segredo'));
});

test('consulta por documento: cada CNPJ nas três bases, o CPF no CEIS e no CNEP, e o filtro de cada base', async () => {
  const { fetchImpl, calls } = fakeFetch(() => json([]));
  const report = await runWith(fetchImpl, { cnpjs: [CNPJ, OTHER_CNPJ], cpf: CPF }).promise;

  const filtered = calls.slice(3).map((call) => `${call.url.pathname}?${call.url.searchParams.toString()}`);
  assert.deepEqual(filtered, [
    `/api-de-dados/ceis?codigoSancionado=${CNPJ}&pagina=1`,
    `/api-de-dados/cnep?codigoSancionado=${CNPJ}&pagina=1`,
    `/api-de-dados/cepim?cnpjSancionado=${CNPJ}&pagina=1`,
    `/api-de-dados/ceis?codigoSancionado=${OTHER_CNPJ}&pagina=1`,
    `/api-de-dados/cnep?codigoSancionado=${OTHER_CNPJ}&pagina=1`,
    `/api-de-dados/cepim?cnpjSancionado=${OTHER_CNPJ}&pagina=1`,
    `/api-de-dados/ceis?codigoSancionado=${CPF}&pagina=1`,
    `/api-de-dados/cnep?codigoSancionado=${CPF}&pagina=1`,
  ]);
  assert.equal(report.requests, 11);
  assert.deepEqual(
    report.lookups.map((lookup) => `${lookup.subject}:${lookup.base}`),
    ['cnpj#1:CEIS', 'cnpj#1:CNEP', 'cnpj#1:CEPIM', 'cnpj#2:CEIS', 'cnpj#2:CNEP', 'cnpj#2:CEPIM', 'cpf:CEIS', 'cpf:CNEP'],
  );
});

test('"sem registro": lista vazia com HTTP 200 vem descrita; HTTP 404 vem descrito e vira aviso para o cliente mudar', async () => {
  const empty = await runWith(fakeFetch(() => json([])).fetchImpl, { cnpjs: [CNPJ] }).promise;
  assert.deepEqual(
    empty.lookups.map((lookup) => [lookup.records, lookup.emptyResult]),
    [[0, 'empty list (HTTP 200)'], [0, 'empty list (HTTP 200)'], [0, 'empty list (HTTP 200)']],
  );

  const notFound = fakeFetch((call) => (call.url.searchParams.has('codigoSancionado') || call.url.searchParams.has('cnpjSancionado') ? new Response(null, { status: 404 }) : json([record()])));
  const report = await runWith(notFound.fetchImpl, { cnpjs: [CNPJ] }).promise;
  assert.equal(report.lookups[0]?.emptyResult, 'HTTP 404');
  assert.equal(report.lookups[0]?.records, null);
  assert.ok(report.notes.some((note) => /HTTP 404/.test(note)), 'o aviso de que o cliente trata 404 como indisponível');
});

test('o filtro casa? o código de cada registro devolvido contra o consultado, e os avisos de quando não casa ou não se lê', async () => {
  // 529.982.247-25: a máscara mostra os dígitos do meio (4º ao 9º).
  const mine = record({ sancionado: { codigoFormatado: '***.982.247-**' }, pessoa: { cpfFormatado: '***.982.247-**' } });
  const other = record({ sancionado: { codigoFormatado: '***.111.222-**' }, pessoa: { cpfFormatado: '***.111.222-**' } });
  const noCode = record({ sancionado: { nome: SANCTIONED_NAME }, pessoa: { nome: SANCTIONED_NAME } });
  const { fetchImpl } = fakeFetch((call) => json(call.url.searchParams.has('codigoSancionado') ? [mine, other, other, noCode] : []));
  const report = await runWith(fetchImpl, { cpf: CPF }).promise;

  const ceis = report.lookups.find((lookup) => lookup.base === 'CEIS');
  assert.deepEqual(ceis?.codeChecks, { match: 1, mismatch: 2, unreadable: 1 });
  assert.equal(ceis?.records, 4);
  assert.deepEqual(ceis?.endDateShapes, { '99/99/9999': 4 });
  assert.ok(report.notes.some((note) => /cpf em CEIS: 2 registro\(s\) com o código de outro documento/.test(note)));
  assert.ok(report.notes.some((note) => /cpf em CEIS: 1 registro\(s\) sem código legível/.test(note)));
});

test('o relatório nunca leva nome, documento (nem parcial), chave, URL nem valor de campo', async () => {
  const { fetchImpl } = fakeFetch((call) => json(call.url.searchParams.size > 1 ? [record(), record({ id: 9 })] : [record()]));
  const report = await runWith(fetchImpl, { cnpjs: [CNPJ], cpf: CPF }).promise;
  const text = renderSanctionProbeReport(report);

  for (const secret of [KEY, SANCTIONED_NAME, CNPJ, CPF, '456.789', '12345.000001', 'Ministério Exemplo', 'Impedimento de licitar', 'Lei 14.133', 'api.portaldatransparencia', 'codigoSancionado=', 'chave-api-dados']) {
    assert.ok(!text.includes(secret), `o relatório não leva "${secret}"`);
  }
  assert.equal(JSON.parse(text).requests, report.requests, 'o texto é um JSON legível');
});

test('chave recusada (401): a base falha sem ler o corpo, o relatório diz que não serve e avisa', async () => {
  const { fetchImpl } = fakeFetch(() => new Response(`corpo secreto ${KEY}`, { status: 401 }));
  const report = await runWith(fetchImpl).promise;

  assert.equal(report.ok, false);
  assert.equal(report.samples.CEIS.request.status, 401);
  assert.equal(report.samples.CEIS.request.ok, false);
  assert.equal(report.samples.CEIS.pageSize, null);
  assert.equal(report.samples.CEIS.bodyShape, null);
  assert.ok(report.notes.some((note) => /CEIS: a fonte recusou a chave \(HTTP 401\)/.test(note)));
  assert.ok(!renderSanctionProbeReport(report).includes(KEY));
});

test('erro de rede: só o nome do erro, nunca a mensagem (que pode ter a URL, com o documento)', async () => {
  const { fetchImpl } = fakeFetch(() => Object.assign(new TypeError(`fetch failed ${CNPJ} ${KEY}`), { cause: new Error(CNPJ) }));
  const report = await runWith(fetchImpl, { cnpjs: [CNPJ] }).promise;

  assert.equal(report.ok, false);
  assert.equal(report.samples.CEIS.request.error, 'Request failed (TypeError)');
  assert.equal(report.samples.CEIS.request.status, null);
  const text = renderSanctionProbeReport(report);
  assert.ok(!text.includes(CNPJ) && !text.includes(KEY));
});

test('resposta que não é lista ou não é JSON: a base não serve, com o aviso', async () => {
  const notList = await runWith(fakeFetch(() => json({ erro: 'novo formato' })).fetchImpl).promise;
  assert.equal(notList.ok, false);
  assert.equal(notList.samples.CEIS.bodyShape, 'object');
  assert.ok(notList.notes.some((note) => /CEIS: a resposta não é uma lista/.test(note)));

  const notJson = await runWith(fakeFetch(() => new Response('<html></html>', { status: 200 })).fetchImpl).promise;
  assert.equal(notJson.ok, false);
  assert.equal(notJson.samples.CEIS.request.error, 'Response was not valid JSON');

  const emptyPage = await runWith(fakeFetch(() => json([])).fetchImpl).promise;
  assert.equal(emptyPage.ok, true, 'página vazia ainda é uma lista');
  assert.ok(emptyPage.notes.some((note) => /primeira página sem filtro veio vazia/.test(note)));
});

test('o intervalo zero não espera entre os pedidos', async () => {
  const { fetchImpl } = fakeFetch(() => json([]));
  const run = runWith(fetchImpl, {}, 0);
  await run.promise;
  assert.equal(run.clock.now(), 0);
});
