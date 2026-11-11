import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIN_VISIBLE_CODE_DIGITS,
  PORTAL_API_KEY_VARIABLE,
  PORTAL_KEY_HEADER,
  PORTAL_REQUEST_INTERVAL_VARIABLE,
  SANCTION_DEFAULT_INTERVAL_MS,
  SANCTION_USER_AGENT,
  SanctionSourceRateLimitedError,
  SanctionSourceUnavailableError,
  checkRecordCode,
  codeMatchesDocument,
  createPortalSanctionSource,
  createPortalSanctionSourceFromEnv,
  readCodePattern,
  readSanctionRequestInterval,
  toSanctionRecord,
} from './sanctionSource';

// O cliente do portal de sanções (item 6) com `fetch` simulado: nada chama o portal de verdade. Amostras no formato do OpenAPI
// público (CeisDTO, CnepDTO e CepimDTO), com nomes e documentos de exemplo. O que mais pesa: a conferência do código devolvido
// (um filtro que não casa não pode virar "sem registro" nem "com registro" de outro), a falha por base, o ritmo entre pedidos
// e o que nunca pode vazar (chave, URL com o documento, corpo de resposta).

const KEY = 'chave-secreta-de-teste-123';
const CNPJ = '11222333000181';
const CPF = '12345678909';
const SANCTIONED_NAME = 'EMPRESA SANCIONADA EXEMPLO LTDA';

function ceisRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 101,
    dataReferencia: '10/11/2026',
    dataInicioSancao: '01/01/2025',
    dataFimSancao: '31/12/2026',
    dataPublicacaoSancao: '02/01/2025',
    dataTransitadoJulgado: '15/01/2025',
    tipoSancao: { descricaoResumida: 'Impedimento de licitar', descricaoPortal: 'Impedimento de licitar e contratar' },
    fonteSancao: { nomeExibicao: 'Fonte de exemplo', telefoneContato: '(61) 0000-0000' },
    fundamentacao: [{ codigo: 'Art. 156', descricao: 'Lei 14.133/2021, art. 156, III' }],
    orgaoSancionador: { nome: 'Ministério Exemplo', siglaUf: 'DF', poder: 'EXECUTIVO', esfera: 'FEDERAL' },
    sancionado: { nome: SANCTIONED_NAME, codigoFormatado: '11.222.333/0001-81' },
    pessoa: { id: 7, cpfFormatado: null, cnpjFormatado: '11.222.333/0001-81', nome: SANCTIONED_NAME, tipo: 'Pessoa Jurídica' },
    numeroProcesso: '12345.000001/2025-00',
    abrangenciaDefinidaDecisaoJudicial: 'Âmbito do órgão sancionador',
    informacoesAdicionaisDoOrgaoSancionador: 'Sem informações adicionais',
    ...overrides,
  };
}

function cepimRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 55,
    dataReferencia: '10/11/2026',
    motivo: 'Omissão no dever de prestar contas',
    orgaoSuperior: { nome: 'Ministério da Saúde', sigla: 'MS' },
    pessoaJuridica: { id: 9, cnpjFormatado: '11.222.333/0001-81', nome: SANCTIONED_NAME },
    convenio: { codigo: '1', numero: '987654', objeto: 'Construção de unidade básica de saúde' },
    ...overrides,
  };
}

interface FakeCall {
  url: URL;
  headers: Record<string, string>;
}

