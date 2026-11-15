import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLogLine,
  buildCollectorArguments,
  buildScheduledTaskArguments,
  clipText,
  createLogSummary,
  describeRun,
  isTrustedHost,
  isTrustedOrigin,
  isValidScheduleTime,
  isValidToken,
  maskSecrets,
  parseLogLine,
  parseOptionalInteger,
  pickLatestDailyLog,
  RUN_RESULT,
  splitCompleteLines,
  STEP_STATUS,
  tailLines,
} from './logic.mjs';

const ROUTINE_STARTED =
  '{"level":"info","time":"2026-11-15T17:15:28.676Z","msg":"Rotina diária iniciada","steps":["tenders-sweep","tenders-deadline-reminders","tenders-cleanup"]}';
const SWEEP_STARTED = '{"level":"info","time":"2026-11-15T17:15:28.677Z","msg":"Etapa iniciada","step":"tenders-sweep","rssMb":134}';
const SWEEP_FINISHED =
  '{"level":"info","time":"2026-11-15T18:26:08.460Z","msg":"Etapa finalizada","step":"tenders-sweep","result":"success","durationMs":4239783,"resources":{"limitBytes":1}}';
const REMINDERS_STARTED = '{"level":"info","time":"2026-11-15T18:26:08.606Z","msg":"Etapa iniciada","step":"tenders-deadline-reminders"}';
const REMINDERS_FAILED =
  '{"level":"error","time":"2026-11-15T18:26:10.250Z","msg":"Etapa falhou","step":"tenders-deadline-reminders","durationMs":1790,"error":{"name":"Error","message":"connection refused"}}';
const PNCP_RETRY =
  '{"level":"warn","time":"2026-11-15T18:54:34.915Z","msg":"Nova tentativa no PNCP","endpoint":"termos","page":1,"attempt":2,"reason":"HTTP 503"}';
const ROUTINE_FINISHED_OK = '{"level":"info","time":"2026-11-15T19:00:00.000Z","msg":"Rotina diária finalizada","failedSteps":[]}';

function summarize(lines) {
  const summary = createLogSummary();
  for (const line of lines) {
    applyLogLine(summary, line);
  }
  return summary;
}

test('isValidScheduleTime aceita só HH:mm de 00:00 a 23:59', () => {
  for (const valid of ['00:00', '07:30', '19:00', '23:59']) {
    assert.equal(isValidScheduleTime(valid), true, valid);
  }
  for (const invalid of ['24:00', '7:30', '19:60', '19:00:00', '', ' 19:00', '19:0a', null, undefined, 1900]) {
    assert.equal(isValidScheduleTime(invalid), false, String(invalid));
  }
});

test('isTrustedHost e isTrustedOrigin só aceitam o nome local na porta do painel', () => {
  assert.equal(isTrustedHost('localhost:3099', 3099), true);
  assert.equal(isTrustedHost('127.0.0.1:3099', 3099), true);
  assert.equal(isTrustedHost('LOCALHOST:3099', 3099), true);
  assert.equal(isTrustedHost('evil.example:3099', 3099), false);
  assert.equal(isTrustedHost('localhost:3010', 3099), false);
  assert.equal(isTrustedHost(undefined, 3099), false);

  assert.equal(isTrustedOrigin('http://localhost:3099', 3099), true);
  assert.equal(isTrustedOrigin('http://127.0.0.1:3099', 3099), true);
  assert.equal(isTrustedOrigin('https://localhost:3099', 3099), false);
  assert.equal(isTrustedOrigin('http://evil.example', 3099), false);
  assert.equal(isTrustedOrigin(undefined, 3099), false);
});

test('isValidToken compara o token inteiro', () => {
  assert.equal(isValidToken('abc123', 'abc123'), true);
  assert.equal(isValidToken('abc124', 'abc123'), false);
  assert.equal(isValidToken('abc12', 'abc123'), false);
  assert.equal(isValidToken(undefined, 'abc123'), false);
  assert.equal(isValidToken('abc123', undefined), false);
});

test('maskSecrets esconde a senha de URLs e campos de segredo', () => {
  assert.equal(maskSecrets('conectando em postgres://licitacoes_coletor:S3nh4@host.render.com/db'), 'conectando em postgres://***:***@host.render.com/db');
  assert.equal(maskSecrets('{"password":"abc","user":"x"}'), '{"password":"***","user":"x"}');
  assert.equal(maskSecrets('R2_SECRET_ACCESS_KEY=abcdef123 R2_BUCKET=b'), 'R2_SECRET_ACCESS_KEY=*** R2_BUCKET=b');
  assert.equal(maskSecrets('{"accessKeyId":"AKIA123"}'), '{"accessKeyId":"***"}');
});

