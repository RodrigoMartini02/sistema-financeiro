// Entrada do painel local da coleta de Licitações:
//   open-panel.cmd (ou o atalho da área de trabalho): sobe o painel em segundo plano, sem janela (--background)
//   npm --prefix apps/tenders/api run collector-panel: sobe na própria janela, para ver as mensagens
// Sobe o servidor só em 127.0.0.1. Não lê o collector.env, não conecta no banco e só executa comandos fixos (windows.mjs).
// Variáveis opcionais: PANEL_PORT (padrão 3099); PANEL_ENV_FILE, PANEL_WORK_DIR, PANEL_DUCKDB_MEMORY_MB e PANEL_DISK_LIMIT_MB
// (repassados ao script como -EnvFile, -WorkDir, -DuckDbMemoryMb e -DiskLimitMb: devem ser os mesmos da carga já feita nesta
// máquina; vazio = padrão do script); PANEL_TASK_NAME. Mensagens de console sem acento de propósito: o cmd.exe usa outra
// página de código.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogReader } from './log-reader.mjs';
import { DISK_LIMIT_RANGE_MB, DUCKDB_MEMORY_RANGE_MB, parseOptionalInteger } from './logic.mjs';
import { createPanelServer } from './server.mjs';
import { createWindowsAdapters, DEFAULT_TASK_NAME } from './windows.mjs';

const LISTEN_HOST = '127.0.0.1';
const DEFAULT_PORT = 3099;
const DEFAULT_WORK_DIRECTORY = 'C:\\tmp\\coletor'; // o mesmo padrão do run-collector-on-pc.ps1
const BACKGROUND_FLAG = '--background';
const OPEN_BROWSER_FLAG = '--open';
const BACKGROUND_START_TIMEOUT_MS = 10_000;

function readConfiguration(environment) {
  const port = parseOptionalInteger(environment.PANEL_PORT, { name: 'PANEL_PORT', min: 1024, max: 65535 }) ?? DEFAULT_PORT;
  return {
    port,
    workDir: environment.PANEL_WORK_DIR || undefined,
    envFile: environment.PANEL_ENV_FILE || undefined,
    duckDbMemoryMb: parseOptionalInteger(environment.PANEL_DUCKDB_MEMORY_MB, { name: 'PANEL_DUCKDB_MEMORY_MB', ...DUCKDB_MEMORY_RANGE_MB }),
    diskLimitMb: parseOptionalInteger(environment.PANEL_DISK_LIMIT_MB, { name: 'PANEL_DISK_LIMIT_MB', ...DISK_LIMIT_RANGE_MB }),
    taskName: environment.PANEL_TASK_NAME || DEFAULT_TASK_NAME,
  };
}

function openBrowser(url) {
  // O '' vira o título vazio ("") que o `start` exige antes da URL; passar '""' sairia escapado (\"\") e o cmd não entende.
  spawn('cmd.exe', ['/d', '/c', 'start', '', url], { stdio: 'ignore', windowsHide: true }).on('error', () => {
    console.log(`Abra manualmente: ${url}`);
  });
}

function isPanelResponding(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: LISTEN_HOST, port, path: '/', headers: { Host: `localhost:${port}` }, timeout: 1500 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

/**
 * Abre o painel num processo próprio, sem janela (CREATE_NO_WINDOW), e só devolve quando ele responde. As mensagens desse
 * processo vão para um arquivo de registro, porque sem janela não haveria onde vê-las.
 */
async function startInBackground({ port, url, logFile, shouldOpenBrowser }) {
  if (await isPanelResponding(port)) {
    console.log(`O painel ja esta aberto: ${url}`);
    if (shouldOpenBrowser) {
      openBrowser(url);
    }
    return true;
  }
  mkdirSync(path.dirname(logFile), { recursive: true });
  const logDescriptor = openSync(logFile, 'a');
  const childArguments = [fileURLToPath(import.meta.url), ...process.argv.slice(2).filter((argument) => argument !== BACKGROUND_FLAG)];
  const child = spawn(process.execPath, childArguments, { detached: true, windowsHide: true, stdio: ['ignore', logDescriptor, logDescriptor] });
  child.on('error', (error) => console.error(`Nao foi possivel iniciar o painel: ${error.message}`));
  child.unref();

  const deadline = Date.now() + BACKGROUND_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isPanelResponding(port)) {
      console.log(`Painel iniciado em segundo plano, sem janela: ${url}`);
      console.log(`Para encerrar, use close-panel.cmd. Registro do painel: ${logFile}`);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.error(`O painel nao respondeu em ${BACKGROUND_START_TIMEOUT_MS / 1000} s. Veja o registro: ${logFile}`);
  return false;
}

async function main() {
  if (process.platform !== 'win32') {
    console.error('O painel usa o PowerShell e o Agendador de Tarefas do Windows.');
    process.exitCode = 1;
    return;
  }
  let configuration;
  try {
    configuration = readConfiguration(process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const panelDirectory = path.dirname(fileURLToPath(import.meta.url));
  const apiDirectory = path.resolve(panelDirectory, '..', '..');
  const repoRoot = path.resolve(apiDirectory, '..', '..', '..');
  const collectorScript = path.join(apiDirectory, 'scripts', 'run-collector-on-pc.ps1');
  if (!existsSync(collectorScript)) {
    console.error(`Script da coleta nao encontrado: ${collectorScript}`);
    process.exitCode = 1;
    return;
  }

  const { port, workDir, envFile, duckDbMemoryMb, diskLimitMb, taskName } = configuration;
  const url = `http://localhost:${port}`;
  const shouldOpenBrowser = process.argv.includes(OPEN_BROWSER_FLAG);
  if (process.argv.includes(BACKGROUND_FLAG)) {
    const logFile = path.join(workDir ?? DEFAULT_WORK_DIRECTORY, 'panel.log');
    if (!(await startInBackground({ port, url, logFile, shouldOpenBrowser }))) {
      process.exitCode = 1;
    }
    return;
  }

  const logDirectory = path.join(workDir ?? DEFAULT_WORK_DIRECTORY, 'logs');
  const adapters = createWindowsAdapters({ repoRoot, collectorScript, envFile, workDir, duckDbMemoryMb, diskLimitMb, taskName });
  const server = createPanelServer({
    token: randomBytes(24).toString('hex'),
    indexHtml: await readFile(path.join(panelDirectory, 'index.html'), 'utf8'),
    logReader: createLogReader(logDirectory),
    collector: adapters.collector,
    scheduler: adapters.scheduler,
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`A porta ${port} ja esta em uso (provavelmente o painel ja esta aberto): ${url}`);
      if (shouldOpenBrowser) {
        openBrowser(url);
      }
      return;
    }
    console.error(`O painel nao iniciou: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, LISTEN_HOST, () => {
    console.log(`Painel da coleta de Licitacoes: ${url} (so neste computador)`);
    console.log(`Logs lidos de: ${logDirectory}`);
    console.log(
      `Parametros da coleta: memoria do DuckDB ${duckDbMemoryMb === undefined ? 'padrao do script' : `${duckDbMemoryMb} MB`}, ` +
        `limite de disco ${diskLimitMb === undefined ? 'padrao do script' : `${diskLimitMb} MB`}`,
    );
    console.log('Deixe esta janela aberta enquanto usa o painel. A coleta, depois de iniciada, continua mesmo se voce a fechar.');
    if (shouldOpenBrowser) {
      openBrowser(url);
    }
  });
}

await main();
