<#
.SYNOPSIS
  Roda a coleta de editais e contratos numa maquina propria, gravando na producao.

.DESCRIPTION
  Plano .plans/coleta-licitacoes-no-pc.md (secao "Rodar numa maquina propria" do README do modulo de licitacoes).

  Modos:
    backfill  Carga do historico de contratos: repete blocos de `contracts-backfill` ate nao sobrar dia pendente.
    daily     A rotina diaria (`npm run daily-jobs`): varredura de editais, contratos do dia, federais e lembretes.

  O script so define variaveis do proprio processo: nao edita nenhum .env. Do arquivo de ambiente (-EnvFile) ele le
  apenas as 5 variaveis do banco e do R2; a pasta do R2 e sempre `producao`. Recusa banco local e, sem -Yes, pede
  confirmacao digitada. Segredos nunca sao impressos: so o host do banco.

  Funciona no Windows PowerShell 5.1 e no PowerShell 7 (pwsh). Mensagens sem acento de proposito: o 5.1 le arquivos sem
  BOM na pagina de codigo local.

.PARAMETER Mode
  backfill ou daily.

.PARAMETER EnvFile
  Arquivo KEY=VALUE com as 5 variaveis (TENDERS_COLLECTOR_DATABASE_URL, TENDERS_ARCHIVE_ENDPOINT,
  TENDERS_ARCHIVE_BUCKET, TENDERS_ARCHIVE_ACCESS_KEY_ID, TENDERS_ARCHIVE_SECRET_ACCESS_KEY). Outras chaves do arquivo
  sao ignoradas. Padrao: <WorkDir>\collector.env. Fica fora do repositorio.

.PARAMETER WorkDir
  Pasta da coleta (tmp e logs). Padrao: C:\tmp\coletor no Windows e ~/coletor nos outros sistemas. O coletor mede a
  pasta temporaria inteira contra o limite de disco; por isso o TEMP deste processo aponta para <WorkDir>\tmp, so da coleta.

.PARAMETER From
  Dia de publicacao mais antigo da carga (modo backfill). Padrao: 2021-01-01.

.PARAMETER MaxMinutes
  Duracao de cada bloco da carga, de 1 a 600 (modo backfill). Padrao: 600.

.PARAMETER DuckDbMemoryMb
  Memoria do DuckDB do gravador (TENDERS_DUCKDB_MEMORY_MB). Padrao: 3072. Use ate ~40% da RAM da maquina.

.PARAMETER DiskLimitMb
  Limite de ocupacao da pasta temporaria (TENDERS_DISK_LIMIT_MB). Padrao: 20000.

.PARAMETER Yes
  Dispensa a confirmacao digitada (para o Agendador de Tarefas).

.PARAMETER DryRun
  Confere tudo (arquivo de ambiente, banco, Node, dependencias) e mostra o que rodaria, sem gravar nem executar nada.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File backend\scripts\run-collector-on-pc.ps1 -Mode backfill -DryRun

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File backend\scripts\run-collector-on-pc.ps1 -Mode backfill -MaxMinutes 30
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('backfill', 'daily')]
    [string]$Mode,

    [string]$EnvFile,

    [string]$WorkDir,

    [ValidatePattern('^\d{4}-\d{2}-\d{2}$')]
    [string]$From = '2021-01-01',

    [ValidateRange(1, 600)]
    [int]$MaxMinutes = 600,

    [ValidateRange(128, 16384)]
    [int]$DuckDbMemoryMb = 3072,

    [ValidateRange(512, 1000000)]
    [int]$DiskLimitMb = 20000,

    [switch]$Yes,

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

# A carga so para sozinha ao ver "sem dia pendente". Os limites abaixo evitam um laco infinito quando algo esta errado.
$ShortBlockMinutes = 5
$MaxShortBlocksInARow = 6
$MaxFailedBlocksInARow = 3
$WaitBetweenAttemptsSeconds = 600

$RequiredKeys = @(
    'TENDERS_COLLECTOR_DATABASE_URL',
    'TENDERS_ARCHIVE_ENDPOINT',
    'TENDERS_ARCHIVE_BUCKET',
    'TENDERS_ARCHIVE_ACCESS_KEY_ID',
    'TENDERS_ARCHIVE_SECRET_ACCESS_KEY'
)
$LocalDatabaseHosts = @('localhost', '127.0.0.1', '::1', '[::1]')

function Stop-Script {
    param([string]$Message)
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

function Read-EnvFile {
    param([string]$Path)
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $text = $line.Trim()
        if ($text -eq '' -or $text.StartsWith('#')) {
            continue
        }
        if ($text.StartsWith('export ')) {
            $text = $text.Substring(7).Trim()
        }
        $separator = $text.IndexOf('=')
        if ($separator -lt 1) {
            continue
        }
        $key = $text.Substring(0, $separator).Trim()
        $value = $text.Substring($separator + 1).Trim()
        $quoted = ($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))
        if ($value.Length -ge 2 -and $quoted) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($RequiredKeys -contains $key) {
            $values[$key] = $value
        }
    }
    return $values
}

