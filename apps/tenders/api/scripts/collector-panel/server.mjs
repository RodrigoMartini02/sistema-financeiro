// Servidor HTTP do painel local da coleta de Licitações (plano .plans/painel-local-coleta-licitacoes.md).
// Não conhece o Windows: os adaptadores (processo, janela da coleta, Agendador) entram por parâmetro, o que deixa as
// regras de segurança e de bloqueio testáveis em qualquer sistema. A montagem real fica em main.mjs.
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { clipText, describeRun, isTrustedHost, isTrustedOrigin, isValidScheduleTime, isValidToken, maskSecrets } from './logic.mjs';

const MAX_BODY_BYTES = 2048;
const DEFAULT_LOG_LINES = 100;
const MAX_LOG_LINES = 500;
const MAX_DRY_RUN_OUTPUT_LENGTH = 4000;
// Depois de abrir a janela, o node da rotina leva alguns segundos para aparecer: sem isso um segundo clique passaria.
const LAUNCH_GUARD_MS = 30_000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const BASE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Requisição grande demais.');
    }
    chunks.push(chunk);
  }
  if (receivedBytes === 0) {
    return {};
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Corpo da requisição inválido.');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Corpo da requisição inválido.');
  }
  return body;
}

function parseLogLineCount(value) {
  const count = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(count) || count < 1) {
    return DEFAULT_LOG_LINES;
  }
  return Math.min(count, MAX_LOG_LINES);
}

/**
 * Monta o servidor sem iniciá-lo. `collector` = { isRunning({ fresh }), start(), dryRun() }; `scheduler` = { read({ fresh }),
 * apply({ time, enabled }) }; `logReader` = { readSummary(), readTail(count) }.
 */
export function createPanelServer({ token, indexHtml, logReader, collector, scheduler, now = Date.now }) {
  let launchingUntil = 0;
  let startingRun = false;
  let dryRunInProgress = false;

  const currentPort = () => server.address().port;

  async function getStatus() {
    const [running, summary, schedule] = await Promise.allSettled([
      collector.isRunning(),
      logReader.readSummary(),
      scheduler.read(),
    ]);
    const problems = [];
    const reportProblem = (message, result) => {
      console.error(`[painel] ${message}: ${result.reason?.message ?? result.reason}`);
      problems.push(message);
    };
    if (running.status === 'rejected') {
      reportProblem('Não foi possível verificar se a rotina está rodando', running);
    }
    if (summary.status === 'rejected') {
      reportProblem('Não foi possível ler o log da rotina', summary);
    }
    if (schedule.status === 'rejected') {
      reportProblem('Não foi possível ler a tarefa do Agendador de Tarefas', schedule);
    }

    const processRunning = running.status === 'fulfilled' ? running.value : null;
    const latestLog = summary.status === 'fulfilled' ? summary.value : null;
    return {
      running: processRunning,
      launching: launchingUntil > now(),
      lastRun:
        latestLog === null
          ? null
          : { file: latestLog.file, ...describeRun(latestLog.summary, { processRunning: processRunning === true, now: now() }) },
      schedule: schedule.status === 'fulfilled' ? schedule.value : null,
      problems,
      serverTime: new Date(now()).toISOString(),
    };
  }

  async function startRun() {
    if (startingRun || launchingUntil > now()) {
      throw new HttpError(409, 'A rotina está iniciando. Aguarde alguns segundos.');
    }
    startingRun = true;
    try {
      if (await collector.isRunning({ fresh: true })) {
        throw new HttpError(409, 'Já existe uma rodada em andamento. Duas ao mesmo tempo não funcionam.');
      }
      await collector.start();
      launchingUntil = now() + LAUNCH_GUARD_MS;
    } finally {
      startingRun = false;
    }
  }

  async function runDryRun() {
    if (dryRunInProgress) {
      throw new HttpError(409, 'A conferência já está em andamento.');
    }
    dryRunInProgress = true;
    try {
      const { ok, output } = await collector.dryRun();
      return { ok, output: clipText(maskSecrets(output), MAX_DRY_RUN_OUTPUT_LENGTH) };
    } finally {
      dryRunInProgress = false;
    }
  }

  async function changeSchedule(body) {
    const { time, enabled } = body;
    if (time === undefined && enabled === undefined) {
      throw new HttpError(400, 'Informe o horário (HH:mm) ou se a tarefa fica ativa.');
    }
    if (time !== undefined && !isValidScheduleTime(time)) {
      throw new HttpError(400, 'Horário inválido: use HH:mm, de 00:00 a 23:59.');
    }
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      throw new HttpError(400, 'O campo enabled precisa ser verdadeiro ou falso.');
    }
    if (time === undefined && !(await scheduler.read({ fresh: true })).exists) {
      throw new HttpError(409, 'A tarefa ainda não existe: informe um horário para criá-la.');
    }
    return scheduler.apply({ time, enabled });
  }

  // Cada rota devolve { status, body }. Toda rota da API exige o token; as de escrita exigem também o Origin do painel.
  const routes = {
    'GET /api/status': async () => ({ status: 200, body: await getStatus() }),
    'GET /api/log': async ({ url }) => ({
      status: 200,
      body: await logReader.readTail(parseLogLineCount(url.searchParams.get('lines'))),
    }),
    'POST /api/run': async () => {
      await startRun();
      return { status: 202, body: { started: true } };
    },
    'POST /api/dry-run': async () => ({ status: 200, body: await runDryRun() }),
    'POST /api/schedule': async ({ request }) => ({
      status: 200,
      body: { schedule: await changeSchedule(await readJsonBody(request)) },
    }),
  };
  const apiPaths = new Set(Object.keys(routes).map((route) => route.split(' ')[1]));

  function sendIndex(response) {
    const nonce = randomBytes(16).toString('base64');
    const html = indexHtml.replaceAll('__PANEL_TOKEN__', token).replaceAll('__CSP_NONCE__', nonce);
    response.writeHead(200, {
      ...BASE_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'X-Frame-Options': 'DENY',
    });
    response.end(html);
  }

  async function handleRequest(request, response) {
    const port = currentPort();
    if (!isTrustedHost(request.headers.host, port)) {
      throw new HttpError(403, 'Host não permitido.');
    }
    const url = new URL(request.url ?? '/', `http://localhost:${port}`);
    const method = request.method ?? 'GET';

    if (method === 'GET' && url.pathname === '/') {
      sendIndex(response);
      return;
    }
    if (method === 'GET' && url.pathname === '/favicon.ico') {
      response.writeHead(204, BASE_HEADERS);
      response.end();
      return;
    }
    if (!apiPaths.has(url.pathname)) {
      throw new HttpError(404, 'Não encontrado.');
    }
    if (!isValidToken(request.headers['x-panel-token'], token)) {
      throw new HttpError(403, 'Token inválido. Recarregue a página.');
    }
    if (method === 'POST' && !isTrustedOrigin(request.headers.origin, port)) {
      throw new HttpError(403, 'Origem não permitida.');
    }
    const route = routes[`${method} ${url.pathname}`];
    if (route === undefined) {
      throw new HttpError(405, 'Método não permitido.');
    }
    const { status, body } = await route({ request, url });
    sendJson(response, status, body);
  }

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error(`[painel] ${request.method} ${request.url}: ${error?.message ?? error}`);
      sendJson(response, 500, { error: 'Erro interno no painel. Veja a janela do servidor.' });
    });
  });
  return server;
}
