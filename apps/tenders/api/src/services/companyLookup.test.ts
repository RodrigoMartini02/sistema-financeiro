import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRASILAPI_CNPJ_URL,
  CompanyLookupUnavailableError,
  CompanyNotFoundError,
  LOOKUP_USER_AGENT,
  createBrasilApiCompanySource,
  normalizeCompanyLookup,
} from './companyLookup';

// Consulta cadastral do CNPJ: o normalizador sobre respostas no formato real da fonte (reduzidas e com dados de
// exemplo) e o cliente HTTP com `fetch` simulado. Nenhum teste chama a rede.

const CNPJ = '11222333000181';

/** Resposta no formato da BrasilAPI, com valores de exemplo e o quadro societário que a fonte traz. */
function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cnpj: CNPJ,
    razao_social: '  EMPRESA   EXEMPLO LTDA. ',
    nome_fantasia: 'EXEMPLO',
    data_inicio_atividade: '2004-09-01',
    opcao_pelo_mei: null,
    data_exclusao_do_mei: null,
    codigo_porte: 5,
    porte: 'DEMAIS',
    codigo_natureza_juridica: 2062,
    natureza_juridica: 'Sociedade Empresária Limitada',
    situacao_cadastral: 2,
    descricao_situacao_cadastral: 'ATIVA',
    data_situacao_cadastral: '2005-11-03',
    cnae_fiscal: 6319400,
    cnae_fiscal_descricao: 'Portais, provedores de conteúdo e outros serviços de informação na internet',
    cnaes_secundarios: [
      { codigo: 4751201, descricao: 'Comércio varejista especializado de equipamentos de informática' },
      { codigo: 6204000, descricao: 'Consultoria em tecnologia da informação' },
    ],
    cep: '04538133',
    descricao_tipo_de_logradouro: 'AVENIDA',
    logradouro: 'BRIG FARIA LIMA',
    numero: '3477',
    complemento: 'ANDAR 17A20 TSUL 2',
    bairro: 'ITAIM BIBI',
    municipio: 'SAO PAULO',
    uf: 'SP',
    ddd_telefone_1: '1123958400',
    ddd_telefone_2: '',
    email: null,
    capital_social: 200000000,
    qsa: [{ nome_socio: 'PESSOA DE EXEMPLO', cnpj_cpf_do_socio: '***123456**', qualificacao_socio: 'Sócio-Administrador' }],
    regime_tributario: [{ ano: 2016, forma_de_tributacao: 'LUCRO REAL' }],
    ...overrides,
  };
}

test('normaliza a resposta: nomes, abertura, porte, tipo, situação, CNAEs, endereço e contato', () => {
  assert.deepEqual(normalizeCompanyLookup(response()), {
    legalName: 'EMPRESA EXEMPLO LTDA.',
    tradeName: 'EXEMPLO',
    openingDate: '2004-09-01',
    size: 'DEMAIS',
    legalType: 'LTDA',
    legalNatureCode: '2062',
    legalNature: 'Sociedade Empresária Limitada',
    registrationStatus: 'ATIVA',
    registrationStatusDate: '2005-11-03',
    mainCnae: { code: '6319400', description: 'Portais, provedores de conteúdo e outros serviços de informação na internet' },
    secondaryCnaes: [
      { code: '4751201', description: 'Comércio varejista especializado de equipamentos de informática' },
      { code: '6204000', description: 'Consultoria em tecnologia da informação' },
    ],
    zipCode: '04538133',
    street: 'AVENIDA BRIG FARIA LIMA',
    number: '3477',
    complement: 'ANDAR 17A20 TSUL 2',
    district: 'ITAIM BIBI',
    city: 'SAO PAULO',
    state: 'SP',
    phone: '(11) 2395-8400',
    email: null,
  });
});

