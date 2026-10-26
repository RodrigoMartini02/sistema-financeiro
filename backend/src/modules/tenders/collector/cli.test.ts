import assert from 'node:assert/strict';
import test from 'node:test';
import { CliUsageError, parseCliArgs } from './cli';

function assertUsageError(argv: string[], message?: RegExp): void {
  assert.throws(
    () => parseCliArgs(argv),
    (error: unknown) => error instanceof CliUsageError && (message === undefined || message.test(error.message)),
  );
}

test('comandos sem opções', () => {
  for (const name of [
    'sweep',
    'incremental',
    'deadline-reminders',
    'status',
    'cleanup',
    'contracts-daily',
    'contract-reminders',
    'notices-payload-export',
    'winners-daily',
  ] as const) {
    assert.deepEqual(parseCliArgs([name]), { name });
  }
});

test('contracts-cleanup saiu: os contratos encerrados ficam na base', () => {
  assertUsageError(['contracts-cleanup'], /Comando desconhecido/);
});

test('contracts-backfill: faixa e tempo opcionais', () => {
  assert.deepEqual(parseCliArgs(['contracts-backfill']), { name: 'contracts-backfill', from: null, to: null, maxMinutes: null });
  assert.deepEqual(
    parseCliArgs(['contracts-backfill', '--from', '2026-09-01', '--to', '2026-09-30', '--max-minutes', '90']),
    { name: 'contracts-backfill', from: '2026-09-01', to: '2026-09-30', maxMinutes: 90 },
  );
});

test('contracts-backfill: o limite de espaço do banco saiu, porque os contratos moram no R2', () => {
  assertUsageError(['contracts-backfill', '--max-db-mb', '2000'], /max-db-mb/);
});

test('contracts-backfill: datas válidas, --from antes de --to e números inteiros positivos', () => {
  assertUsageError(['contracts-backfill', '--from', '01/09/2026'], /--from/);
  assertUsageError(['contracts-backfill', '--to', '2026-02-30'], /--to/);
  assertUsageError(['contracts-backfill', '--from', '2026-09-30', '--to', '2026-09-01'], /antes de --to/);
  assertUsageError(['contracts-backfill', '--max-minutes', '0'], /max-minutes/);
  assertUsageError(['contracts-backfill', '--max-minutes', '601'], /max-minutes/);
  assertUsageError(['contracts-daily', '--from', '2026-09-01'], /não vale/);
});

test('winners-probe: sem opções, com o dia da amostra e com o limite de páginas', () => {
  assert.deepEqual(parseCliArgs(['winners-probe']), { name: 'winners-probe', day: null, maxPages: null, supplier: null, from: null, to: null });
  assert.deepEqual(parseCliArgs(['winners-probe', '--day', '2026-09-14', '--max-pages', '3']), {
    name: 'winners-probe',
    day: '2026-09-14',
    maxPages: 3,
    supplier: null,
    from: null,
    to: null,
  });
});

test('winners-probe: dia válido, limite de páginas inteiro e nenhuma opção de outro comando', () => {
  assertUsageError(['winners-probe', '--day', '14/09/2026'], /--day/);
  assertUsageError(['winners-probe', '--day', '2026-02-30'], /--day/);
  assertUsageError(['winners-probe', '--max-pages', '0'], /max-pages/);
  assertUsageError(['winners-probe', '--cnpj', '11222333000181'], /não vale/);
  assertUsageError(['sweep', '--day', '2026-09-14'], /não vale/);
  assertUsageError(['sweep', '--fornecedor', '11222333000181'], /não vale/);
});

test('winners-probe --fornecedor: o CNPJ de 14 dígitos e o período, por dia ou de --from a --to', () => {
  assert.deepEqual(parseCliArgs(['winners-probe', '--fornecedor', '11222333000181', '--day', '2026-09-14']), {
    name: 'winners-probe',
    day: '2026-09-14',
    maxPages: null,
    supplier: '11222333000181',
    from: null,
    to: null,
  });
  assert.deepEqual(parseCliArgs(['winners-probe', '--fornecedor', '11222333000181', '--from', '2026-09-01', '--to', '2026-09-30', '--max-pages', '50']), {
    name: 'winners-probe',
    day: null,
    maxPages: 50,
    supplier: '11222333000181',
    from: '2026-09-01',
    to: '2026-09-30',
  });
  assertUsageError(['winners-probe', '--fornecedor', '11.222.333/0001-81', '--day', '2026-09-14'], /--fornecedor/);
  assertUsageError(['winners-probe', '--fornecedor', '1122233300018', '--day', '2026-09-14'], /--fornecedor/);
  assertUsageError(['winners-probe', '--fornecedor', '11222333000181'], /exige --day, ou --from e --to/);
  assertUsageError(['winners-probe', '--fornecedor', '11222333000181', '--from', '2026-09-01'], /exige --day, ou --from e --to/);
  assertUsageError(['winners-probe', '--fornecedor', '11222333000181', '--day', '2026-09-14', '--from', '2026-09-01', '--to', '2026-09-30'], /não os dois/);
  assertUsageError(['winners-probe', '--fornecedor', '11222333000181', '--from', '2026-09-30', '--to', '2026-09-01'], /antes de --to/);
  assertUsageError(['winners-probe', '--fornecedor', '11222333000181', '--from', '01/09/2026', '--to', '2026-09-30'], /--from/);
  // O período sem fornecedor não tem o que conferir.
  assertUsageError(['winners-probe', '--from', '2026-09-01', '--to', '2026-09-30'], /só valem com --fornecedor/);
});

