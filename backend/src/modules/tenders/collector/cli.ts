import { parseArgs } from 'node:util';
import * as dotenv from 'dotenv';
import { BRAZILIAN_STATES, TENDER_MODALITY_IDS, type BrazilianState } from '../domains';
import { ComprasGovClient } from './comprasGovClient';
import { CollectorConfigError, databaseHost, loadComprasGovSettings } from './config';
import { runContractReminders, runContractsBackfill, runContractsDaily } from './contractRuns';
import { errorMessage } from './logger';
import { runNoticesPayloadExport } from './noticePayloadExport';
import { renderProbeReport, runResultProbe } from './resultProbe';
import { runResultsBackfill, runResultsDaily } from './resultRuns';
import { renderSupplierCheck, runSupplierCheck } from './supplierCheck';
import { runWinnersLookup, DEFAULT_LOOKUP_LIMIT, MAX_LOOKUP_LIMIT } from './winnersLookup';
import {
  readStatus,
  runCleanup,
  runDeadlineReminders,
  runIncremental,
  runManualCollect,
  runReprocessNotifications,
  runSweep,
  type CollectorContext,
  type RunOutcome,
} from './runs';
import { createCollectorRuntime } from './runtime';

// Comandos do coletor (Render Cron Jobs e depuração):
//   npm --prefix backend run tenders -- sweep | incremental | deadline-reminders | cleanup | status
//   npm --prefix backend run tenders -- reprocess-notifications --since 2026-10-01
//   npm --prefix backend run tenders -- collect --modality 6 --state MA --max-pages 2
//   npm --prefix backend run tenders -- contracts-daily | contract-reminders
//   npm --prefix backend run tenders -- contracts-backfill --from 2026-09-01 --to 2026-09-30 --max-minutes 60
//   npm --prefix backend run tenders -- notices-payload-export   (JSON dos editais para o R2, antes da 0088)
//   npm --prefix backend run tenders -- winners-probe [--day 2026-09-14] [--max-pages 5]   (sondagem do Compras.gov.br: sem banco e sem R2)
//   npm --prefix backend run tenders -- winners-probe --fornecedor 11222333000181 --from 2026-09-01 --to 2026-09-30   (confere um fornecedor contra a fonte)
//   npm --prefix backend run tenders -- winners-daily | winners-backfill --from 2026-09-01 --to 2026-09-30 --max-minutes 120
//   npm --prefix backend run tenders -- winners-lookup --cnpj 11222333000181 [--limit 20]   (as vitórias de um fornecedor)
// Só carrega arquivo de ambiente quando DOTENV_CONFIG_PATH está definido
// (script tenders:dev): nunca cai no .env de produção por padrão.

export const CLI_COMMANDS = [
  'sweep',
  'incremental',
  'deadline-reminders',
  'reprocess-notifications',
  'status',
  'collect',
  'cleanup',
  'contracts-daily',
  'contracts-backfill',
  'contract-reminders',
  'notices-payload-export',
  'winners-probe',
  'winners-daily',
  'winners-backfill',
  'winners-lookup',
] as const;
export type CliCommandName = (typeof CLI_COMMANDS)[number];

export type CliCommand =
  | {
      name:
        | 'sweep'
        | 'incremental'
        | 'deadline-reminders'
        | 'status'
        | 'cleanup'
        | 'contracts-daily'
        | 'contract-reminders'
        | 'notices-payload-export'
        | 'winners-daily';
    }
  | { name: 'reprocess-notifications'; since: string }
  | { name: 'collect'; modality: number; state: BrazilianState | null; maxPages: number | null }
  | { name: 'contracts-backfill' | 'winners-backfill'; from: string | null; to: string | null; maxMinutes: number | null }
  | {
      name: 'winners-probe';
      day: string | null;
      maxPages: number | null;
      /** CNPJ a conferir: com ele, o comando lê os resultados desse fornecedor no período (`from` e `to`, ou o `day`). */
      supplier: string | null;
      from: string | null;
      to: string | null;
    }
  | { name: 'winners-lookup'; cnpj: string; limit: number | null };

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

