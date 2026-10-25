import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComprasGovDateParams, ComprasGovRawResponse } from './comprasGovClient';
import { renderProbeReport, runResultProbe, type ResultProbeDeps } from './resultProbe';

// Hoje (Brasília) 2026-09-30; o dia da amostra padrão é 2026-09-20.
const NOW = new Date('2026-09-30T15:00:00Z');
const SAMPLE_DAY = '2026-09-20';
const PF_DOCUMENT = '12345678901';
const PF_NAME = 'MARIA APARECIDA DA SILVA';

function record(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    idContratacaoPNCP: '03353358000196-1-000216/2026',
    numeroItemPncp: 1,
    sequencialResultado: 1,
    niFornecedor: '11222333000181',
    tipoPessoa: 'PJ',
    nomeRazaoSocialFornecedor: 'EMPRESA EXEMPLO LTDA',
    porteFornecedorNome: 'Microempresa',
    valorTotalHomologado: 1500.5,
    dataResultadoPncp: `${SAMPLE_DAY}T10:00:00`,
    dataAtualizacaoPncp: `${SAMPLE_DAY}T12:00:00`,
    dataCancelamentoPncp: null,
    situacaoCompraItemResultadoId: 1,
    situacaoCompraItemResultadoNome: 'Informado',
    unidadeOrgaoUfSigla: 'MA',
    ...overrides,
  };
}

const PAGE_ONE = [
  record({}),
  record({ numeroItemPncp: 2, niFornecedor: PF_DOCUMENT, tipoPessoa: 'PF', nomeRazaoSocialFornecedor: PF_NAME, unidadeOrgaoUfSigla: 'SP' }),
  record({ numeroItemPncp: 3, tipoPessoa: 'PJ', situacaoCompraItemResultadoId: 2, situacaoCompraItemResultadoNome: 'Cancelado', dataAtualizacaoPncp: '2026-09-25T09:00:00' }),
];
const PAGE_TWO = [
  record({ numeroItemPncp: 4, idContratacaoPNCP: 'formato-diferente-123' }),
  record({ numeroItemPncp: 5, niFornecedor: '99887766000155', tipoPessoa: 'PJ', unidadeOrgaoUfSigla: 'RJ' }),
];

function json(body: unknown, status = 200): ComprasGovRawResponse {
  return { status, json: body, retryAfter: null, errorPreview: '', elapsedMs: 120 };
}

function failure(status: number, preview = 'erro', retryAfter: string | null = null): ComprasGovRawResponse {
  return { status, json: null, retryAfter, errorPreview: preview, elapsedMs: 80 };
}

interface FakeOptions {
  /** Resposta a todo pedido (testes de falha). */
  always?: ComprasGovRawResponse;
  /** 429 a partir desta página da amostra. */
  limitSampleAtPage?: number;
}

