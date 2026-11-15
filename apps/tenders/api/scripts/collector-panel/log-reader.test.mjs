import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { createLogReader } from './log-reader.mjs';
import { describeRun, RUN_RESULT } from './logic.mjs';

const ROUTINE_STARTED = '{"level":"info","time":"2026-11-15T17:15:28.676Z","msg":"Rotina diária iniciada","steps":["tenders-sweep","tenders-cleanup"]}\r\n';
const SWEEP_STARTED = '{"level":"info","time":"2026-11-15T17:15:28.677Z","msg":"Etapa iniciada","step":"tenders-sweep"}\r\n';
const SWEEP_FINISHED = '{"level":"info","time":"2026-11-15T18:26:08.460Z","msg":"Etapa finalizada","step":"tenders-sweep","durationMs":4239783}\r\n';
const ROUTINE_FINISHED = '{"level":"info","time":"2026-11-15T19:00:00.000Z","msg":"Rotina diária finalizada","failedSteps":[]}\r\n';

let logDirectory;

beforeEach(() => {
  logDirectory = mkdtempSync(path.join(os.tmpdir(), 'collector-panel-'));
});

afterEach(() => {
  rmSync(logDirectory, { recursive: true, force: true });
});

const run = (summary, processRunning) => describeRun(summary, { processRunning, now: Date.parse('2026-11-15T18:00:00Z') });

test('sem pasta de log ou sem log daily não há resumo nem linhas', async () => {
  const missing = createLogReader(path.join(logDirectory, 'nao-existe'));
  assert.equal(await missing.readSummary(), null);
  assert.deepEqual(await missing.readTail(10), { file: null, entries: [] });

  writeFileSync(path.join(logDirectory, 'backfill-20261111-074432.log'), ROUTINE_STARTED);
  const onlyBackfill = createLogReader(logDirectory);
  assert.equal(await onlyBackfill.readSummary(), null);
});

test('o resumo acompanha o log em andamento lendo só o que foi acrescentado', async () => {
  const logFile = path.join(logDirectory, 'daily-20261115-141526.log');
  writeFileSync(logFile, `\r\n> tsx src/collector/dailyRoutineCli.ts\r\n\r\n${ROUTINE_STARTED}${SWEEP_STARTED}`);
  const reader = createLogReader(logDirectory);

  const first = await reader.readSummary();
  assert.equal(first.file, 'daily-20261115-141526.log');
  assert.equal(run(first.summary, true).result, RUN_RESULT.IN_PROGRESS);
  assert.equal(first.summary.currentStep, 'tenders-sweep');

  appendFileSync(logFile, SWEEP_FINISHED);
  const second = await reader.readSummary();
  assert.equal(second.summary.steps.length, 1);
  assert.equal(second.summary.currentStep, null);

  appendFileSync(logFile, ROUTINE_FINISHED);
  const third = await reader.readSummary();
  assert.equal(run(third.summary, false).result, RUN_RESULT.SUCCESS);
  assert.equal(third.summary.steps.length, 1, 'as linhas antigas não são contadas de novo');
});

test('uma linha ainda sendo escrita só entra quando termina', async () => {
  const logFile = path.join(logDirectory, 'daily-20261115-141526.log');
  const half = SWEEP_FINISHED.slice(0, 60);
  writeFileSync(logFile, ROUTINE_STARTED + SWEEP_STARTED + half);
  const reader = createLogReader(logDirectory);

  assert.equal((await reader.readSummary()).summary.steps.length, 0);
  appendFileSync(logFile, SWEEP_FINISHED.slice(60));
  assert.equal((await reader.readSummary()).summary.steps.length, 1);
});

test('um log novo mais recente passa a ser o acompanhado', async () => {
  writeFileSync(path.join(logDirectory, 'daily-20261115-141406.log'), ROUTINE_STARTED + SWEEP_STARTED);
  const reader = createLogReader(logDirectory);
  assert.equal((await reader.readSummary()).file, 'daily-20261115-141406.log');

  writeFileSync(path.join(logDirectory, 'daily-20261116-190000.log'), ROUTINE_STARTED + ROUTINE_FINISHED);
  const latest = await reader.readSummary();
  assert.equal(latest.file, 'daily-20261116-190000.log');
  assert.equal(run(latest.summary, false).result, RUN_RESULT.SUCCESS);
});

test('se o arquivo for recriado menor, o resumo recomeça do zero', async () => {
  const logFile = path.join(logDirectory, 'daily-20261115-141526.log');
  writeFileSync(logFile, ROUTINE_STARTED + SWEEP_STARTED + SWEEP_FINISHED + ROUTINE_FINISHED);
  const reader = createLogReader(logDirectory);
  assert.equal((await reader.readSummary()).summary.completed, true);

  writeFileSync(logFile, ROUTINE_STARTED);
  const restarted = await reader.readSummary();
  assert.equal(restarted.summary.completed, false);
  assert.equal(restarted.summary.steps.length, 0);
});

test('leituras simultâneas compartilham o mesmo resultado', async () => {
  writeFileSync(path.join(logDirectory, 'daily-20261115-141526.log'), ROUTINE_STARTED + SWEEP_STARTED + SWEEP_FINISHED);
  const reader = createLogReader(logDirectory);
  const [a, b] = await Promise.all([reader.readSummary(), reader.readSummary()]);
  assert.equal(a, b);
  assert.equal(a.summary.steps.length, 1);
});

test('readTail devolve as últimas linhas já formatadas e sem segredo', async () => {
  const lines = [];
  for (let index = 1; index <= 30; index += 1) {
    lines.push(`{"level":"debug","time":"2026-11-15T17:00:${String(index).padStart(2, '0')}.000Z","msg":"Página lida","page":${index}}`);
  }
  lines.push('{"level":"info","time":"2026-11-15T17:01:00.000Z","msg":"Conectado","url":"postgres://u:segredo@h/db"}');
  writeFileSync(path.join(logDirectory, 'daily-20261115-141526.log'), `${lines.join('\r\n')}\r\n`);

  const { file, entries } = await createLogReader(logDirectory).readTail(5);
  assert.equal(file, 'daily-20261115-141526.log');
  assert.equal(entries.length, 5);
  assert.equal(entries.at(-2).text, 'Página lida page=30');
  assert.equal(entries.at(-1).text, 'Conectado url=postgres://***:***@h/db');
  assert.equal(entries.at(-1).level, 'info');
});

test('readTail de um log maior que a janela de leitura descarta a primeira linha cortada', async () => {
  const filler = '{"level":"debug","time":"2026-11-15T17:00:00.000Z","msg":"Página lida","page":1,"nota":"' + 'x'.repeat(900) + '"}\r\n';
  writeFileSync(path.join(logDirectory, 'daily-20261115-141526.log'), filler.repeat(400)); // ~370 KB, mais que os 256 KB lidos
  const { entries } = await createLogReader(logDirectory).readTail(3000);
  assert.ok(entries.length > 100 && entries.length < 400);
  assert.ok(entries.every((entry) => entry.level === 'debug'), 'nenhuma linha cortada passou como texto solto');
});