const USAGE = [
  'Uso: npm --prefix backend run tenders -- <comando>',
  '  sweep | incremental | deadline-reminders | cleanup | status',
  '  reprocess-notifications --since AAAA-MM-DD',
  '  collect --modality N [--state UF] [--max-pages N]',
  '  contracts-daily | contract-reminders',
  '  contracts-backfill [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--max-minutes N]',
  '  notices-payload-export',
  '  winners-probe [--day AAAA-MM-DD] [--max-pages N]',
  '  winners-probe --fornecedor 00000000000000 (--day AAAA-MM-DD | --from AAAA-MM-DD --to AAAA-MM-DD) [--max-pages N]',
  '  winners-daily',
  '  winners-backfill [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--max-minutes N]',
  '  winners-lookup --cnpj 00000000000000 [--limit N]',
].join('\n');

const CLI_OPTIONS = {
  since: { type: 'string' },
  modality: { type: 'string' },
  state: { type: 'string' },
  'max-pages': { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
  'max-minutes': { type: 'string' },
  day: { type: 'string' },
  cnpj: { type: 'string' },
  limit: { type: 'string' },
  fornecedor: { type: 'string' },
} as const;
type CliOptionName = keyof typeof CLI_OPTIONS;

const OPTIONS_BY_COMMAND: Record<CliCommandName, readonly CliOptionName[]> = {
  sweep: [],
  incremental: [],
  'deadline-reminders': [],
  status: [],
  cleanup: [],
  'reprocess-notifications': ['since'],
  collect: ['modality', 'state', 'max-pages'],
  'contracts-daily': [],
  'contract-reminders': [],
  'contracts-backfill': ['from', 'to', 'max-minutes'],
  'notices-payload-export': [],
  'winners-probe': ['day', 'max-pages', 'fornecedor', 'from', 'to'],
  'winners-daily': [],
  'winners-backfill': ['from', 'to', 'max-minutes'],
  'winners-lookup': ['cnpj', 'limit'],
};

const MAX_PAGES_LIMIT = 10_000;
/** O mesmo teto de TENDERS_CONTRACTS_BACKFILL_MINUTES. */
const MAX_BACKFILL_MINUTES = 600;

function isCliCommandName(value: string): value is CliCommandName {
  return (CLI_COMMANDS as readonly string[]).includes(value);
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return date.toISOString().slice(0, 10) === value;
}

function readPositiveInteger(value: string, option: string, max: number): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    throw new CliUsageError(`--${option} deve ser um número inteiro de 1 a ${max}`);
  }
  return Number(value);
}

