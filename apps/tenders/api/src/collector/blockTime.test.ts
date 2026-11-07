import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunArchive } from './archive';
import { DEADLINE_MARGIN_MINUTES, backfillBlockMinutes, collectionStopReason, flushArchiveOrAbort, publishAndConfirm } from './blockTime';
import type { CollectorContext } from './runs';

// Partes comuns das cargas em blocos (blockTime.ts): o tempo do bloco dentro do prazo da rotina e o envio do bruto.

test('tempo do bloco da carga: os minutos configurados, limitados ao que sobra da rotina menos a folga', () => {
  const now = Date.parse('2026-10-26T09:00:00Z');
  const minutesFromNow = (minutes: number) => now + minutes * 60_000;
  assert.equal(backfillBlockMinutes(120, undefined, now), 120, 'sem prazo, valem os minutos configurados');
  assert.equal(backfillBlockMinutes(120, minutesFromNow(600), now), 120, 'sobra muito: os configurados');
  assert.equal(backfillBlockMinutes(120, minutesFromNow(100), now), 100 - DEADLINE_MARGIN_MINUTES, 'sobra pouco: o que sobra menos a folga');
  assert.equal(backfillBlockMinutes(120, minutesFromNow(DEADLINE_MARGIN_MINUTES + 1), now), 1, 'o mínimo é um minuto');
});

test('tempo do bloco da carga: sem pelo menos um minuto depois da folga, a etapa não roda', () => {
  const now = Date.parse('2026-10-26T09:00:00Z');
  assert.equal(backfillBlockMinutes(120, now + DEADLINE_MARGIN_MINUTES * 60_000, now), null);
  assert.equal(backfillBlockMinutes(120, now + 5 * 60_000, now), null);
  assert.equal(backfillBlockMinutes(120, now - 60_000, now), null, 'prazo que já passou');
});

/** Um arquivo bruto de mentira: o resumo das falhas antes e depois de descarregar. */
function fakeArchive(failuresAfterFlush: number, failuresBeforeFlush = 0): RunArchive {
  let flushed = false;
  return {
    flush: async () => {
      flushed = true;
    },
    summary: () => ({ enabled: true, files: 0, records: 0, bytes: 0, failures: flushed ? failuresAfterFlush : failuresBeforeFlush }),
  } as unknown as RunArchive;
}

test('bruto não enviado cancela a publicação: nada é dado como lido sem o arquivo bruto', async () => {
  await flushArchiveOrAbort(fakeArchive(0));
  await assert.rejects(() => flushArchiveOrAbort(fakeArchive(1)), /arquivo bruto não foi enviado/);
});

test('falha anterior em append também impede publicar, mesmo se flush não acrescentar falhas', async () => {
  await assert.rejects(() => flushArchiveOrAbort(fakeArchive(1, 1)), /arquivo bruto não foi enviado/);
});

test('cada unidade só é confirmada após seu envio: uma publicação anterior não confirma a seguinte', async () => {
  const events: string[] = [];
  let firstCompleted = false;
  let nextCompleted = false;
  const result = await publishAndConfirm(fakeArchive(0), async () => {
    events.push('publish');
    return 'revision-1';
  }, async (revision) => {
    events.push(revision);
    firstCompleted = true;
  });
  assert.equal(result, 'revision-1');
  assert.deepEqual(events, ['publish', 'revision-1']);
  await assert.rejects(() => publishAndConfirm(fakeArchive(0), async () => {
    throw new Error('manifesto não confirmado');
  }, async () => {
    nextCompleted = true;
  }), /manifesto não confirmado/);
  assert.equal(firstCompleted, true);
  assert.equal(nextCompleted, false);
});

test('bruto incompleto impede o armazém e o progresso, sem executar nenhuma das duas ações', async () => {
  const events: string[] = [];
  await assert.rejects(() => publishAndConfirm(fakeArchive(1), async () => {
    events.push('publish');
  }, async () => {
    events.push('confirm');
  }), /arquivo bruto não foi enviado/);
  assert.deepEqual(events, []);
});

test('limites são verificados antes da próxima unidade, com motivos separados de falha da fonte', async () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const context = {
    now: () => now,
    resourceBudget: { canContinue: async () => false },
  } as unknown as CollectorContext;
  assert.equal(await collectionStopReason(context, now.getTime() - 1), 'time');
  assert.equal(await collectionStopReason(context, now.getTime() + 1), 'disk');
  assert.equal(await collectionStopReason(context, undefined, false), 'local');
  assert.equal(await collectionStopReason({ now: () => now } as CollectorContext), null);
});