test('maskSecrets não mexe em texto sem segredo, nem em host:porta', () => {
  const text = 'Banco: dpg-x.oregon-postgres.render.com:5432/fingerence_licitacoes (producao) https://pncp.gov.br:443/api tokenCount=3';
  assert.equal(maskSecrets(text), text);
});

test('clipText corta com reticências só quando passa do limite', () => {
  assert.equal(clipText('curto', 10), 'curto');
  assert.equal(clipText('abcdefghij', 10), 'abcdefghij');
  assert.equal(clipText('abcdefghijk', 10), 'abcdefghi…');
});

test('parseLogLine transforma JSON do coletor em texto curto e mascara segredos', () => {
  const entry = parseLogLine(`${SWEEP_FINISHED}\r`);
  assert.equal(entry.level, 'info');
  assert.equal(entry.time, '2026-11-15T18:26:08.460Z');
  assert.equal(entry.text, 'Etapa finalizada step=tenders-sweep result=success durationMs=4239783');

  const withError = parseLogLine(REMINDERS_FAILED);
  assert.equal(withError.level, 'error');
  assert.match(withError.text, /error=connection refused/);

  const withSecret = parseLogLine('{"level":"info","time":"2026-11-15T10:00:00Z","msg":"conectado","url":"postgres://u:segredo@h/db"}');
  assert.doesNotMatch(withSecret.text, /segredo/);
});

test('parseLogLine deixa passar linha que não é JSON e linha cortada', () => {
  assert.deepEqual(parseLogLine('> tsx src/collector/dailyRoutineCli.ts'), { time: null, level: null, text: '> tsx src/collector/dailyRoutineCli.ts' });
  assert.deepEqual(parseLogLine('{"level":"info","msg":"cort'), { time: null, level: null, text: '{"level":"info","msg":"cort' });
});

test('splitCompleteLines deixa de fora a linha ainda incompleta', () => {
  const { lines, consumedBytes } = splitCompleteLines(Buffer.from('um\r\ndois\r\ntres sem fim'));
  assert.deepEqual(lines, ['um', 'dois']);
  assert.equal(consumedBytes, Buffer.byteLength('um\r\ndois\r\n'));
  assert.deepEqual(splitCompleteLines(Buffer.from('sem quebra')), { lines: [], consumedBytes: 0 });
});

test('splitCompleteLines não parte um caractere UTF-8 no meio', () => {
  const full = Buffer.from('primeira é\nRotina diária\n');
  const cutInsideAccent = full.subarray(0, full.indexOf('á') + 1); // termina no primeiro byte do "á"
  const first = splitCompleteLines(cutInsideAccent);
  assert.deepEqual(first.lines, ['primeira é']);
  assert.equal(first.consumedBytes, Buffer.byteLength('primeira é\n'));
  // A leitura seguinte começa onde a anterior parou e traz a linha inteira, com o acento certo.
  assert.deepEqual(splitCompleteLines(full.subarray(first.consumedBytes)).lines, ['Rotina diária']);
});

test('tailLines devolve as últimas linhas não vazias e descarta a primeira se o pedaço começou no meio', () => {
  const chunk = Buffer.from('cortada\numa\n\ndois\ntres\nquatro sem fim');
  assert.deepEqual(tailLines(chunk, 2, false), ['dois', 'tres']);
  assert.deepEqual(tailLines(chunk, 10, false), ['uma', 'dois', 'tres']);
  assert.deepEqual(tailLines(chunk, 10, true), ['cortada', 'uma', 'dois', 'tres']);
});

test('pickLatestDailyLog escolhe o daily mais recente e ignora os outros arquivos', () => {
  const names = ['backfill-20261111-074432.log', 'daily-20261115-141406.log', 'daily-20261115-141526.log', 'daily-20261114-230000.log', 'collector.env', 'daily-x.log'];
  assert.equal(pickLatestDailyLog(names), 'daily-20261115-141526.log');
  assert.equal(pickLatestDailyLog(['backfill-20261111-074432.log']), null);
  assert.equal(pickLatestDailyLog([]), null);
});