function readRawArgs(argv: string[]) {
  try {
    return parseArgs({ args: argv, options: CLI_OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new CliUsageError(`${errorMessage(error)}\n${USAGE}`);
  }
}

export function parseCliArgs(argv: string[]): CliCommand {
  const parsed = readRawArgs(argv);
  const [name, ...extra] = parsed.positionals;
  if (!name || !isCliCommandName(name)) {
    throw new CliUsageError(name ? `Comando desconhecido: ${name}\n${USAGE}` : USAGE);
  }
  if (extra.length > 0) {
    throw new CliUsageError(`Argumentos a mais: ${extra.join(' ')}\n${USAGE}`);
  }

  const values = parsed.values;
  for (const option of Object.keys(values) as CliOptionName[]) {
    if (!OPTIONS_BY_COMMAND[name].includes(option)) {
      throw new CliUsageError(`A opção --${option} não vale para o comando ${name}\n${USAGE}`);
    }
  }

  if (name === 'reprocess-notifications') {
    const since = values.since;
    if (!since || !isValidCalendarDate(since)) {
      throw new CliUsageError('reprocess-notifications exige --since com uma data válida AAAA-MM-DD');
    }
    return { name, since };
  }

  if (name === 'collect') {
    if (!values.modality) {
      throw new CliUsageError('collect exige --modality (1 a 13)');
    }
    const modality = readPositiveInteger(values.modality, 'modality', 13);
    if (!TENDER_MODALITY_IDS.includes(modality)) {
      throw new CliUsageError('--modality deve ser uma modalidade do PNCP (1 a 13)');
    }
    const state = values.state?.toUpperCase() ?? null;
    if (state !== null && !(BRAZILIAN_STATES as readonly string[]).includes(state)) {
      throw new CliUsageError('--state deve ser uma UF (ex.: MA)');
    }
    const maxPages = values['max-pages'] ? readPositiveInteger(values['max-pages'], 'max-pages', MAX_PAGES_LIMIT) : null;
    return { name, modality, state: state as BrazilianState | null, maxPages };
  }

  if (name === 'contracts-backfill' || name === 'winners-backfill') {
    return parseBackfillOptions(name, values);
  }

  if (name === 'winners-probe') {
    const day = readOptionalDate(values.day, 'day');
    const maxPages = values['max-pages'] ? readPositiveInteger(values['max-pages'], 'max-pages', MAX_PAGES_LIMIT) : null;
    const from = readOptionalDate(values.from, 'from');
    const to = readOptionalDate(values.to, 'to');
    const supplier = values.fornecedor ?? null;
    if (supplier === null) {
      if (from !== null || to !== null) {
        throw new CliUsageError('--from e --to só valem com --fornecedor');
      }
      return { name, day, maxPages, supplier: null, from: null, to: null };
    }
    if (!/^\d{14}$/.test(supplier)) {
      throw new CliUsageError('--fornecedor deve ter os 14 dígitos do CNPJ, sem pontos nem barra');
    }
    if (day !== null && (from !== null || to !== null)) {
      throw new CliUsageError('use --day ou --from e --to, não os dois');
    }
    if (day === null && (from === null || to === null)) {
      throw new CliUsageError('--fornecedor exige --day, ou --from e --to');
    }
    if (from !== null && to !== null && from > to) {
      throw new CliUsageError('--from deve ser antes de --to');
    }
    return { name, day, maxPages, supplier, from, to };
  }

  if (name === 'winners-lookup') {
    const cnpj = values.cnpj;
    if (!cnpj || !/^\d{14}$/.test(cnpj)) {
      throw new CliUsageError('winners-lookup exige --cnpj com os 14 dígitos, sem pontos nem barra');
    }
    const limit = values.limit ? readPositiveInteger(values.limit, 'limit', MAX_LOOKUP_LIMIT) : null;
    return { name, cnpj, limit };
  }

  return { name };
}

function readOptionalDate(value: string | undefined, option: string): string | null {
  if (value === undefined) {
    return null;
  }
  if (!isValidCalendarDate(value)) {
    throw new CliUsageError(`--${option} deve ser uma data válida AAAA-MM-DD`);
  }
  return value;
}

function parseBackfillOptions(name: 'contracts-backfill' | 'winners-backfill', values: Partial<Record<CliOptionName, string>>): CliCommand {
  const from = readOptionalDate(values.from, 'from');
  const to = readOptionalDate(values.to, 'to');
  if (from !== null && to !== null && from > to) {
    throw new CliUsageError('--from deve ser antes de --to');
  }
  const maxMinutes = values['max-minutes'] ? readPositiveInteger(values['max-minutes'], 'max-minutes', MAX_BACKFILL_MINUTES) : null;
  return { name, from, to, maxMinutes };
}

/** Comandos que não precisam do runtime do coletor (URL do banco, conexão e R2): saem antes de criá-lo. */
type CommandWithoutRuntime = Extract<CliCommand, { name: 'winners-probe' }>;

function needsNoRuntime(command: CliCommand): command is CommandWithoutRuntime {
  return command.name === 'winners-probe';
}

/**
 * Sondagem do Compras.gov.br: lê só a fonte pública e imprime o relatório (JSON) na saída padrão; o andamento vai
 * para a saída de erro. Só precisa de COMPRASGOV_REQUEST_INTERVAL_MS (opcional), nunca do banco nem do R2.
 */
async function runWithoutRuntime(command: CommandWithoutRuntime): Promise<void> {
  const settings = loadComprasGovSettings(process.env);
  const client = new ComprasGovClient({ requestIntervalMs: settings.requestIntervalMs });
  if (command.supplier !== null) {
    // Conferência de um fornecedor: o período é o dia, ou de --from a --to (a leitura do comando já os validou).
    const window = { from: command.day ?? command.from ?? '', to: command.day ?? command.to ?? '' };
    const check = await runSupplierCheck(
      { client, now: () => new Date(), progress: (message) => console.error(message) },
      { cnpj: command.supplier, window, ...(command.maxPages !== null ? { maxPages: command.maxPages } : {}) },
    );
    console.log(renderSupplierCheck(check));
    if (check.stoppedBy === 'error' || check.stoppedBy === 'rateLimit') {
      process.exitCode = 1;
    }
    return;
  }
  const report = await runResultProbe(
    { client, now: () => new Date(), requestIntervalMs: settings.requestIntervalMs, progress: (message) => console.error(message) },
    { ...(command.day !== null ? { day: command.day } : {}), ...(command.maxPages !== null ? { maxPages: command.maxPages } : {}) },
  );
  console.log(renderProbeReport(report));
  if (report.structure['endpointOk'] !== true) {
    process.exitCode = 1;
  }
}

async function runCommand(context: CollectorContext, command: Exclude<CliCommand, CommandWithoutRuntime>): Promise<RunOutcome | null> {
  switch (command.name) {
    case 'sweep':
      return runSweep(context);
    case 'incremental':
      return runIncremental(context);
    case 'deadline-reminders':
      return runDeadlineReminders(context);
    case 'cleanup':
      return runCleanup(context);
    case 'reprocess-notifications':
      return runReprocessNotifications(context, command.since);
    case 'collect':
      return runManualCollect(context, command);
    case 'contracts-daily':
      return runContractsDaily(context);
    case 'notices-payload-export':
      return runNoticesPayloadExport(context);
    case 'contract-reminders':
      return runContractReminders(context);
    case 'contracts-backfill':
      return runContractsBackfill(context, {
        ...(command.from !== null ? { from: command.from } : {}),
        ...(command.to !== null ? { to: command.to } : {}),
        ...(command.maxMinutes !== null ? { maxMinutes: command.maxMinutes } : {}),
      });
    case 'winners-daily':
      return runResultsDaily(context);
    case 'winners-backfill':
      // Com --from ou --to é reparo: relê a faixa inteira, mesmo os dias já marcados.
      return runResultsBackfill(context, {
        ...(command.from !== null ? { from: command.from } : {}),
        ...(command.to !== null ? { to: command.to } : {}),
        ...(command.maxMinutes !== null ? { maxMinutes: command.maxMinutes } : {}),
      });
    case 'winners-lookup': {
      const report = await runWinnersLookup(context, command.cnpj, command.limit ?? DEFAULT_LOOKUP_LIMIT);
      console.log(JSON.stringify(report, null, 2));
      return null;
    }
    case 'status': {
      const status = await readStatus(context);
      console.log(JSON.stringify(status, null, 2));
      return null;
    }
  }
}

async function main(): Promise<void> {
  if (process.env.DOTENV_CONFIG_PATH) {
    dotenv.config({ path: process.env.DOTENV_CONFIG_PATH });
  }

  const command = parseCliArgs(process.argv.slice(2));
  if (needsNoRuntime(command)) {
    await runWithoutRuntime(command);
    return;
  }

  const { context, close } = createCollectorRuntime(process.env);
  context.logger.info('Coletor de licitações', { command: command.name, database: databaseHost(context.config.databaseUrl) });

  try {
    const outcome = await runCommand(context, command);
    if (outcome && !outcome.skipped && outcome.status === 'FALHA') {
      process.exitCode = 1;
    }
    // A exportação pedida à mão que não pôde rodar (sem R2 ou depois da 0088) não é sucesso.
    if (outcome?.skipped && command.name === 'notices-payload-export') {
      process.exitCode = 1;
    }
  } finally {
    await close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    if (error instanceof CliUsageError || error instanceof CollectorConfigError) {
      console.error(error.message);
    } else {
      console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), msg: 'O coletor parou com erro', error: errorMessage(error) }));
    }
    process.exitCode = 1;
  });
}
