import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectorContext } from '../modules/tenders/collector/runs';
import { collectorResourceMetrics, runTendersStep, type StepLimits } from './dailyJobs';
import { CollectorResourceBudget } from '../modules/tenders/collector/resourceBudget';
import { FEDERAL_STEPS, WINNERS_STEPS } from './dailyJobSteps';

// As etapas dos vencedores só rodam com TENDERS_WINNERS_ENABLED=1 (plano .plans/licitacoes-vencedores.md) e as dos
// contratos federais, com TENDERS_FEDERAL_ENABLED=1 (plano .plans/licitacoes-contratos-federais.md). Desligadas, são
// puladas antes de abrir banco, R2 ou fonte: o contexto de teste só tem o que a guarda lê.

const LIMITS: StepLimits = { deadlineAt: Date.parse('2026-10-26T20:30:00Z') };

function contextWith(enabled: boolean, log: Array<{ message: string; fields: unknown }>, federalEnabled = enabled): CollectorContext {
  return {
    config: { winners: { enabled }, federal: { enabled: federalEnabled } },
    logger: {
      info: (message: string, fields?: unknown) => void log.push({ message, fields }),
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  } as unknown as CollectorContext;
}

test('vencedores desligados: as duas etapas são puladas, com o motivo no log, sem tocar em nada', async () => {
  for (const step of WINNERS_STEPS) {
    const log: Array<{ message: string; fields: unknown }> = [];
    assert.equal(await runTendersStep(step as Parameters<typeof runTendersStep>[0], contextWith(false, log), LIMITS), 'skipped', step);
    assert.deepEqual(log, [{ message: 'Vencedores desligados: etapa pulada', fields: { step } }]);
  }
});

test('federais desligados: o ciclo e a carga são pulados, com o motivo no log, sem tocar em nada', async () => {
  for (const step of FEDERAL_STEPS) {
    const log: Array<{ message: string; fields: unknown }> = [];
    assert.equal(await runTendersStep(step as Parameters<typeof runTendersStep>[0], contextWith(true, log, false), LIMITS), 'skipped', step);
    assert.deepEqual(log, [{ message: 'Contratos federais desligados: etapa pulada', fields: { step } }]);
  }
});

test('cada chave liga só as etapas dela: vencedores desligados não pulam os federais, e vice-versa', async () => {
  // Com a chave dos federais ligada, a etapa passa da guarda e chega à execução, que sem R2 no contexto de teste sai
  // pulada pelo próprio motivo (não pela guarda): o log da guarda fica vazio.
  const federalLog: Array<{ message: string; fields: unknown }> = [];
  assert.equal(await runTendersStep('tenders-federal-cycle', contextWith(false, federalLog, true), LIMITS), 'skipped');
  assert.deepEqual(federalLog, [], 'passou da guarda dos federais');
  // Com a dos vencedores desligada, a etapa deles é pulada pela guarda, mesmo com os federais ligados.
  const winnersLog: Array<{ message: string; fields: unknown }> = [];
  assert.equal(await runTendersStep('tenders-winners-daily', contextWith(false, winnersLog, true), LIMITS), 'skipped');
  assert.equal(winnersLog.length, 1);
  assert.equal(winnersLog[0]?.message, 'Vencedores desligados: etapa pulada');
});

test('métricas da rotina: falha de medição não impede etapa independente nem oculta a pendência', async () => {
  const context = contextWith(false, []);
  context.resourceBudget = new CollectorResourceBudget({
    directory: 'nao-usado',
    sampleDisk: async () => { throw new Error('pasta temporária indisponível'); },
  });
  const result = await collectorResourceMetrics(context, 'etapa:fim');
  assert.equal(result.resources?.measurementFailures, 1);
  assert.equal(result.resources?.last, null);
  assert.equal(result.storage, null);
});