/** Um `fetch` simulado: o manipulador devolve a resposta (ou lança o erro de rede) de cada chamada. */
function fakeFetch(handler: (call: FakeCall, index: number) => Response | Promise<Response> | Error) {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: FakeCall = { url: new URL(String(input)), headers: Object.fromEntries(new Headers(init?.headers).entries()) };
    calls.push(call);
    const outcome = await handler(call, calls.length - 1);
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noBody = (status: number) => new Response(null, { status });

/** Relógio e espera simulados: dormir só avança o relógio, e o teste vê quando cada pedido saiu. */
function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: async (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

function sourceWith(fetchImpl: typeof fetch, options: Partial<Parameters<typeof createPortalSanctionSource>[0]> = {}) {
  const clock = fakeClock();
  return createPortalSanctionSource({ apiKey: KEY, fetchImpl, requestIntervalMs: 0, retryDelayMs: 0, now: clock.now, sleep: clock.sleep, ...options });
}

test('cada base é pedida com o parâmetro certo: CEIS e CNEP por `codigoSancionado`, o CEPIM por `cnpjSancionado`', async () => {
  const { fetchImpl, calls } = fakeFetch(() => json([]));
  const source = sourceWith(fetchImpl);
  await source.search('CEIS', CNPJ);
  await source.search('CNEP', CPF);
  await source.search('CEPIM', CNPJ);

  assert.deepEqual(
    calls.map((call) => `${call.url.origin}${call.url.pathname}?${call.url.searchParams.toString()}`),
    [
      `https://api.portaldatransparencia.gov.br/api-de-dados/ceis?codigoSancionado=${CNPJ}&pagina=1`,
      `https://api.portaldatransparencia.gov.br/api-de-dados/cnep?codigoSancionado=${CPF}&pagina=1`,
      `https://api.portaldatransparencia.gov.br/api-de-dados/cepim?cnpjSancionado=${CNPJ}&pagina=1`,
    ],
  );
});

test('a chave vai só no cabeçalho do portal, com o nome do cliente genérico', async () => {
  const { fetchImpl, calls } = fakeFetch(() => json([]));
  await sourceWith(fetchImpl).search('CEIS', CNPJ);

  assert.equal(calls[0]?.headers[PORTAL_KEY_HEADER], KEY);
  assert.equal(calls[0]?.headers['user-agent'], SANCTION_USER_AGENT);
  assert.equal(calls[0]?.headers['accept'], 'application/json');
  assert.ok(!calls[0]?.url.toString().includes(KEY), 'a chave não vai na URL');
});

test('só se consulta documento em dígitos, com o tamanho da base; a mensagem nunca repete o documento', async () => {
  const { fetchImpl, calls } = fakeFetch(() => json([]));
  const source = sourceWith(fetchImpl);
  for (const [base, document] of [
    ['CEIS', '11.222.333/0001-81'],
    ['CEIS', '1122233300018'],
    ['CEIS', ''],
    ['CEIS', `${CNPJ}&pagina=9`],
    ['CEPIM', CPF],
    ['CEPIM', 'abc'],
  ] as const) {
    await assert.rejects(source.search(base, document), (error: Error) => {
      assert.ok(!error.message.includes(document) || document === '');
      return true;
    });
  }
  assert.equal(calls.length, 0, 'nada chega à fonte');
});

test('sem registro: a primeira página vazia termina a consulta, com uma chamada só', async () => {
  const { fetchImpl, calls } = fakeFetch(() => json([]));
  const result = await sourceWith(fetchImpl).search('CEIS', CNPJ);
  assert.deepEqual(result, { records: [], truncated: false, discarded: 0 });
  assert.equal(calls.length, 1);
});

test('lê as páginas até vir uma vazia, sem repetir o registro que vem em duas páginas', async () => {
  const pages: Record<string, unknown[]> = {
    '1': [ceisRecord({ id: 1 }), ceisRecord({ id: 2 })],
    '2': [ceisRecord({ id: 2 }), ceisRecord({ id: 3 })],
    '3': [],
  };
  const { fetchImpl, calls } = fakeFetch((call) => json(pages[call.url.searchParams.get('pagina') ?? ''] ?? []));
  const result = await sourceWith(fetchImpl).search('CEIS', CNPJ);

  assert.deepEqual(result.records.map((record) => record.id), ['1', '2', '3']);
  assert.equal(result.truncated, false);
  assert.equal(calls.length, 3);
});

test('no teto de 3 páginas, com a última ainda cheia, o resultado fica marcado como incompleto', async () => {
  const { fetchImpl, calls } = fakeFetch((call) => json([ceisRecord({ id: Number(call.url.searchParams.get('pagina')) })]));
  const result = await sourceWith(fetchImpl).search('CEIS', CNPJ);

  assert.equal(calls.length, 3, 'não pede a quarta página');
  assert.equal(result.records.length, 3);
  assert.equal(result.truncated, true);
});

test('o registro é reduzido ao que a tela usa, e nada de quem foi sancionado vai junto', async () => {
  const { fetchImpl } = fakeFetch(() => json([ceisRecord()]));
  const result = await sourceWith(fetchImpl).search('CEIS', CNPJ);

  assert.deepEqual(result.records, [
    {
      id: '101',
      category: 'Impedimento de licitar',
      organ: 'Ministério Exemplo',
      startDate: '2025-01-01',
      endDate: '2026-12-31',
      legalBasis: 'Lei 14.133/2021, art. 156, III',
      process: '12345.000001/2025-00',
      note: 'Abrangência: Âmbito do órgão sancionador · Sem informações adicionais',
    },
  ]);
  const text = JSON.stringify(result);
  for (const secret of [SANCTIONED_NAME, '11.222.333/0001-81', CNPJ, 'Fonte de exemplo', '(61) 0000-0000']) {
    assert.ok(!text.includes(secret), `o resultado não leva "${secret}"`);
  }
});

test('CNEP leva a multa na observação; o tipo cai para a descrição do portal; fundamentos se juntam', () => {
  const record = toSanctionRecord(
    'CNEP',
    ceisRecord({
      tipoSancao: { descricaoResumida: null, descricaoPortal: 'Multa' },
      valorMulta: '150.000,00',
      abrangenciaDefinidaDecisaoJudicial: null,
      informacoesAdicionaisDoOrgaoSancionador: null,
      fundamentacao: [{ descricao: 'Lei 12.846/2013, art. 6º' }, { codigo: 'Art. 7º' }, { descricao: '  ' }, 'texto solto'],
    }),
  );
  assert.equal(record.category, 'Multa');
  assert.equal(record.note, 'Multa: 150.000,00');
  assert.equal(record.legalBasis, 'Lei 12.846/2013, art. 6º; Art. 7º');
});

test('o valor da multa só entra no CNEP', () => {
  assert.equal(toSanctionRecord('CEIS', ceisRecord({ valorMulta: '1,00' })).note, 'Abrangência: Âmbito do órgão sancionador · Sem informações adicionais');
});

test('CEPIM: o motivo é o tipo, o órgão superior é o órgão, e não há datas; o convênio vai na observação', async () => {
  const { fetchImpl } = fakeFetch(() => json([cepimRecord()]));
  const result = await sourceWith(fetchImpl).search('CEPIM', CNPJ);
  assert.deepEqual(result.records, [
    {
      id: '55',
      category: 'Omissão no dever de prestar contas',
      organ: 'Ministério da Saúde',
      startDate: null,
      endDate: null,
      legalBasis: null,
      process: null,
      note: 'Convênio 987654 · Construção de unidade básica de saúde',
    },
  ]);
});

test('campo ausente ou nulo vira null, data que não se lê vira null e os textos têm tamanho limitado', () => {
  const record = toSanctionRecord(
    'CEIS',
    ceisRecord({
      id: null,
      tipoSancao: null,
      orgaoSancionador: {},
      dataInicioSancao: 'Indeterminado',
      dataFimSancao: '',
      fundamentacao: null,
      numeroProcesso: '   ',
      abrangenciaDefinidaDecisaoJudicial: undefined,
      informacoesAdicionaisDoOrgaoSancionador: 'x'.repeat(1000),
    }),
  );
  assert.deepEqual(record, {
    id: null,
    category: null,
    organ: null,
    startDate: null,
    endDate: null,
    legalBasis: null,
    process: null,
    note: 'x'.repeat(200),
  });
  assert.ok(toSanctionRecord('CEIS', ceisRecord({ tipoSancao: { descricaoResumida: 'y'.repeat(900) } })).category!.length <= 300);
});

test('a data final nas duas formas da fonte (DD/MM/AAAA e AAAA-MM-DD) chega como AAAA-MM-DD', () => {
  assert.equal(toSanctionRecord('CEIS', ceisRecord({ dataFimSancao: '2027-03-15' })).endDate, '2027-03-15');
  assert.equal(toSanctionRecord('CEIS', ceisRecord({ dataFimSancao: '15/03/2027' })).endDate, '2027-03-15');
});

// --- A conferência do código devolvido -----------------------------------------------------------------------------------

test('o código lido: pontuação é ignorada, a máscara esconde dígitos e valem só 11 ou 14 posições com dígitos suficientes', () => {
  assert.deepEqual(readCodePattern('11.222.333/0001-81'), [...'11222333000181']);
  assert.deepEqual(readCodePattern('123.456.789-09'), [...'12345678909']);
  assert.deepEqual(readCodePattern('***.456.789-**'), [null, null, null, '4', '5', '6', '7', '8', '9', null, null]);
  assert.equal(MIN_VISIBLE_CODE_DIGITS, 6);
  assert.equal(readCodePattern('***.***.789-**'), null, 'poucos dígitos visíveis: não confere nada');
  assert.equal(readCodePattern('***.***.***-**'), null);
  assert.equal(readCodePattern('123.456.789'), null, 'tamanho que não é de CPF nem de CNPJ');
  assert.equal(readCodePattern('123.456.789-0A'), null, 'letra que não é máscara');
  assert.equal(readCodePattern(''), null);
  assert.equal(readCodePattern(null), null);
  assert.equal(readCodePattern(12345678909), null);
});

test('o código bate com o documento posição por posição; a máscara combina com qualquer dígito; o tamanho tem de ser o mesmo', () => {
  assert.equal(codeMatchesDocument(readCodePattern('***.456.789-**')!, CPF), true);
  assert.equal(codeMatchesDocument(readCodePattern('***.456.780-**')!, CPF), false);
  assert.equal(codeMatchesDocument(readCodePattern('123.456.789-09')!, CPF), true);
  assert.equal(codeMatchesDocument(readCodePattern('123.456.789-08')!, CPF), false);
  assert.equal(codeMatchesDocument(readCodePattern('11.222.333/0001-81')!, CNPJ), true);
  assert.equal(codeMatchesDocument(readCodePattern('11.222.333/0001-81')!, CPF), false, 'CNPJ não é CPF');
});

test('o código do registro é conferido em todos os lugares onde a base o mostra', () => {
  assert.equal(checkRecordCode('CEIS', ceisRecord(), CNPJ), 'match');
  assert.equal(checkRecordCode('CEIS', ceisRecord(), '99888777000166'), 'mismatch');
  const withoutMainCode = ceisRecord({ sancionado: { nome: SANCTIONED_NAME } });
  assert.equal(checkRecordCode('CEIS', withoutMainCode, CNPJ), 'match', 'o código da pessoa também vale');
  const withoutAnyCode = ceisRecord({ sancionado: { nome: SANCTIONED_NAME }, pessoa: { nome: SANCTIONED_NAME } });
  assert.equal(checkRecordCode('CEIS', withoutAnyCode, CNPJ), 'unreadable');
  assert.equal(checkRecordCode('CEPIM', cepimRecord(), CNPJ), 'match');
  assert.equal(checkRecordCode('CEPIM', cepimRecord({ pessoaJuridica: {} }), CNPJ), 'unreadable');
});

test('registro de outro documento é descartado e contado; os do documento consultado ficam', async () => {
  const other = ceisRecord({
    id: 2,
    sancionado: { codigoFormatado: '99.888.777/0001-66' },
    pessoa: { cnpjFormatado: '99.888.777/0001-66' },
  });
  const { fetchImpl } = fakeFetch((call) => json(call.url.searchParams.get('pagina') === '1' ? [ceisRecord({ id: 1 }), other] : []));
  const result = await sourceWith(fetchImpl).search('CEIS', CNPJ);

  assert.deepEqual(result.records.map((record) => record.id), ['1']);
  assert.equal(result.discarded, 1);
});

test('só registros de outro documento: sem registro (o filtro da fonte não casou), com o descarte contado', async () => {
  const other = ceisRecord({ sancionado: { codigoFormatado: '99.888.777/0001-66' }, pessoa: { cnpjFormatado: '99.888.777/0001-66' } });
  const { fetchImpl } = fakeFetch((call) => json(call.url.searchParams.get('pagina') === '1' ? [other, other] : []));
  const result = await sourceWith(fetchImpl).search('CEIS', CNPJ);
  assert.deepEqual(result.records, []);
  assert.equal(result.discarded, 2);
});

test('CPF mascarado na resposta: o registro cujos dígitos visíveis batem fica; o que não bate sai', async () => {
  const mine = ceisRecord({ id: 1, sancionado: { codigoFormatado: '***.456.789-**' }, pessoa: { cpfFormatado: '***.456.789-**', cnpjFormatado: null } });
  const notMine = ceisRecord({ id: 2, sancionado: { codigoFormatado: '***.111.222-**' }, pessoa: { cpfFormatado: '***.111.222-**', cnpjFormatado: null } });
  const { fetchImpl } = fakeFetch((call) => json(call.url.searchParams.get('pagina') === '1' ? [mine, notMine] : []));
  const result = await sourceWith(fetchImpl).search('CNEP', CPF);

  assert.deepEqual(result.records.map((record) => record.id), ['1']);
  assert.equal(result.discarded, 1);
  assert.ok(!JSON.stringify(result).includes('456.789'), 'o CPF, nem parcial, não fica no resultado');
});

test('registro sem código legível não vira "sem registro": a base falha, e a mensagem não leva dado nenhum', async () => {
  const noCode = ceisRecord({ sancionado: { nome: SANCTIONED_NAME }, pessoa: { nome: SANCTIONED_NAME } });
  const { fetchImpl } = fakeFetch(() => json([noCode]));
  await assert.rejects(sourceWith(fetchImpl).search('CEIS', CNPJ), (error: Error) => {
    assert.ok(error instanceof SanctionSourceUnavailableError);
    assert.match(error.message, /readable code/);
    assert.ok(!error.message.includes(SANCTIONED_NAME));
    return true;
  });
});

test('item que não é objeto na lista derruba a leitura', async () => {
  const { fetchImpl } = fakeFetch(() => json(['texto', 12]));
  await assert.rejects(sourceWith(fetchImpl).search('CEIS', CNPJ), SanctionSourceUnavailableError);
});

// --- Falhas da fonte -----------------------------------------------------------------------------------------------------

test('429 vira "limitada" na hora, sem nova tentativa', async () => {
  const { fetchImpl, calls } = fakeFetch(() => noBody(429));
  await assert.rejects(sourceWith(fetchImpl).search('CEIS', CNPJ), SanctionSourceRateLimitedError);
  assert.equal(calls.length, 1);
});

test('400, 401, 403 e 404 viram "indisponível" na hora, sem nova tentativa e sem ler o corpo', async () => {
  for (const status of [400, 401, 403, 404]) {
    const { fetchImpl, calls } = fakeFetch(() => new Response(`corpo secreto ${KEY} ${CNPJ}`, { status }));
    await assert.rejects(sourceWith(fetchImpl).search('CEIS', CNPJ), (error: Error) => {
      assert.ok(error instanceof SanctionSourceUnavailableError);
      assert.equal(error.message, `HTTP ${status}`);
      return true;
    });
    assert.equal(calls.length, 1, `HTTP ${status}`);
  }
});

test('5xx ganha uma segunda tentativa; recuperada, o resultado vem normal; falhando de novo, "indisponível"', async () => {
  const recovering = fakeFetch((call, index) =>
    index === 0 ? noBody(503) : json(call.url.searchParams.get('pagina') === '1' ? [ceisRecord()] : []),
  );
  const recovered = await sourceWith(recovering.fetchImpl).search('CEIS', CNPJ);
  assert.equal(recovered.records.length, 1);
  assert.equal(recovering.calls.length, 3, 'a falha, a nova tentativa e a segunda página (vazia)');

  const failing = fakeFetch(() => noBody(500));
  await assert.rejects(sourceWith(failing.fetchImpl).search('CEIS', CNPJ), (error: Error) => {
    assert.ok(error instanceof SanctionSourceUnavailableError);
    assert.equal(error.message, 'HTTP 500');
    return true;
  });
  assert.equal(failing.calls.length, 2);
});

test('erro de rede ganha uma segunda tentativa; a mensagem leva só o nome do erro, nunca a URL, a chave ou o documento', async () => {
  const networkError = () => Object.assign(new TypeError(`fetch failed for https://x/?codigoSancionado=${CNPJ} ${KEY}`), { cause: new Error(CNPJ) });
  const { fetchImpl, calls } = fakeFetch(() => networkError());
  await assert.rejects(sourceWith(fetchImpl).search('CEIS', CNPJ), (error: Error) => {
    assert.ok(error instanceof SanctionSourceUnavailableError);
    assert.equal(error.message, 'Request failed (TypeError)');
    assert.ok(!error.message.includes(CNPJ) && !error.message.includes(KEY));
    return true;
  });
  assert.equal(calls.length, 2);
});

test('resposta que não é JSON ou não é uma lista vira "indisponível"', async () => {
  const notJson = fakeFetch(() => new Response('<html>erro</html>', { status: 200 }));
  await assert.rejects(sourceWith(notJson.fetchImpl).search('CEIS', CNPJ), (error: Error) => {
    assert.ok(error instanceof SanctionSourceUnavailableError);
    assert.equal(error.message, 'Response was not valid JSON');
    return true;
  });
  assert.equal(notJson.calls.length, 2, 'uma nova tentativa');

  const notList = fakeFetch(() => json({ erro: 'formato novo', registros: [ceisRecord()] }));
  await assert.rejects(sourceWith(notList.fetchImpl).search('CEIS', CNPJ), (error: Error) => {
    assert.ok(error instanceof SanctionSourceUnavailableError);
    assert.equal(error.message, 'Unexpected response format');
    return true;
  });
  assert.equal(notList.calls.length, 1);
});

test('falha na segunda página: a consulta toda falha (o resultado parcial não vale como completo)', async () => {
  const { fetchImpl } = fakeFetch((call) => (call.url.searchParams.get('pagina') === '1' ? json([ceisRecord()]) : noBody(401)));
  await assert.rejects(sourceWith(fetchImpl).search('CEIS', CNPJ), SanctionSourceUnavailableError);
});

test('o prazo total encerra a consulta: sinal já cancelado não chega à fonte, e o cancelado no meio do pedido derruba o pedido', async () => {
  const aborted = fakeFetch(() => json([]));
  const done = new AbortController();
  done.abort();
  await assert.rejects(sourceWith(aborted.fetchImpl).search('CEIS', CNPJ, { signal: done.signal }), (error: Error) => {
    assert.ok(error instanceof SanctionSourceUnavailableError);
    assert.equal(error.message, 'Deadline exceeded');
    return true;
  });
  assert.equal(aborted.calls.length, 0);

  const controller = new AbortController();
  const hanging = (async (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      // O prazo estoura com o pedido no ar.
      queueMicrotask(() => controller.abort());
    })) as typeof fetch;
  await assert.rejects(sourceWith(hanging).search('CEIS', CNPJ, { signal: controller.signal }), (error: Error) => {
    assert.equal(error.message, 'Deadline exceeded');
    return true;
  });
});

// --- Ritmo ---------------------------------------------------------------------------------------------------------------

test('os pedidos saem espaçados pelo intervalo, e consultas ao mesmo tempo dividem a mesma fila', async () => {
  const clock = fakeClock();
  const startedAt: number[] = [];
  const { fetchImpl } = fakeFetch(() => {
    startedAt.push(clock.now());
    return json([]);
  });
  const source = createPortalSanctionSource({
    apiKey: KEY,
    fetchImpl,
    requestIntervalMs: 1000,
    retryDelayMs: 0,
    now: clock.now,
    sleep: clock.sleep,
  });

  await source.search('CEIS', CNPJ);
  await source.search('CNEP', CNPJ);
  await Promise.all([source.search('CEIS', CPF), source.search('CNEP', CPF)]);

  assert.deepEqual(startedAt, [0, 1000, 2000, 3000]);
});

test('o intervalo vale também para a nova tentativa', async () => {
  const clock = fakeClock();
  const startedAt: number[] = [];
  const { fetchImpl } = fakeFetch(() => {
    startedAt.push(clock.now());
    return startedAt.length === 1 ? noBody(502) : json([]);
  });
  const source = createPortalSanctionSource({ apiKey: KEY, fetchImpl, requestIntervalMs: 1000, retryDelayMs: 0, now: clock.now, sleep: clock.sleep });
  await source.search('CEIS', CNPJ);
  assert.deepEqual(startedAt, [0, 1000]);
});

// --- A fonte do servidor -------------------------------------------------------------------------------------------------

test('sem a chave no ambiente, não há fonte: a consulta de sanções fica indisponível', () => {
  assert.equal(createPortalSanctionSourceFromEnv({}), null);
  assert.equal(createPortalSanctionSourceFromEnv({ [PORTAL_API_KEY_VARIABLE]: '' }), null);
  assert.equal(createPortalSanctionSourceFromEnv({ [PORTAL_API_KEY_VARIABLE]: '   ' }), null);
  assert.notEqual(createPortalSanctionSourceFromEnv({ [PORTAL_API_KEY_VARIABLE]: KEY }), null);
});

test('o intervalo do ambiente: padrão de 1000 ms; fora de 250 a 30000 ou não inteiro, o padrão com aviso (sem a chave no aviso)', () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    assert.equal(SANCTION_DEFAULT_INTERVAL_MS, 1000);
    assert.equal(readSanctionRequestInterval(undefined), 1000);
    assert.equal(readSanctionRequestInterval(''), 1000);
    assert.equal(readSanctionRequestInterval('250'), 250);
    assert.equal(readSanctionRequestInterval('2500'), 2500);
    assert.equal(readSanctionRequestInterval('30000'), 30_000);
    assert.equal(warnings.length, 0);
    for (const invalid of ['0', '249', '30001', '1.5', 'abc', '-5']) {
      assert.equal(readSanctionRequestInterval(invalid), 1000, invalid);
    }
    assert.equal(warnings.length, 6);
    assert.ok(warnings.every((warning) => warning.includes(PORTAL_REQUEST_INTERVAL_VARIABLE) && !warning.includes(KEY)));
  } finally {
    console.warn = originalWarn;
  }
});
