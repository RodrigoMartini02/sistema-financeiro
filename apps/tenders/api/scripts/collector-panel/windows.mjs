// Ponte do painel com o Windows: detectar a rotina em execução, abrir a janela da coleta, rodar o -DryRun e ler/alterar a
// tarefa do Agendador de Tarefas. Os comandos são sempre fixos; o que vem de fora (horário, caminhos) entra por variável
// de ambiente do PowerShell, nunca dentro do texto do comando.
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { buildCollectorArguments, buildScheduledTaskArguments } from './logic.mjs';

export const DEFAULT_TASK_NAME = 'Licitacoes - rotina diaria';

const POWERSHELL_PATH = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const SCRIPT_TIMEOUT_MS = 30_000;
const DRY_RUN_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const RUNNING_CACHE_MS = 4_000;
const SCHEDULE_CACHE_MS = 30_000;
const COLLECTOR_WINDOW_TITLE = 'Coleta de Licitacoes';

// Caminhos do Windows não têm aspas; só precisam delas quando têm espaço (a pasta do projeto tem).
function quoteArgument(argument) {
  return /\s/.test(argument) ? `"${argument}"` : argument;
}

// Cada script termina com a mensagem do erro em stderr: sem isso o PowerShell, com a saída redirecionada, mostra XML (CLIXML).
function wrapScript(body) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    'try {',
    body,
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\n');
}

// O coletor roda como `tsx src/collector/dailyRoutineCli.ts`; o processo node dele é o que prova que a rotina está ativa.
// A janela do PowerShell não serve: ela fica aberta (-NoExit) depois que a rotina termina.
const COUNT_RUNNING_SCRIPT = wrapScript(`
  $found = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*dailyRoutineCli*' })
  Write-Output $found.Count`);

const READ_TASK_SCRIPT = wrapScript(`
  function Format-TaskDate($value) {
    if ($null -eq $value -or $value.Year -lt 2000) { return $null }
    return $value.ToString('yyyy-MM-ddTHH:mm:sszzz')
  }
  $task = Get-ScheduledTask -TaskName $env:PANEL_TASK_NAME -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Write-Output '{"exists":false}'
    return
  }
  $info = Get-ScheduledTaskInfo -TaskName $env:PANEL_TASK_NAME
  $trigger = @($task.Triggers)[0]
  $time = $null
  if ($null -ne $trigger -and $trigger.StartBoundary) { $time = ([datetime]$trigger.StartBoundary).ToString('HH:mm') }
  [pscustomobject]@{
    exists = $true
    enabled = ($task.State -ne 'Disabled')
    state = [string]$task.State
    time = $time
    nextRun = Format-TaskDate $info.NextRunTime
    lastRun = Format-TaskDate $info.LastRunTime
    lastResult = $info.LastTaskResult
  } | ConvertTo-Json -Compress`);

// Mesmos parâmetros do documento de operação: diária, roda assim que o PC voltar se perdeu o horário, uma instância por vez.
const APPLY_TASK_SCRIPT = wrapScript(`
  $name = $env:PANEL_TASK_NAME
  if ($env:PANEL_TASK_TIME) {
    $at = [datetime]::ParseExact($env:PANEL_TASK_TIME, 'HH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
    $trigger = New-ScheduledTaskTrigger -Daily -At $at
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
      Set-ScheduledTask -TaskName $name -Trigger $trigger | Out-Null
    } else {
      $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $env:PANEL_TASK_ARGUMENTS -WorkingDirectory $env:PANEL_REPO_ROOT
      $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 14) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
      Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings | Out-Null
    }
  }
  if ($env:PANEL_TASK_ENABLED -eq 'true') { Enable-ScheduledTask -TaskName $name | Out-Null }
  if ($env:PANEL_TASK_ENABLED -eq 'false') { Disable-ScheduledTask -TaskName $name | Out-Null }`);

function execPowerShell(args, { env = process.env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL_PATH,
      args,
      { env, timeout: timeoutMs, windowsHide: true, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error); // não iniciou, estourou o tempo ou a saída
          return;
        }
        resolve({ exitCode: error ? error.code : 0, stdout, stderr });
      },
    );
  });
}