function Invoke-CollectorCommand {
    param(
        [string[]]$NpmArguments,
        [string]$LogFile
    )

    # No Windows PowerShell 5.1, o stderr de um programa nativo redirecionado com 2>&1 vira erro terminante com 'Stop'.
    $ErrorActionPreference = 'Continue'
    $result = [pscustomobject]@{ ExitCode = 0; Finished = $false; NotStarted = $false; FailedSteps = @() }
    $failedSteps = New-Object System.Collections.Generic.List[string]
    $npm = if ($IsWindowsHost) { 'npm.cmd' } else { 'npm' }
    $logWriter = New-Object System.IO.StreamWriter($LogFile, $true, (New-Object System.Text.UTF8Encoding($false)))
    $logWriter.AutoFlush = $true
    try {
        & $npm @NpmArguments 2>&1 | ForEach-Object {
            $line = "$_"
            Write-Host $line
            $logWriter.WriteLine($line)
            if ($line -match 'Carga de contratos sem dia pendente') {
                $result.Finished = $true
            }
            if ($line -match 'Carga de contratos n.+o iniciada') {
                $result.NotStarted = $true
            }
            if ($line -match '"msg":"Etapa falhou".*?"step":"([a-z-]+)"') {
                $failedSteps.Add($Matches[1])
            }
        }
        $result.ExitCode = $LASTEXITCODE
    } finally {
        $logWriter.Dispose()
    }
    $result.FailedSteps = @($failedSteps)
    return $result
}

function Invoke-Backfill {
    $shortBlocks = 0
    $failedBlocks = 0
    $blockNumber = 0
    while ($true) {
        $blockNumber += 1
        $startedAt = Get-Date
        Write-Host ('[{0}] Bloco {1} da carga (ate {2} min)...' -f $startedAt.ToString('yyyy-MM-dd HH:mm'), $blockNumber, $MaxMinutes)
        $arguments = @('--prefix', 'backend', 'run', 'tenders', '--', 'contracts-backfill', '--from', $From, '--max-minutes', "$MaxMinutes")
        $result = Invoke-CollectorCommand -NpmArguments $arguments -LogFile $LogFile

        if ($result.Finished) {
            Write-Host 'Carga concluida: nenhum dia pendente.'
            return 0
        }
        if ($result.NotStarted) {
            Stop-Script 'A carga nao iniciou porque o R2 nao esta configurado: confira as variaveis do R2 no arquivo de ambiente.'
        }

        $minutes = ((Get-Date) - $startedAt).TotalMinutes
        if ($result.ExitCode -ne 0) {
            $failedBlocks += 1
        } else {
            $failedBlocks = 0
        }
        if ($minutes -lt $ShortBlockMinutes) {
            $shortBlocks += 1
        } else {
            $shortBlocks = 0
        }
        if ($failedBlocks -ge $MaxFailedBlocksInARow) {
            Stop-Script "Os ultimos $failedBlocks blocos terminaram com erro. Veja o log: $LogFile"
        }
        if ($shortBlocks -ge $MaxShortBlocksInARow) {
            Stop-Script "Os ultimos $shortBlocks blocos terminaram em menos de $ShortBlockMinutes min sem concluir (trava presa ou PNCP fora?). Veja o log: $LogFile"
        }
        if ($minutes -lt $ShortBlockMinutes -or $result.ExitCode -ne 0) {
            Write-Host ('Bloco curto ou com erro (codigo {0}); esperando {1} min para tentar de novo.' -f $result.ExitCode, [math]::Round($WaitBetweenAttemptsSeconds / 60, 1))
            Start-Sleep -Seconds $WaitBetweenAttemptsSeconds
        }
    }
}

function Invoke-Daily {
    Write-Host ('[{0}] Rotina diaria...' -f (Get-Date).ToString('yyyy-MM-dd HH:mm'))
    $result = Invoke-CollectorCommand -NpmArguments @('--prefix', 'backend', 'run', 'daily-jobs') -LogFile $LogFile

    $failed = @($result.FailedSteps | Select-Object -Unique)
    if ($failed.Count -gt 0) {
        Write-Host ('Etapas que falharam: ' + ($failed -join ', ') + ". Veja o log: $LogFile") -ForegroundColor Red
        return 1
    }
    if ($result.ExitCode -ne 0) {
        Write-Host "A rotina saiu com erro (codigo $($result.ExitCode)) antes de registrar as etapas. Veja o log: $LogFile" -ForegroundColor Red
        return $result.ExitCode
    }
    Write-Host 'Rotina diaria concluida.'
    return 0
}

# --- Ambiente e conferencias -----------------------------------------------------------------------------------------