test('resumo de uma rodada concluída sem falhas', () => {
  const summary = summarize([ROUTINE_STARTED, SWEEP_STARTED, PNCP_RETRY, SWEEP_FINISHED, ROUTINE_FINISHED_OK]);
  const run = describeRun(summary, { processRunning: false, now: Date.parse('2026-11-16T00:00:00Z') });
  assert.equal(run.result, RUN_RESULT.SUCCESS);
  assert.equal(run.startedAt, '2026-11-15T17:15:28.676Z');
  assert.equal(run.finishedAt, '2026-11-15T19:00:00.000Z');
  assert.equal(run.durationMs, Date.parse('2026-11-15T19:00:00.000Z') - Date.parse('2026-11-15T17:15:28.676Z'));
  assert.deepEqual(run.plannedSteps, ['tenders-sweep', 'tenders-deadline-reminders', 'tenders-cleanup']);
  assert.deepEqual(run.steps, [{ step: 'tenders-sweep', status: STEP_STATUS.OK, durationMs: 4239783 }]);
  assert.equal(run.warnings, 1);
  assert.equal(run.errors, 0);
  assert.equal(run.firstError, null);
});

test('resumo de uma rodada com etapa que falhou registra o primeiro erro', () => {
  const summary = summarize([
    ROUTINE_STARTED,
    SWEEP_STARTED,
    SWEEP_FINISHED,
    REMINDERS_STARTED,
    REMINDERS_FAILED,
    '{"level":"info","time":"2026-11-15T19:00:00.000Z","msg":"Rotina diária finalizada","failedSteps":["tenders-deadline-reminders"]}',
  ]);
  const run = describeRun(summary, { processRunning: false, now: 0 });
  assert.equal(run.result, RUN_RESULT.FAILED);
  assert.deepEqual(run.failedSteps, ['tenders-deadline-reminders']);
  assert.deepEqual(run.firstError, { step: 'tenders-deadline-reminders', message: 'connection refused' });
  assert.equal(run.errors, 1);
});

test('rodada em andamento mostra a etapa atual e conta a duração até agora', () => {
  const summary = summarize([ROUTINE_STARTED, SWEEP_STARTED, SWEEP_FINISHED, REMINDERS_STARTED]);
  const run = describeRun(summary, { processRunning: true, now: Date.parse('2026-11-15T18:30:00.000Z') });
  assert.equal(run.result, RUN_RESULT.IN_PROGRESS);
  assert.equal(run.currentStep, 'tenders-deadline-reminders');
  assert.equal(run.currentStepStartedAt, '2026-11-15T18:26:08.606Z');
  assert.equal(run.finishedAt, null);
  assert.equal(run.durationMs, Date.parse('2026-11-15T18:30:00.000Z') - Date.parse('2026-11-15T17:15:28.676Z'));
});

test('rodada sem fim e sem processo é interrompida, com a duração até o último evento', () => {
  const summary = summarize([ROUTINE_STARTED, SWEEP_STARTED, PNCP_RETRY]);
  const run = describeRun(summary, { processRunning: false, now: Date.parse('2026-11-16T00:00:00Z') });
  assert.equal(run.result, RUN_RESULT.INTERRUPTED);
  assert.equal(run.durationMs, Date.parse('2026-11-15T18:54:34.915Z') - Date.parse('2026-11-15T17:15:28.676Z'));
});

test('a rotina que parou com erro conta como falha', () => {
  const summary = summarize([
    ROUTINE_STARTED,
    '{"level":"error","time":"2026-11-15T17:16:00.000Z","msg":"A rotina diária parou com erro","error":"R2 não configurado"}',
  ]);
  const run = describeRun(summary, { processRunning: false, now: 0 });
  assert.equal(run.result, RUN_RESULT.FAILED);
  assert.deepEqual(run.firstError, { step: null, message: 'R2 não configurado' });
});

test('sem log não há rodada; log só com cabeçalho do npm também não', () => {
  assert.equal(describeRun(createLogSummary(), { processRunning: false, now: 0 }).result, RUN_RESULT.NONE);
  const onlyBanner = summarize(['> fingerence-tenders-api@1.1.0 daily-jobs', '> tsx src/collector/dailyRoutineCli.ts', '']);
  assert.equal(describeRun(onlyBanner, { processRunning: false, now: 0 }).result, RUN_RESULT.NONE);
  assert.equal(describeRun(onlyBanner, { processRunning: true, now: 0 }).result, RUN_RESULT.IN_PROGRESS);
});