test('winners-backfill: faixa e tempo opcionais, como os da carga de contratos, com o nome do comando certo', () => {
  assert.deepEqual(parseCliArgs(['winners-backfill']), { name: 'winners-backfill', from: null, to: null, maxMinutes: null });
  assert.deepEqual(
    parseCliArgs(['winners-backfill', '--from', '2026-09-01', '--to', '2026-09-30', '--max-minutes', '120']),
    { name: 'winners-backfill', from: '2026-09-01', to: '2026-09-30', maxMinutes: 120 },
  );
  // A carga de contratos segue devolvendo o próprio nome.
  assert.equal(parseCliArgs(['contracts-backfill', '--from', '2026-09-01']).name, 'contracts-backfill');
  assertUsageError(['winners-backfill', '--from', '01/09/2026'], /--from/);
  assertUsageError(['winners-backfill', '--from', '2026-09-30', '--to', '2026-09-01'], /antes de --to/);
  assertUsageError(['winners-backfill', '--max-minutes', '601'], /max-minutes/);
  assertUsageError(['winners-backfill', '--cnpj', '11222333000181'], /não vale/);
  assertUsageError(['winners-daily', '--from', '2026-09-01'], /não vale/);
});

test('winners-lookup: o CNPJ é obrigatório e tem 14 dígitos; o limite é opcional e vai de 1 a 100', () => {
  assert.deepEqual(parseCliArgs(['winners-lookup', '--cnpj', '11222333000181']), { name: 'winners-lookup', cnpj: '11222333000181', limit: null });
  assert.deepEqual(parseCliArgs(['winners-lookup', '--cnpj', '11222333000181', '--limit', '50']), {
    name: 'winners-lookup',
    cnpj: '11222333000181',
    limit: 50,
  });
  assertUsageError(['winners-lookup'], /--cnpj/);
  for (const invalid of ['1122233300018', '112223330001811', '11.222.333/0001-81', '1122233300018A', '']) {
    assertUsageError(['winners-lookup', '--cnpj', invalid], /--cnpj/);
  }
  assertUsageError(['winners-lookup', '--cnpj', '11222333000181', '--limit', '0'], /limit/);
  assertUsageError(['winners-lookup', '--cnpj', '11222333000181', '--limit', '101'], /limit/);
  assertUsageError(['winners-lookup', '--cnpj', '11222333000181', '--from', '2026-09-01'], /não vale/);
  assertUsageError(['sweep', '--cnpj', '11222333000181'], /não vale/);
});

test('reprocess-notifications exige --since com data válida', () => {
  assert.deepEqual(parseCliArgs(['reprocess-notifications', '--since', '2026-10-01']), {
    name: 'reprocess-notifications',
    since: '2026-10-01',
  });
  assertUsageError(['reprocess-notifications'], /--since/);
  assertUsageError(['reprocess-notifications', '--since', '01/10/2026'], /--since/);
  assertUsageError(['reprocess-notifications', '--since', '2026-02-30'], /--since/);
});

test('collect: modalidade obrigatória, UF e limite de páginas opcionais', () => {
  assert.deepEqual(parseCliArgs(['collect', '--modality', '6', '--state', 'ma', '--max-pages', '2']), {
    name: 'collect',
    modality: 6,
    state: 'MA',
    maxPages: 2,
  });
  assert.deepEqual(parseCliArgs(['collect', '--modality', '8']), { name: 'collect', modality: 8, state: null, maxPages: null });
  assertUsageError(['collect'], /--modality/);
  assertUsageError(['collect', '--modality', '14'], /modality/);
  assertUsageError(['collect', '--modality', 'seis'], /modality/);
  assertUsageError(['collect', '--modality', '6', '--state', 'XX'], /--state/);
  assertUsageError(['collect', '--modality', '6', '--max-pages', '0'], /max-pages/);
});

test('recusa comando desconhecido, opção de outro comando e argumento a mais', () => {
  assertUsageError([]);
  assertUsageError(['varrer'], /desconhecido/);
  assertUsageError(['sweep', '--since', '2026-10-01'], /não vale/);
  assertUsageError(['sweep', 'extra'], /a mais/);
  assertUsageError(['sweep', '--verbose']);
});
