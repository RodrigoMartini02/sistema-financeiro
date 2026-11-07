import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComprasGovDateParams, ComprasGovRawResponse } from './comprasGovClient';
import { renderSupplierCheck, runSupplierCheck, type SupplierCheckDeps } from './supplierCheck';

// Conferência de um fornecedor contra a fonte (`winners-probe --fornecedor`): oráculo independente do mapeamento e da
// agregação, com a fonte simulada.

const NOW = new Date('2026-10-26T12:00:00Z');
const CNPJ = '57507378000365';
const OTHER = '99887766000155';
const WINDOW = { from: '2026-09-01', to: '2026-09-30' };

function record(item: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idContratacaoPNCP: '24365710000183-1-000022/2027',
    numeroItemPncp: item,
    sequencialResultado: 1,
    niFornecedor: CNPJ,
    nomeRazaoSocialFornecedor: 'EMS S/A',
    valorTotalHomologado: 100,
    situacaoCompraItemResultadoId: 1,
    dataCancelamentoPncp: null,
    ...overrides,
  };
}

function envelope(records: Record<string, unknown>[], page: number, totalPages: number, total = records.length): ComprasGovRawResponse {
  return {
    status: 200,
    json: { resultado: records, totalRegistros: total, totalPaginas: totalPages, paginasRestantes: Math.max(0, totalPages - page) },
    retryAfter: null,
    errorPreview: '',
    elapsedMs: 100,
  };
}

interface Call {
  dates: ComprasGovDateParams;
  page: number;
  size: number;
  extra: Record<string, string>;
}

function fakeDeps(responses: Array<ComprasGovRawResponse | ((call: Call) => ComprasGovRawResponse)>): { deps: SupplierCheckDeps; calls: Call[] } {
  const calls: Call[] = [];
  const deps: SupplierCheckDeps = {
    now: () => NOW,
    client: {
      get requestCount() {
        return calls.length;
      },
      async requestRaw(dates, page, size = 500, extra = {}) {
        const call = { dates, page, size, extra };
        calls.push(call);
        const next = responses[calls.length - 1] ?? envelope([], page, 0);
        return typeof next === 'function' ? next(call) : next;
      },
    },
  };
  return { deps, calls };
}

test('conta os itens ativos, cancelados e outros, as licitações com item ativo e o valor exato em centavos', async () => {
  const { deps, calls } = fakeDeps([
    envelope(
      [
        record(1, { valorTotalHomologado: 0.1 }),
        record(2, { valorTotalHomologado: 0.2 }),
        record(3, { idContratacaoPNCP: '24365710000183-1-000023/2027', valorTotalHomologado: 1000.5 }),
        record(4, { situacaoCompraItemResultadoId: 2, valorTotalHomologado: 5000 }),
        record(5, { dataCancelamentoPncp: '2026-09-20T10:00:00', valorTotalHomologado: 700 }),
        record(6, { situacaoCompraItemResultadoId: 3, valorTotalHomologado: 90 }),
        record(7, { valorTotalHomologado: null }),
      ],
      1,
      1,
    ),
  ]);
  const report = await runSupplierCheck(deps, { cnpj: CNPJ, window: WINDOW });

  assert.equal(report.serverFilter, 'applied');
  assert.equal(report.recordsRead, 7);
  assert.equal(report.supplierRecords, 7);
  assert.equal(report.activeItems, 4, 'os itens 1, 2, 3 e 7');
  assert.equal(report.cancelledItems, 2, 'situação 2 e data de cancelamento');
  assert.equal(report.otherItems, 1, 'a reserva não é vitória');
  assert.equal(report.activePurchases, 2);
  assert.equal(report.activeTotalValue, '1000.80', '0,10 + 0,20 + 1000,50 + sem valor');
  assert.equal(report.totalReported, 7);
  assert.equal(report.pagesRead, 1);
  assert.equal(report.stoppedBy, null);
  assert.equal(report.requests, 1);
  assert.equal(report.passes, 1);
  assert.equal(report.complete, true, 'vieram os 7 que a fonte informou');
  assert.equal(report.generatedAt, NOW.toISOString());
  assert.deepEqual(calls[0]?.extra, { niFornecedor: CNPJ }, 'o filtro vai como parâmetro da fonte');
  assert.deepEqual(calls[0]?.dates, { initial: '2026-09-01', final: '2026-09-30' }, 'o fim da janela é inclusivo');
  assert.equal(calls[0]?.size, 500);
});

test('o mesmo item lido duas vezes conta uma só, e o que faltou vem na leitura seguinte, com outro tamanho de página', async () => {
  // A fonte informa 3 registros, e a primeira leitura traz o item 1 duas vezes e nenhum item 3.
  const { deps, calls } = fakeDeps([envelope([record(1), record(1), record(2)], 1, 1, 3), envelope([record(1), record(2), record(3)], 1, 1, 3)]);
  const report = await runSupplierCheck(deps, { cnpj: CNPJ, window: WINDOW });
  assert.equal(report.activeItems, 3);
  assert.equal(report.activeTotalValue, '300.00');
  assert.equal(report.supplierRecords, 3);
  assert.equal(report.passes, 2);
  assert.equal(report.complete, true);
  assert.deepEqual(calls.map((call) => call.size), [500, 499]);
});

