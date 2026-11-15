// Funções puras do painel local da coleta de Licitações: sem I/O, para rodar nos testes em qualquer sistema.
// O painel só enxerga a rotina diária (`run-collector-on-pc.ps1 -Mode daily`) e o log que ela grava.
import { timingSafeEqual } from 'node:crypto';

export const COLLECTOR_MODE = 'daily';

// Faixas aceitas pelo run-collector-on-pc.ps1 (-DuckDbMemoryMb e -DiskLimitMb).
export const DUCKDB_MEMORY_RANGE_MB = Object.freeze({ min: 128, max: 16384 });
export const DISK_LIMIT_RANGE_MB = Object.freeze({ min: 512, max: 1_000_000 });

export const RUN_RESULT = Object.freeze({
  NONE: 'none',
  IN_PROGRESS: 'in-progress',
  SUCCESS: 'success',
  FAILED: 'failed',
  INTERRUPTED: 'interrupted',
});

export const STEP_STATUS = Object.freeze({
  OK: 'ok',
  FAILED: 'failed',
});

const LOG_LEVEL = Object.freeze({
  WARN: 'warn',
  ERROR: 'error',
});

// Mensagens que o coletor grava no log. O acento é tolerado (`.{1,3}`): um log gravado com a codificação errada do
// console troca o "á" por 2 ou 3 caracteres (aviso em run-collector-on-pc.ps1).
const LOG_MESSAGE = Object.freeze({
  ROUTINE_STARTED: /^Rotina di.{1,3}ria iniciada$/,
  ROUTINE_FINISHED: /^Rotina di.{1,3}ria finalizada$/,
  ROUTINE_CRASHED: /^A rotina di.{1,3}ria parou com erro$/,
  STEP_STARTED: /^Etapa iniciada$/,
  STEP_FINISHED: /^Etapa finalizada$/,
  STEP_FAILED: /^Etapa falhou$/,
});

const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAILY_LOG_PATTERN = /^daily-\d{8}-\d{6}\.log$/;
const URL_CREDENTIALS_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const SECRET_FIELD_PATTERN =
  /((?:password|passwd|secret|token|api_?key|access_?key(?:_?id)?|secret_?access_?key)"?\s*[:=]\s*)("[^"]*"|[^\s,;&}]+)/gi;
const MAX_TEXT_LENGTH = 300;

// --- Segurança do servidor local ----------------------------------------------------------------------------------

/** Inteiro opcional vindo de variável de ambiente: vazio = vale o padrão do script. Fora da faixa, recusa em vez de ignorar. */
export function parseOptionalInteger(rawValue, { name, min, max }) {
  if (rawValue === undefined || rawValue.trim() === '') {
    return undefined;
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} invalida: use um numero inteiro de ${min} a ${max}.`);
  }
  return value;
}

export function isValidScheduleTime(value) {
  return typeof value === 'string' && SCHEDULE_TIME_PATTERN.test(value);
}

/** O painel só atende pelo nome local: barra DNS rebinding (um site apontando o próprio nome para 127.0.0.1). */
export function isTrustedHost(hostHeader, port) {
  if (typeof hostHeader !== 'string') {
    return false;
  }
  const host = hostHeader.toLowerCase();
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`;
}

/** Barra requisições de outras páginas (CSRF): o navegador sempre envia o Origin real nos POSTs. */
export function isTrustedOrigin(originHeader, port) {
  if (typeof originHeader !== 'string') {
    return false;
  }
  const origin = originHeader.toLowerCase();
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}

