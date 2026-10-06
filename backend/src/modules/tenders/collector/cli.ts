import { parseArgs } from 'node:util';
import * as dotenv from 'dotenv';
import { BRAZILIAN_STATES, TENDER_MODALITY_IDS, type BrazilianState } from '../domains';
import { CollectorConfigError, databaseHost } from './config';
import { errorMessage } from './logger';
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
] as const;
export type CliCommandName = (typeof CLI_COMMANDS)[number];

export type CliCommand =
  | { name: 'sweep' | 'incremental' | 'deadline-reminders' | 'status' | 'cleanup' }
  | { name: 'reprocess-notifications'; since: string }
  | { name: 'collect'; modality: number; state: BrazilianState | null; maxPages: number | null };

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
].join('\n');

const CLI_OPTIONS = {
  since: { type: 'string' },
  modality: { type: 'string' },
  state: { type: 'string' },
  'max-pages': { type: 'string' },
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
};

const MAX_PAGES_LIMIT = 10_000;

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

  return { name };
}

async function runCommand(context: CollectorContext, command: CliCommand): Promise<RunOutcome | null> {
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
  const { context, close } = createCollectorRuntime(process.env);
  context.logger.info('Coletor de licitações', { command: command.name, database: databaseHost(context.config.databaseUrl) });

  try {
    const outcome = await runCommand(context, command);
    if (outcome && !outcome.skipped && outcome.status === 'FALHA') {
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