test('registro que a fonte nunca entrega: lê com todos os tamanhos de página e o relatório diz que não está completo', async () => {
  const { deps, calls } = fakeDeps(Array.from({ length: 4 }, () => envelope([record(1), record(2)], 1, 1, 3)));
  const report = await runSupplierCheck(deps, { cnpj: CNPJ, window: WINDOW });
  assert.equal(report.passes, 4);
  assert.equal(report.complete, false);
  assert.equal(report.supplierRecords, 2);
  assert.equal(report.totalReported, 3);
  assert.equal(report.stoppedBy, null);
  assert.deepEqual(calls.map((call) => call.size), [500, 499, 437, 389]);
});

test('várias páginas até a fonte dizer que não há mais, e o CNPJ formatado da fonte também vale', async () => {
  const { deps, calls } = fakeDeps([
    envelope([record(1), record(2)], 1, 2, 3),
    envelope([record(3, { niFornecedor: '57.507.378/0003-65' })], 2, 2, 3),
  ]);
  const report = await runSupplierCheck(deps, { cnpj: CNPJ, window: WINDOW });
  assert.equal(report.pagesRead, 2);
  assert.deepEqual(calls.map((call) => call.page), [1, 2]);
  assert.equal(report.activeItems, 3);
  assert.equal(report.totalReported, 3);
  assert.equal(report.stoppedBy, null);
  assert.equal(report.passes, 1);
  assert.equal(report.complete, true);
});

test('fonte que ignora o filtro: só os registros do CNPJ contam, e o relatório avisa', async () => {
  const { deps } = fakeDeps([envelope([record(1), record(2, { niFornecedor: OTHER }), record(3, { niFornecedor: OTHER }), record(4)], 1, 1)]);
  const report = await runSupplierCheck(deps, { cnpj: CNPJ, window: WINDOW });
  assert.equal(report.serverFilter, 'ignored');
  assert.equal(report.complete, false, 'sem o filtro não há como saber se vieram todos');
  assert.equal(report.passes, 1, 'e não adianta ler tudo de novo');
  assert.equal(report.recordsRead, 4);
  assert.equal(report.supplierRecords, 2);
  assert.equal(report.activeItems, 2);
});

test('sem registro: filtro desconhecido e tudo zero', async () => {
  const { deps } = fakeDeps([envelope([], 1, 0)]);
  const report = await runSupplierCheck(deps, { cnpj: CNPJ, window: WINDOW });
  assert.equal(report.serverFilter, 'unknown');
  assert.equal(report.complete, true, 'a fonte informou zero e veio zero');
  assert.equal(report.activeItems, 0);
  assert.equal(report.activeTotalValue, '0.00');
  assert.equal(report.activePurchases, 0);
});

test('limite de páginas: para e diz que parou, sem marcar quando acabou justo no limite', async () => {
  const { deps } = fakeDeps([envelope([record(1)], 1, 3), envelope([record(2)], 2, 3), envelope([record(3)], 3, 3)]);
  const capped = await runSupplierCheck(deps, { cnpj: CNPJ, window: WINDOW, maxPages: 2 });
  assert.equal(capped.stoppedBy, 'maxPages');
  assert.equal(capped.complete, false);
  assert.equal(capped.pagesRead, 2);
  assert.equal(capped.activeItems, 2);

  const exact = fakeDeps([envelope([record(1)], 1, 2), envelope([record(2)], 2, 2)]);
  const finished = await runSupplierCheck(exact.deps, { cnpj: CNPJ, window: WINDOW, maxPages: 2 });
  assert.equal(finished.stoppedBy, null, 'a segunda página era a última');
});

test('429 e erro da fonte: param, mantêm o que já foi contado e dizem o motivo', async () => {
  const failure = (status: number): ComprasGovRawResponse => ({ status, json: null, retryAfter: '30', errorPreview: 'x', elapsedMs: 5 });
  const limited = fakeDeps([envelope([record(1)], 1, 3), failure(429)]);
  const rateLimited = await runSupplierCheck(limited.deps, { cnpj: CNPJ, window: WINDOW });
  assert.equal(rateLimited.stoppedBy, 'rateLimit');
  assert.equal(rateLimited.complete, false);
  assert.equal(rateLimited.activeItems, 1);

  const broken = fakeDeps([failure(500)]);
  assert.equal((await runSupplierCheck(broken.deps, { cnpj: CNPJ, window: WINDOW })).stoppedBy, 'error');
  const notAPage = fakeDeps([{ status: 200, json: { mensagem: 'ok' }, retryAfter: null, errorPreview: '', elapsedMs: 1 }]);
  assert.equal((await runSupplierCheck(notAPage.deps, { cnpj: CNPJ, window: WINDOW })).stoppedBy, 'error');
});

test('o texto do relatório é um JSON sem nome nem documento de ninguém além do CNPJ pedido', async () => {
  const { deps } = fakeDeps([envelope([record(1, { niFornecedor: OTHER, nomeRazaoSocialFornecedor: 'MARIA DA SILVA' }), record(2)], 1, 1)]);
  const text = renderSupplierCheck(await runSupplierCheck(deps, { cnpj: CNPJ, window: WINDOW }));
  assert.equal(typeof JSON.parse(text), 'object');
  assert.doesNotMatch(text, /MARIA DA SILVA|EMS S\/A/);
  assert.ok(!text.includes(OTHER));
});