export function isValidToken(receivedToken, expectedToken) {
  if (typeof receivedToken !== 'string' || typeof expectedToken !== 'string') {
    return false;
  }
  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// --- Texto exibido na tela ------------------------------------------------------------------------------------------

export function clipText(text, maxLength = MAX_TEXT_LENGTH) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Tira de qualquer texto que vá para a tela a senha de URLs (postgres://usuario:senha@) e campos como password/secret. */
export function maskSecrets(text) {
  return text
    .replace(URL_CREDENTIALS_PATTERN, '$1***:***@')
    .replace(SECRET_FIELD_PATTERN, (_match, prefix, value) => `${prefix}${value.startsWith('"') ? '"***"' : '***'}`);
}

function tryParseJsonObject(line) {
  if (!line.startsWith('{')) {
    return null;
  }
  try {
    const value = JSON.parse(line);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function isScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function formatLogValue(value) {
  if (isScalar(value)) {
    return String(value);
  }
  if (Array.isArray(value) && value.every(isScalar)) {
    return value.join(',');
  }
  if (value !== null && typeof value === 'object' && typeof value.message === 'string') {
    return value.message;
  }
  return '';
}

function describeLogEntry(entry) {
  const parts = [entry.msg];
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'level' || key === 'time' || key === 'msg') {
      continue;
    }
    const text = formatLogValue(value);
    if (text !== '') {
      parts.push(`${key}=${text}`);
    }
  }
  return parts.join(' ');
}

/** Uma linha do log como { time, level, text }: JSON vira texto curto e as demais linhas passam como estão. */
export function parseLogLine(rawLine) {
  const line = rawLine.replace(/\r$/, '');
  const entry = tryParseJsonObject(line);
  if (entry !== null && typeof entry.msg === 'string') {
    return {
      time: typeof entry.time === 'string' ? entry.time : null,
      level: typeof entry.level === 'string' ? entry.level : null,
      text: clipText(maskSecrets(describeLogEntry(entry))),
    };
  }
  return { time: null, level: null, text: clipText(maskSecrets(line)) };
}

// --- Leitura do log em pedaços ---------------------------------------------------------------------------------------

/**
 * Separa as linhas completas de um pedaço do arquivo. A última linha, se ainda não terminou (o coletor está
 * escrevendo), fica de fora: `consumedBytes` diz até onde o pedaço foi aproveitado. Corta no byte \n, que nunca
 * aparece no meio de um caractere UTF-8.
 */
export function splitCompleteLines(buffer) {
  const lastNewline = buffer.lastIndexOf(0x0a);
  if (lastNewline === -1) {
    return { lines: [], consumedBytes: 0 };
  }
  const lines = buffer
    .subarray(0, lastNewline)
    .toString('utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''));
  return { lines, consumedBytes: lastNewline + 1 };
}

/** Últimas linhas não vazias de um pedaço lido do fim do arquivo (a primeira pode estar cortada). */
export function tailLines(buffer, count, startsAtBeginning) {
  const { lines } = splitCompleteLines(buffer);
  const complete = startsAtBeginning ? lines : lines.slice(1);
  return complete.filter((line) => line.trim() !== '').slice(-count);
}

/** O nome do log traz data e hora (daily-AAAAMMDD-HHMMSS.log), então o último em ordem alfabética é o mais recente. */
export function pickLatestDailyLog(fileNames) {
  return fileNames.filter((name) => DAILY_LOG_PATTERN.test(name)).sort().at(-1) ?? null;
}

// --- Resumo da rodada ------------------------------------------------------------------------------------------------

export function createLogSummary() {
  return {
    startedAt: null,
    lastEventAt: null,
    finishedAt: null,
    plannedSteps: [],
    steps: [],
    currentStep: null,
    currentStepStartedAt: null,
    failedSteps: [],
    completed: false,
    crashed: false,
    warnings: 0,
    errors: 0,
    firstError: null,
  };
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function errorText(error) {
  if (typeof error === 'string') {
    return error;
  }
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}

function recordFirstError(summary, step, error) {
  summary.firstError ??= { step, message: clipText(maskSecrets(errorText(error))) };
}

/** Atualiza o resumo com uma linha do log (muda `summary`). Linhas que não são JSON do coletor são ignoradas. */
export function applyLogLine(summary, rawLine) {
  const entry = tryParseJsonObject(rawLine.trim());
  if (entry === null || typeof entry.msg !== 'string') {
    return;
  }
  const time = typeof entry.time === 'string' ? entry.time : null;
  const step = typeof entry.step === 'string' ? entry.step : null;
  const durationMs = typeof entry.durationMs === 'number' ? entry.durationMs : null;

  if (LOG_MESSAGE.ROUTINE_STARTED.test(entry.msg)) {
    Object.assign(summary, createLogSummary(), { startedAt: time, plannedSteps: stringArray(entry.steps) });
  }
  if (time !== null) {
    summary.lastEventAt = time;
  }
  if (entry.level === LOG_LEVEL.WARN) {
    summary.warnings += 1;
  }
  if (entry.level === LOG_LEVEL.ERROR) {
    summary.errors += 1;
  }

  if (LOG_MESSAGE.STEP_STARTED.test(entry.msg)) {
    summary.currentStep = step;
    summary.currentStepStartedAt = time;
  } else if (LOG_MESSAGE.STEP_FINISHED.test(entry.msg)) {
    summary.steps.push({ step, status: STEP_STATUS.OK, durationMs });
    summary.currentStep = null;
    summary.currentStepStartedAt = null;
  } else if (LOG_MESSAGE.STEP_FAILED.test(entry.msg)) {
    summary.steps.push({ step, status: STEP_STATUS.FAILED, durationMs });
    summary.failedSteps.push(step);
    recordFirstError(summary, step, entry.error);
    summary.currentStep = null;
    summary.currentStepStartedAt = null;
  } else if (LOG_MESSAGE.ROUTINE_FINISHED.test(entry.msg)) {
    summary.completed = true;
    summary.finishedAt = time;
    summary.currentStep = null;
    summary.currentStepStartedAt = null;
    for (const failedStep of stringArray(entry.failedSteps)) {
      if (!summary.failedSteps.includes(failedStep)) {
        summary.failedSteps.push(failedStep);
      }
    }
  } else if (LOG_MESSAGE.ROUTINE_CRASHED.test(entry.msg)) {
    summary.crashed = true;
    recordFirstError(summary, null, entry.error);
  }
}

function resolveRunResult(summary, processRunning) {
  if (summary.startedAt === null) {
    return processRunning ? RUN_RESULT.IN_PROGRESS : RUN_RESULT.NONE;
  }
  if (summary.completed) {
    return summary.failedSteps.length > 0 ? RUN_RESULT.FAILED : RUN_RESULT.SUCCESS;
  }
  if (summary.crashed) {
    return RUN_RESULT.FAILED;
  }
  return processRunning ? RUN_RESULT.IN_PROGRESS : RUN_RESULT.INTERRUPTED;
}

function millisecondsBetween(startIso, endIso) {
  if (startIso === null || endIso === null) {
    return null;
  }
  const difference = Date.parse(endIso) - Date.parse(startIso);
  return Number.isNaN(difference) ? null : Math.max(0, difference);
}

/** O que a tela mostra da rodada: resultado, duração e etapas. `now` (ms) fecha a duração de uma rodada em andamento. */
export function describeRun(summary, { processRunning, now }) {
  const result = resolveRunResult(summary, processRunning);
  const endIso = summary.finishedAt ?? (result === RUN_RESULT.IN_PROGRESS ? new Date(now).toISOString() : summary.lastEventAt);
  return {
    result,
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    durationMs: millisecondsBetween(summary.startedAt, endIso),
    plannedSteps: [...summary.plannedSteps],
    steps: summary.steps.map((step) => ({ ...step })),
    currentStep: summary.currentStep,
    currentStepStartedAt: summary.currentStepStartedAt,
    failedSteps: [...summary.failedSteps],
    warnings: summary.warnings,
    errors: summary.errors,
    firstError: summary.firstError === null ? null : { ...summary.firstError },
  };
}

// --- Argumentos dos comandos (montados aqui; o navegador nunca envia comando nem caminho) --------------------------

/** Argumentos do powershell.exe para `run-collector-on-pc.ps1 -Mode daily`. */
export function buildCollectorArguments({
  scriptPath,
  envFile,
  workDir,
  duckDbMemoryMb,
  diskLimitMb,
  dryRun = false,
  confirmed = false,
  keepOpen = false,
}) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass'];
  if (keepOpen) {
    args.push('-NoExit');
  }
  args.push('-File', scriptPath);
  if (envFile) {
    args.push('-EnvFile', envFile);
  }
  if (workDir) {
    args.push('-WorkDir', workDir);
  }
  if (duckDbMemoryMb !== undefined) {
    args.push('-DuckDbMemoryMb', String(duckDbMemoryMb));
  }
  if (diskLimitMb !== undefined) {
    args.push('-DiskLimitMb', String(diskLimitMb));
  }
  args.push('-Mode', COLLECTOR_MODE);
  if (dryRun) {
    args.push('-DryRun');
  }
  if (confirmed) {
    args.push('-Yes');
  }
  return args;
}

function quoteForCommandLine(value) {
  return `"${value}"`;
}

/** Texto dos argumentos da tarefa do Agendador (o mesmo do documento de operação, com -Yes: sem ninguém para digitar SIM). */
export function buildScheduledTaskArguments({ scriptPath, envFile, workDir, duckDbMemoryMb, diskLimitMb }) {
  const parts = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', quoteForCommandLine(scriptPath)];
  if (envFile) {
    parts.push('-EnvFile', quoteForCommandLine(envFile));
  }
  if (workDir) {
    parts.push('-WorkDir', quoteForCommandLine(workDir));
  }
  if (duckDbMemoryMb !== undefined) {
    parts.push('-DuckDbMemoryMb', String(duckDbMemoryMb));
  }
  if (diskLimitMb !== undefined) {
    parts.push('-DiskLimitMb', String(diskLimitMb));
  }
  parts.push('-Mode', COLLECTOR_MODE, '-Yes');
  return parts.join(' ');
}