test('o quadro societário, o capital e o regime tributário não passam do normalizador', () => {
  const text = JSON.stringify(normalizeCompanyLookup(response()));
  for (const forbidden of ['PESSOA DE EXEMPLO', 'qsa', '***123456**', 'Sócio-Administrador', 'LUCRO REAL', '200000000']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
});

test('porte: MEI pela opção da Receita (e some se foi excluído); ME, EPP e Demais pelo código; sem código, nada', () => {
  const size = (overrides: Record<string, unknown>) => normalizeCompanyLookup(response(overrides)).size;
  assert.equal(size({ opcao_pelo_mei: true, codigo_porte: 1 }), 'MEI');
  assert.equal(size({ opcao_pelo_mei: true, data_exclusao_do_mei: '2024-01-31', codigo_porte: 1 }), 'ME', 'ex-MEI segue pelo código');
  assert.equal(size({ opcao_pelo_mei: false, codigo_porte: 1 }), 'ME');
  assert.equal(size({ codigo_porte: 3 }), 'EPP');
  assert.equal(size({ codigo_porte: 5 }), 'DEMAIS');
  assert.equal(size({ codigo_porte: '3' }), 'EPP', 'código como texto também vale');
  assert.equal(size({ codigo_porte: 0 }), null);
  assert.equal(size({ codigo_porte: null }), null);
  assert.equal(size({ codigo_porte: undefined, opcao_pelo_mei: undefined }), null);
});

test('tipo jurídico: 2062 LTDA, 2305 EIRELI, 2046 e 2054 SA, o resto Outros; sem código, nada', () => {
  const legalType = (code: unknown) => normalizeCompanyLookup(response({ codigo_natureza_juridica: code })).legalType;
  assert.equal(legalType(2062), 'LTDA');
  assert.equal(legalType(2305), 'EIRELI');
  assert.equal(legalType(2046), 'SA');
  assert.equal(legalType(2054), 'SA');
  assert.equal(legalType(2135), 'OUTROS', 'empresário individual');
  assert.equal(legalType(2038), 'OUTROS', 'sociedade de economia mista');
  assert.equal(legalType('2062'), 'LTDA');
  assert.equal(legalType(0), null);
  assert.equal(legalType(null), null);
  assert.equal(legalType(undefined), null);
});

test('situação cadastral: pela descrição (qualquer caixa) e, se não casar, pelo código', () => {
  const status = (description: unknown, code: unknown) =>
    normalizeCompanyLookup(response({ descricao_situacao_cadastral: description, situacao_cadastral: code })).registrationStatus;
  assert.equal(status('ATIVA', 2), 'ATIVA');
  assert.equal(status('suspensa', 3), 'SUSPENSA');
  assert.equal(status(' Inapta ', 4), 'INAPTA');
  assert.equal(status('BAIXADA', 8), 'BAIXADA');
  assert.equal(status('NULA', 1), 'NULA');
  assert.equal(status('', 4), 'INAPTA', 'sem descrição, pelo código');
  assert.equal(status('SITUAÇÃO NOVA', 2), 'ATIVA', 'descrição fora da lista, pelo código');
  assert.equal(status('SITUAÇÃO NOVA', 99), null);
  assert.equal(status(null, null), null);
});

test('texto vazio da fonte vira null; nome fantasia, complemento, e-mail e telefone em branco não chegam como texto', () => {
  const lookup = normalizeCompanyLookup(
    response({
      nome_fantasia: '',
      complemento: '   ',
      email: '',
      ddd_telefone_1: '',
      ddd_telefone_2: '',
      numero: '',
      bairro: null,
      data_situacao_cadastral: null,
      data_inicio_atividade: '',
    }),
  );
  assert.deepEqual(
    [lookup.tradeName, lookup.complement, lookup.email, lookup.phone, lookup.number, lookup.district, lookup.registrationStatusDate, lookup.openingDate],
    [null, null, null, null, null, null, null, null],
  );
});

test('datas: só ISO válida; telefone: 10 ou 11 dígitos, caindo no segundo número se o primeiro não vale', () => {
  assert.equal(normalizeCompanyLookup(response({ data_inicio_atividade: '2024-02-30' })).openingDate, null);
  assert.equal(normalizeCompanyLookup(response({ data_inicio_atividade: '01/09/2004' })).openingDate, null);
  const phone = (first: unknown, second: unknown) =>
    normalizeCompanyLookup(response({ ddd_telefone_1: first, ddd_telefone_2: second })).phone;
  assert.equal(phone('11987654321', ''), '(11) 98765-4321');
  assert.equal(phone('1123958400', '1133334444'), '(11) 2395-8400');
  assert.equal(phone('123', '1133334444'), '(11) 3333-4444');
  assert.equal(phone('', '11987654321'), '(11) 98765-4321');
  assert.equal(phone('123', '45'), null);
  assert.equal(phone(1123958400, null), '(11) 2395-8400', 'número em vez de texto');
});

test('CEP: 8 dígitos (completa o zero que um número perde); UF só da lista; e-mail só com formato válido, em minúsculas', () => {
  const lookup = (overrides: Record<string, unknown>) => normalizeCompanyLookup(response(overrides));
  assert.equal(lookup({ cep: 4538133 }).zipCode, '04538133');
  assert.equal(lookup({ cep: '04538-133' }).zipCode, '04538133');
  assert.equal(lookup({ cep: '123' }).zipCode, null);
  assert.equal(lookup({ uf: 'sp' }).state, 'SP');
  assert.equal(lookup({ uf: 'XX' }).state, null);
  assert.equal(lookup({ email: 'Contato@Exemplo.COM.BR ' }).email, 'contato@exemplo.com.br');
  assert.equal(lookup({ email: 'sem-arroba' }).email, null);
});

test('logradouro: tipo e nome juntos, sem repetir o tipo; sem nome, nada', () => {
  const street = (kind: unknown, name: unknown) =>
    normalizeCompanyLookup(response({ descricao_tipo_de_logradouro: kind, logradouro: name })).street;
  assert.equal(street('RUA', 'DAS FLORES'), 'RUA DAS FLORES');
  assert.equal(street('RUA', 'RUA DAS FLORES'), 'RUA DAS FLORES');
  assert.equal(street('', 'DAS FLORES'), 'DAS FLORES');
  assert.equal(street('RUA', ''), null);
  assert.equal(street('RUA', null), null);
});

test('CNAEs: 7 dígitos, sem o código 0, sem repetição; lista ausente é "não veio" e vazia é "sem secundário"', () => {
  const lookup = (overrides: Record<string, unknown>) => normalizeCompanyLookup(response(overrides));
  assert.deepEqual(lookup({ cnae_fiscal: 111301, cnae_fiscal_descricao: 'Cultivo' }).mainCnae, { code: '0111301', description: 'Cultivo' });
  assert.equal(lookup({ cnae_fiscal: 0 }).mainCnae, null);
  assert.equal(lookup({ cnae_fiscal: null }).mainCnae, null);
  assert.deepEqual(
    lookup({
      cnaes_secundarios: [
        { codigo: 0, descricao: '' },
        { codigo: 4751201, descricao: 'Primeiro' },
        { codigo: '4751201', descricao: 'Repetido' },
        { codigo: 6204000, descricao: null },
      ],
    }).secondaryCnaes,
    [{ code: '4751201', description: 'Primeiro' }, { code: '6204000', description: '' }],
  );
  assert.deepEqual(lookup({ cnaes_secundarios: [] }).secondaryCnaes, []);
  assert.equal(lookup({ cnaes_secundarios: null }).secondaryCnaes, null);
  assert.equal(lookup({ cnaes_secundarios: undefined }).secondaryCnaes, null);
});

test('textos são cortados no tamanho da coluna e os espaços repetidos se juntam', () => {
  const lookup = normalizeCompanyLookup(response({ razao_social: 'A'.repeat(200), nome_fantasia: 'B  B'.repeat(80), municipio: 'C'.repeat(300) }));
  assert.equal(lookup.legalName.length, 150);
  assert.equal(lookup.tradeName?.length, 150);
  assert.equal(lookup.tradeName?.includes('  '), false);
  assert.equal(lookup.city?.length, 100);
});

test('resposta que não é um objeto, ou sem razão social, é "indisponível"', () => {
  const unavailable = (error: unknown) => error instanceof CompanyLookupUnavailableError;
  assert.throws(() => normalizeCompanyLookup([]), unavailable);
  assert.throws(() => normalizeCompanyLookup(null), unavailable);
  assert.throws(() => normalizeCompanyLookup('texto'), unavailable);
  assert.throws(() => normalizeCompanyLookup(response({ razao_social: '   ' })), unavailable);
  assert.throws(() => normalizeCompanyLookup(response({ razao_social: undefined })), unavailable);
  assert.throws(() => normalizeCompanyLookup(response({ cnaes_secundarios: 'não é lista' })), unavailable);
  assert.throws(() => normalizeCompanyLookup(response({ opcao_pelo_mei: 'sim' })), unavailable);
});

// ---- cliente HTTP ----

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/** Um `fetch` que responde na ordem; função ou erro na fila vira a resposta ou a falha daquela tentativa. */
function fakeFetch(...steps: Array<Response | Error | (() => Response)>): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step() : step!.clone();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const sourceWith = (fetchImpl: typeof fetch, maxAttempts = 2) =>
  createBrasilApiCompanySource({ fetchImpl, retryDelayMs: 0, maxAttempts, timeoutMs: 5_000 });

test('cliente: busca o CNPJ na fonte, com tempo limite e só os cabeçalhos accept e o User-Agent genérico', async () => {
  const { fetchImpl, calls } = fakeFetch(json(response()));
  const lookup = await sourceWith(fetchImpl).lookup(CNPJ);
  assert.equal(lookup.legalName, 'EMPRESA EXEMPLO LTDA.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `${BRASILAPI_CNPJ_URL}/${CNPJ}`);
  assert.deepEqual(calls[0]?.init?.headers, { accept: 'application/json', 'user-agent': LOOKUP_USER_AGENT });
  assert.equal(LOOKUP_USER_AGENT, 'company-lookup/1.0');
  assert.doesNotMatch(LOOKUP_USER_AGENT, /fingerence|licita|@|https?:/i, 'o nome não leva produto, e-mail nem endereço');
  assert.ok(calls[0]?.init?.signal, 'cada tentativa tem tempo limite');
});

test('cliente: 404 e 400 viram "não encontrado", sem repetir', async () => {
  for (const status of [404, 400]) {
    const { fetchImpl, calls } = fakeFetch(json({ message: 'CNPJ não encontrado', detalhe: 'não deve ser lido' }, status));
    await assert.rejects(sourceWith(fetchImpl).lookup(CNPJ), (error) => error instanceof CompanyNotFoundError, String(status));
    assert.equal(calls.length, 1, String(status));
  }
});

test('cliente: 5xx, 429, falha de rede e JSON quebrado ganham uma nova tentativa', async () => {
  const good = json(response());
  for (const failure of [json({}, 503), json({}, 500), json({}, 429), new TypeError('fetch failed'), new Response('<html>', { status: 200 })]) {
    const { fetchImpl, calls } = fakeFetch(failure, good);
    const lookup = await sourceWith(fetchImpl).lookup(CNPJ);
    assert.equal(lookup.legalName, 'EMPRESA EXEMPLO LTDA.');
    assert.equal(calls.length, 2);
  }
});

test('cliente: esgotadas as tentativas, é "indisponível" com o motivo, sem texto da resposta', async () => {
  const tooMany = fakeFetch(json({ message: 'segredo do corpo' }, 429));
  await assert.rejects(
    sourceWith(tooMany.fetchImpl).lookup(CNPJ),
    (error) => error instanceof CompanyLookupUnavailableError && error.message === 'HTTP 429',
  );
  assert.equal(tooMany.calls.length, 2);

  const timeout = fakeFetch(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
  await assert.rejects(
    sourceWith(timeout.fetchImpl).lookup(CNPJ),
    (error) => error instanceof CompanyLookupUnavailableError && /TimeoutError/.test(error.message),
  );
  assert.equal(timeout.calls.length, 2);

  const once = fakeFetch(json({}, 503));
  await assert.rejects(sourceWith(once.fetchImpl, 1).lookup(CNPJ), CompanyLookupUnavailableError);
  assert.equal(once.calls.length, 1, 'com uma só tentativa, não repete');
});

test('cliente: resposta inesperada e erro de outro tipo não são repetidos', async () => {
  const unexpected = fakeFetch(json([]));
  await assert.rejects(sourceWith(unexpected.fetchImpl).lookup(CNPJ), CompanyLookupUnavailableError);
  assert.equal(unexpected.calls.length, 1);

  const forbidden = fakeFetch(json({}, 403));
  await assert.rejects(
    sourceWith(forbidden.fetchImpl).lookup(CNPJ),
    (error) => error instanceof CompanyLookupUnavailableError && error.message === 'HTTP 403',
  );
  assert.equal(forbidden.calls.length, 1);
});

test('cliente: a URL só é montada com 14 dígitos; nada que não seja CNPJ chega à fonte', async () => {
  const { fetchImpl, calls } = fakeFetch(json(response()));
  const source = sourceWith(fetchImpl);
  for (const bad of ['', '1122233300018', '112223330001812', '11.222.333/0001-81', '../../admin', '11222333000181?x=1', 'abcdefghijklmn']) {
    await assert.rejects(source.lookup(bad), (error) => error instanceof Error && !(error instanceof CompanyLookupUnavailableError), bad);
  }
  assert.equal(calls.length, 0);
});
