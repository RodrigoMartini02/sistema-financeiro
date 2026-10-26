import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectorContext } from '../modules/tenders/collector/runs';
import { runTendersStep, type StepLimits } from './dailyJobs';
import { WINNERS_STEPS } from './dailyJobSteps';

// As etapas dos vencedores só rodam com TENDERS_WINNERS_ENABLED=1 (plano .plans/licitacoes-vencedores.md). Desligadas,
// são puladas antes de abrir banco, R2 ou fonte: o contexto de teste só tem o que a guarda lê.

const LIMITS: StepLimits = { deadlineAt: Date.parse('2026-10-26T20:30:00Z') };

function contextWith(enabled: boolean, log: Array<{ message: string; fields: unknown }>): CollectorContext {
  return {
    config: { winners: { enabled } },
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