function createFakeDeps(options: FakeOptions = {}): { deps: ResultProbeDeps; calls: Array<{ dates: ComprasGovDateParams; page: number; size: number }> } {
  const calls: Array<{ dates: ComprasGovDateParams; page: number; size: number }> = [];
  const deps: ResultProbeDeps = {
    now: () => NOW,
    requestIntervalMs: 1500,
    client: {
      get requestCount() {
        return calls.length;
      },
      async requestRaw(dates, page, size = 500) {
        calls.push({ dates, page, size });
        if (options.always) {
          return options.always;
        }
        if (size === 501) {
          return failure(400, 'tamanhoPagina deve ser no máximo 500');
        }
        if (size === 10) {
          // Contagem por mês: sem dado antes de 2021-04.
          const month = Number(dates.initial.slice(5, 7)) + Number(dates.initial.slice(0, 4)) * 12;
          const total = month < 2021 * 12 + 4 ? 0 : 1000 + (month - 2021 * 12);
          return json({ resultado: total > 0 ? PAGE_ONE.slice(0, 1) : [], totalRegistros: total, totalPaginas: Math.ceil(total / 10), paginasRestantes: 0 });
        }
        if (dates.initial === dates.final) {
          // Janela [d, d]: vazia, porque o fim é exclusivo.
          return json({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
        }
        if (options.limitSampleAtPage === page) {
          return failure(429, 'muitas requisições', '45');
        }
        return page === 1
          ? json({ resultado: PAGE_ONE, totalRegistros: 5, totalPaginas: 2, paginasRestantes: 1 })
          : json({ resultado: PAGE_TWO, totalRegistros: 5, totalPaginas: 2, paginasRestantes: 0 });
      },
    },
  };
  return { deps, calls };
}

test('sondagem completa: estrutura, campos, situações, documentos, fronteira, volume e amostra', async () => {
  const { deps } = createFakeDeps();
  const report = await runResultProbe(deps);

  assert.equal(report.sampleDay, SAMPLE_DAY);
  assert.equal(report.skipped, undefined);
  assert.deepEqual(report.structure['topKeys'], ['resultado', 'totalRegistros', 'totalPaginas', 'paginasRestantes']);
  assert.equal(report.structure['recordsKey'], 'resultado');
  assert.equal(report.structure['pagesRead'], 2);
  assert.equal(report.structure['recordsRead'], 5);
  assert.equal(report.structure['totalRegistros'], 5);

  assert.equal(report.fields?.['niFornecedor'], '100%');
  assert.equal(report.fields?.['dataCancelamentoPncp'], '0%');

  assert.deepEqual(report.distinctValues?.['situacaoCompraItemResultadoNome'], { Informado: 4, Cancelado: 1 });
  assert.deepEqual(report.distinctValues?.['tipoPessoa'], { PJ: 4, PF: 1 });
  assert.deepEqual(report.distinctValues?.['porteFornecedorNome'], { Microempresa: 5 });
  // Campo de documento e de nome de pessoa nunca é listado como valor.
  assert.equal(report.distinctValues?.['niFornecedor'], undefined);
  assert.equal(report.distinctValues?.['nomeRazaoSocialFornecedor'], undefined);

  assert.deepEqual(report.supplierDocument?.['lengthsByType'], { PJ: { '14': 4 }, PF: { '11': 1 } });
  assert.equal(report.supplierDocument?.['documentKey'], 'niFornecedor');

  assert.equal(report.purchaseNumber?.['key'], 'idContratacaoPNCP');
  assert.equal(report.purchaseNumber?.['matchesEditalFormat'], '80%');
  assert.deepEqual(report.purchaseNumber?.['otherShapes'], ['AAAAAAA-AAAAAAAAA-999']);

  assert.equal((report.windowBoundary?.['endExclusive']), true);
  assert.deepEqual(report.pageSize, { size500: 200, size501: 400, size501Message: 'tamanhoPagina deve ser no máximo 500' });

  assert.deepEqual(report.coverage, { sampleRecords: 5, ufKey: 'unidadeOrgaoUfSigla', distinctUfs: 3, ufs: ['MA', 'RJ', 'SP'], distinctAgencies: 1 });
  assert.equal(report.updateLag?.['records'], 5);
  assert.equal(report.updateLag?.['max'], 5);
  assert.equal(report.updateLag?.['p50'], 0);

  const monthly = report.monthly as { byYear: Record<string, Array<number | null>>; firstMonthWithData: string; totalRecords: number };
  assert.equal(monthly.firstMonthWithData, '2021-04');
  assert.deepEqual(monthly.byYear['2021']?.slice(0, 5), [0, 0, 0, 1004, 1005]);
  assert.equal(monthly.byYear['2026']?.length, 12);
  // Setembro de 2026 foi medido; outubro a dezembro não (futuro).
  assert.notEqual(monthly.byYear['2026']?.[8], null);
  assert.deepEqual(monthly.byYear['2026']?.slice(9), [null, null, null]);
});

test('o relatório nunca leva documento nem nome de pessoa física', async () => {
  const { deps } = createFakeDeps();
  const text = renderProbeReport(await runResultProbe(deps));

  assert.doesNotMatch(text, new RegExp(PF_DOCUMENT));
  assert.doesNotMatch(text, new RegExp(PF_NAME));
  assert.match(text, /PESSOA FISICA DE TESTE/);
  assert.match(text, /\*{11}/);
  // O CNPJ de empresa (dado público) fica na amostra.
  assert.match(text, /11222333000181/);
  // É um JSON válido.
  assert.equal(typeof JSON.parse(text), 'object');
});

test('a amostra tem no máximo dois registros por tipo de pessoa', async () => {
  const { deps } = createFakeDeps();
  const report = await runResultProbe(deps);
  assert.equal(report.sample?.length, 3);
  assert.equal(report.sample?.filter((item) => item['tipoPessoa'] === 'PJ').length, 2);
});

test('usa o dia pedido e as páginas pedidas', async () => {
  const { deps, calls } = createFakeDeps();
  const report = await runResultProbe(deps, { day: '2026-08-03', maxPages: 1 });
  assert.equal(report.sampleDay, '2026-08-03');
  assert.equal(report.structure['pagesRead'], 1);
  // A amostra pede a janela do dia com o fim exclusivo.
  assert.deepEqual(calls[0]?.dates, { initial: '2026-08-03', final: '2026-08-04' });
  assert.equal(calls[0]?.size, 500);
});

test('primeira página que não responde como o esperado: relatório curto e só um pedido', async () => {
  const { deps, calls } = createFakeDeps({ always: failure(404, 'rota inexistente') });
  const report = await runResultProbe(deps);

  assert.deepEqual(report.structure, { endpointOk: false, status: 404, errorPreview: 'rota inexistente' });
  assert.match(report.skipped ?? '', /primeira página/);
  assert.equal(calls.length, 1);
  assert.equal(report.fields, undefined);
});

test('resposta 200 sem lista de registros é reportada, sem lançar', async () => {
  const { deps } = createFakeDeps({ always: json({ mensagem: 'ok' }) });
  const report = await runResultProbe(deps);
  assert.deepEqual(report.structure, { endpointOk: false, status: 200, reason: 'resposta sem lista de registros' });
});

test('429 na amostra: registra o limite, não insiste e pede intervalo maior', async () => {
  const { deps, calls } = createFakeDeps({ limitSampleAtPage: 2 });
  const report = await runResultProbe(deps);

  assert.deepEqual(report.rhythm?.['rateLimited'], [{ page: 2, retryAfter: '45', preview: 'muitas requisições' }]);
  assert.match(report.skipped ?? '', /429/);
  // Só as duas páginas da amostra: nenhuma contagem nem teste de fronteira depois do limite.
  assert.equal(calls.length, 2);
  // O que já foi lido continua no relatório.
  assert.equal(report.structure['recordsRead'], 3);
  assert.equal(report.sample?.length, 3);
});

test('o ritmo registra o tempo de cada página e os códigos de resposta', async () => {
  const { deps } = createFakeDeps();
  const report = await runResultProbe(deps);
  assert.deepEqual(report.rhythm, { pageMs: [120, 120], p50: 120, max: 120, statuses: { '200': 2 } });
});

test('o texto do relatório deixa objetos pequenos numa linha só', async () => {
  const { deps } = createFakeDeps();
  const text = renderProbeReport(await runResultProbe(deps));
  assert.match(text, /"pageSize": \{"size500":200,"size501":400/);
  assert.ok(text.split('\n').length < 150, `relatório com ${text.split('\n').length} linhas`);
});
