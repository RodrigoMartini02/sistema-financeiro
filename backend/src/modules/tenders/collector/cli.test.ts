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
  for (const name of ['sweep', 'incremental', 'deadline-reminders', 'status', 'cleanup'] as const) {
    assert.deepEqual(parseCliArgs([name]), { name });
  }
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