$IsWindowsHost = $env:OS -eq 'Windows_NT'
if (-not $WorkDir) {
    $WorkDir = if ($IsWindowsHost) { 'C:\tmp\coletor' } else { Join-Path $HOME 'coletor' }
}
if (-not $EnvFile) {
    $EnvFile = Join-Path $WorkDir 'collector.env'
}
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BackendDirectory = Join-Path $RepoRoot 'backend'
$TempDirectory = Join-Path $WorkDir 'tmp'
$LogDirectory = Join-Path $WorkDir 'logs'
$LogFile = Join-Path $LogDirectory ('{0}-{1}.log' -f $Mode, (Get-Date).ToString('yyyyMMdd-HHmmss'))

foreach ($tool in @('node', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Stop-Script "$tool nao foi encontrado no PATH."
    }
}
$nodeVersion = ((& node --version) | Out-String).Trim()
if ($nodeVersion -notmatch '^v22\.') {
    Write-Warning "Node ${nodeVersion}: o projeto usa a versao 22.17.0 (AGENT.md)."
}
if (-not (Test-Path -LiteralPath (Join-Path $BackendDirectory 'node_modules'))) {
    Stop-Script "Dependencias do backend nao instaladas: rode 'npm ci' na pasta backend."
}
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Stop-Script "Arquivo de ambiente nao encontrado: $EnvFile"
}

$values = Read-EnvFile -Path $EnvFile
$missing = @($RequiredKeys | Where-Object { -not $values.ContainsKey($_) -or $values[$_] -eq '' })
if ($missing.Count -gt 0) {
    Stop-Script ('Faltam no arquivo de ambiente: ' + ($missing -join ', '))
}

# Nunca mostra a URL do banco inteira (tem usuario e senha): so o host, a porta e o nome do banco.
try {
    $databaseUri = [System.Uri]$values['TENDERS_COLLECTOR_DATABASE_URL']
} catch {
    Stop-Script 'TENDERS_COLLECTOR_DATABASE_URL nao e uma URL valida.'
}
if ($databaseUri.Scheme -notin @('postgres', 'postgresql')) {
    Stop-Script 'TENDERS_COLLECTOR_DATABASE_URL precisa comecar com postgres:// ou postgresql://.'
}
if ($LocalDatabaseHosts -contains $databaseUri.Host.ToLowerInvariant()) {
    Stop-Script 'Este script grava na PRODUCAO e recusa banco local. Para o banco local, use o comando tenders:dev do backend.'
}
$databasePort = if ($databaseUri.Port -gt 0) { ':' + $databaseUri.Port } else { '' }
$databaseLabel = $databaseUri.Host + $databasePort + $databaseUri.AbsolutePath

Write-Host "Modo: $Mode"
Write-Host "Banco: $databaseLabel (producao)"
Write-Host 'R2: pasta producao'
Write-Host "Pasta de trabalho: $WorkDir (temporarios em $TempDirectory)"
Write-Host "Log: $LogFile"
Write-Host "Memoria do DuckDB: $DuckDbMemoryMb MB | limite de disco: $DiskLimitMb MB | nivel de log: debug"

if ($DryRun) {
    Write-Host ''
    Write-Host 'DryRun: tudo conferido; nada foi gravado nem executado.'
    if ($Mode -eq 'backfill') {
        Write-Host "Rodaria em laco: npm --prefix backend run tenders -- contracts-backfill --from $From --max-minutes $MaxMinutes"
    } else {
        Write-Host 'Rodaria: npm --prefix backend run daily-jobs'
    }
    exit 0
}

if (-not $Yes) {
    $answer = Read-Host "Isto grava na PRODUCAO ($databaseLabel). Digite SIM para continuar"
    if ($answer -cne 'SIM') {
        Stop-Script 'Cancelado: nada foi gravado.'
    }
}

New-Item -ItemType Directory -Force -Path $TempDirectory, $LogDirectory | Out-Null
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    Write-Warning "Nao foi possivel ajustar a codificacao do console para UTF-8 ($($_.Exception.Message)); acentos do log podem sair trocados."
}

# O coletor mede a pasta temporaria inteira: ela precisa ser so da coleta.
$env:TEMP = $TempDirectory
$env:TMP = $TempDirectory
$env:TMPDIR = $TempDirectory
foreach ($key in $RequiredKeys) {
    Set-Item -Path "Env:$key" -Value $values[$key]
}
$env:TENDERS_STORAGE_PREFIX = 'producao'
$env:TENDERS_FEDERAL_ENABLED = '1'
$env:TENDERS_FEDERAL_MINUTES = '30'
$env:TENDERS_DUCKDB_MEMORY_MB = "$DuckDbMemoryMb"
$env:TENDERS_DISK_LIMIT_MB = "$DiskLimitMb"
$env:TENDERS_COLLECTOR_LOG_LEVEL = 'debug'
# Este script nao usa arquivo de ambiente do coletor: tira da sessao qualquer um que alguem tenha deixado definido.
Remove-Item -Path 'Env:DOTENV_CONFIG_PATH' -ErrorAction SilentlyContinue

Push-Location $RepoRoot
try {
    $exitCode = if ($Mode -eq 'backfill') { Invoke-Backfill } else { Invoke-Daily }
} finally {
    Pop-Location
}
exit $exitCode