async function runScript(script, extraEnv = {}) {
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  const { exitCode, stdout, stderr } = await execPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript],
    { env: { ...process.env, ...extraEnv }, timeoutMs: SCRIPT_TIMEOUT_MS },
  );
  if (exitCode !== 0) {
    throw new Error(stderr.trim().split('\n')[0] || `PowerShell terminou com código ${exitCode}`);
  }
  return stdout.trim();
}

function createCache(load, ttlMs) {
  let cached = null;
  let pending = null;
  return {
    get({ fresh = false } = {}) {
      if (!fresh && cached !== null && cached.expiresAt > Date.now()) {
        return Promise.resolve(cached.value);
      }
      pending ??= load()
        .then((value) => {
          cached = { value, expiresAt: Date.now() + ttlMs };
          return value;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    invalidate() {
      cached = null;
    },
  };
}

export function createWindowsAdapters({ repoRoot, collectorScript, envFile, workDir, duckDbMemoryMb, diskLimitMb, taskName = DEFAULT_TASK_NAME }) {
  const collectorOptions = { scriptPath: collectorScript, envFile, workDir, duckDbMemoryMb, diskLimitMb };

  const runningCache = createCache(async () => {
    const output = await runScript(COUNT_RUNNING_SCRIPT);
    const count = Number.parseInt(output.split('\n').at(-1) ?? '', 10);
    if (Number.isNaN(count)) {
      throw new Error('Resposta inesperada ao procurar a rotina em execução.');
    }
    return count > 0;
  }, RUNNING_CACHE_MS);

  const scheduleCache = createCache(async () => {
    const output = await runScript(READ_TASK_SCRIPT, { PANEL_TASK_NAME: taskName });
    return JSON.parse(output.split('\n').at(-1) ?? '');
  }, SCHEDULE_CACHE_MS);

  return {
    collector: {
      isRunning: (options) => runningCache.get(options),

      /**
       * Abre uma janela própria do PowerShell, que continua rodando mesmo se o painel for fechado. Vai pelo `start` do cmd:
       * um processo `detached` do Node no Windows nasce sem console, ou seja, sem janela para acompanhar.
       */
      start() {
        const args = buildCollectorArguments({ ...collectorOptions, confirmed: true, keepOpen: true });
        const commandLine = ['start', `"${COLLECTOR_WINDOW_TITLE}"`, ...[POWERSHELL_PATH, ...args].map(quoteArgument)].join(' ');
        return new Promise((resolve, reject) => {
          const child = spawn('cmd.exe', ['/d', '/c', commandLine], {
            cwd: repoRoot,
            stdio: 'ignore',
            windowsHide: true,
            windowsVerbatimArguments: true,
          });
          child.on('error', reject);
          child.once('exit', (exitCode) => {
            if (exitCode !== 0) {
              reject(new Error(`Não foi possível abrir a janela do PowerShell (código ${exitCode}).`));
              return;
            }
            runningCache.invalidate();
            resolve();
          });
        });
      },

      /** `-DryRun`: confere ambiente, banco e dependências sem gravar nada. */
      async dryRun() {
        const args = buildCollectorArguments({ ...collectorOptions, dryRun: true });
        const { exitCode, stdout, stderr } = await execPowerShell(args, { timeoutMs: DRY_RUN_TIMEOUT_MS });
        return { ok: exitCode === 0, output: `${stdout}${stderr}`.trim() };
      },
    },

    scheduler: {
      read: (options) => scheduleCache.get(options),

      async apply({ time, enabled }) {
        await runScript(APPLY_TASK_SCRIPT, {
          PANEL_TASK_NAME: taskName,
          PANEL_TASK_TIME: time ?? '',
          PANEL_TASK_ENABLED: enabled === undefined ? '' : String(enabled),
          PANEL_TASK_ARGUMENTS: buildScheduledTaskArguments(collectorOptions),
          PANEL_REPO_ROOT: repoRoot,
        });
        scheduleCache.invalidate();
        return scheduleCache.get({ fresh: true });
      },
    },
  };
}