test('o resumo tolera o acento gravado com a codificação errada', () => {
  const garbled = ROUTINE_FINISHED_OK.replace('diária', 'diÃ¡ria');
  assert.equal(describeRun(summarize([ROUTINE_STARTED.replace('diária', 'diÃ¡ria'), garbled]), { processRunning: false, now: 0 }).result, RUN_RESULT.SUCCESS);
});

test('uma nova linha "Rotina iniciada" zera o resumo anterior', () => {
  const summary = summarize([ROUTINE_STARTED, SWEEP_STARTED, REMINDERS_FAILED, ROUTINE_STARTED]);
  assert.deepEqual(summary.failedSteps, []);
  assert.equal(summary.errors, 0);
  assert.equal(summary.firstError, null);
});

test('buildCollectorArguments monta o comando fixo do modo daily', () => {
  const scriptPath = 'C:\\repo com espaço\\run-collector-on-pc.ps1';
  assert.deepEqual(buildCollectorArguments({ scriptPath, dryRun: true }), [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Mode', 'daily', '-DryRun',
  ]);
  assert.deepEqual(buildCollectorArguments({ scriptPath, confirmed: true, keepOpen: true, envFile: 'D:\\c.env', workDir: 'D:\\coleta' }), [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', scriptPath, '-EnvFile', 'D:\\c.env', '-WorkDir', 'D:\\coleta', '-Mode', 'daily', '-Yes',
  ]);
});

test('o DryRun nunca leva -Yes por engano e o modo é sempre daily', () => {
  const args = buildCollectorArguments({ scriptPath: 'x.ps1', dryRun: true });
  assert.equal(args.includes('-Yes'), false);
  assert.equal(args[args.indexOf('-Mode') + 1], 'daily');
});

test('buildScheduledTaskArguments segue o texto do documento de operação', () => {
  assert.equal(
    buildScheduledTaskArguments({ scriptPath: 'C:\\repo\\apps\\tenders\\api\\scripts\\run-collector-on-pc.ps1' }),
    '-NoProfile -ExecutionPolicy Bypass -File "C:\\repo\\apps\\tenders\\api\\scripts\\run-collector-on-pc.ps1" -Mode daily -Yes',
  );
  assert.equal(
    buildScheduledTaskArguments({ scriptPath: 'a.ps1', envFile: 'D:\\x.env', workDir: 'D:\\w' }),
    '-NoProfile -ExecutionPolicy Bypass -File "a.ps1" -EnvFile "D:\\x.env" -WorkDir "D:\\w" -Mode daily -Yes',
  );
});

test('parseOptionalInteger aceita vazio como padrão do script e recusa o que está fora da faixa', () => {
  const range = { name: 'PANEL_DUCKDB_MEMORY_MB', min: 128, max: 16384 };
  assert.equal(parseOptionalInteger(undefined, range), undefined);
  assert.equal(parseOptionalInteger('', range), undefined);
  assert.equal(parseOptionalInteger('   ', range), undefined);
  assert.equal(parseOptionalInteger('2560', range), 2560);
  assert.equal(parseOptionalInteger('128', range), 128);
  assert.equal(parseOptionalInteger('16384', range), 16384);
  for (const invalid of ['127', '16385', '25.5', 'abc', '-1']) {
    assert.throws(() => parseOptionalInteger(invalid, range), /PANEL_DUCKDB_MEMORY_MB invalida/, invalid);
  }
});

test('memória do DuckDB e limite de disco da carga entram no comando e na tarefa, e só quando definidos', () => {
  const limits = { duckDbMemoryMb: 2560, diskLimitMb: 6000 };
  const args = buildCollectorArguments({ scriptPath: 'x.ps1', ...limits, dryRun: true });
  assert.deepEqual(args.slice(args.indexOf('-DuckDbMemoryMb')), ['-DuckDbMemoryMb', '2560', '-DiskLimitMb', '6000', '-Mode', 'daily', '-DryRun']);
  assert.equal(
    buildScheduledTaskArguments({ scriptPath: 'a.ps1', ...limits }),
    '-NoProfile -ExecutionPolicy Bypass -File "a.ps1" -DuckDbMemoryMb 2560 -DiskLimitMb 6000 -Mode daily -Yes',
  );
  const withoutLimits = buildCollectorArguments({ scriptPath: 'x.ps1' });
  assert.equal(withoutLimits.some((argument) => argument.startsWith('-DuckDb') || argument.startsWith('-DiskLimit')), false);
});
