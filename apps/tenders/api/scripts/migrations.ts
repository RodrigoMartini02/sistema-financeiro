// Controle das migrations de Licitações pela schema_migrations, usando somente migrations/ desta API.
//
//   status                          só lê: pendentes, editadas depois de aplicadas e registros sem arquivo
//   aplicar ID                      executa UMA migration (ex.: 0058) e grava o registro na mesma transação
//   registrar-existentes --ate ID   registra, sem executar, as que já estavam aplicadas antes do controle
//
// Sempre com --banco local ou producao; --projeto tenders é opcional. DOTENV_CONFIG_PATH tem prioridade;
// sem ele, usa o arquivo correspondente na raiz do repositório, quando existe, ou as variáveis do processo.
// Escrever na produção exige --confirmo e o ok do usuário; migration que depende do deploy só depois do deploy.
// O script não decide quando aplicar.
//   npm --prefix apps/tenders/api run migrations:status -- --banco local
//   npm --prefix apps/tenders/api run migrations:aplicar -- 0001 --banco producao --confirmo
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import {
  DATABASE_NAMES, MIGRATION_PROJECTS, PROJECT_NAMES, resolveDatabase, type DatabaseName, type ProjectName,
} from '../src/utils/migrationProjects';
import {
  MIGRATION_ID_PATTERN, MigrationRefusal, migrationStatus, migrationToApply, migrationsToRegister, orderMigrations,
  type AppliedMigration, type MigrationFile,
} from '../src/utils/migrationStatus';
const ROOT_DIR = path.resolve(__dirname, '../../../..');
const API_DIR = path.resolve(__dirname, '..');

const COMMANDS = ['status', 'aplicar', 'registrar-existentes'] as const;
type Command = (typeof COMMANDS)[number];

interface Args {
  command: Command;
  database: DatabaseName;
  project: ProjectName;
  id?: string;
  upTo?: string;
  confirmed: boolean;
}

const USAGE = 'Uso: status | aplicar ID | registrar-existentes --ate ID, sempre com --banco local|producao; esta API aceita somente --projeto tenders (produção grava só com --confirmo).';

export function readArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as Command)) throw new MigrationRefusal(USAGE);

  const valueFlags = ['--banco', '--ate', '--projeto'];
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]!;
    if (!flag.startsWith('--')) continue;
    if (flag === '--confirmo') continue;
    if (!valueFlags.includes(flag) || !rest[index + 1] || rest[index + 1]!.startsWith('--')) {
      throw new MigrationRefusal(`Opção inválida ou sem valor: ${flag}. ${USAGE}`);
    }
    index += 1;
  }

  const valueOf = (flag: string): string | undefined => {
    const index = rest.indexOf(flag);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const flagValues = new Set([valueOf('--banco'), valueOf('--ate'), valueOf('--projeto')]);
  const positional = rest.filter((arg) => !arg.startsWith('--') && !flagValues.has(arg));
  if (positional.length !== (command === 'aplicar' ? 1 : 0)) throw new MigrationRefusal(USAGE);

  const database = valueOf('--banco');
  if (!DATABASE_NAMES.includes(database as DatabaseName)) {
    throw new MigrationRefusal(`Informe --banco local ou --banco producao. ${USAGE}`);
  }
  const project = valueOf('--projeto') ?? PROJECT_NAMES[0];
  if (!PROJECT_NAMES.includes(project as ProjectName)) {
    throw new MigrationRefusal(`Projeto inválido: use --projeto ${PROJECT_NAMES.join(' ou --projeto ')}. ${USAGE}`);
  }

  const args: Args = { command: command as Command, database: database as DatabaseName, project: project as ProjectName, confirmed: rest.includes('--confirmo') };
  if (args.command === 'aplicar') args.id = positional[0];
  if (args.command === 'registrar-existentes') args.upTo = valueOf('--ate');

  const id = args.id ?? args.upTo;
  if (args.command !== 'status' && (!id || !MIGRATION_ID_PATTERN.test(id))) {
    throw new MigrationRefusal(`Informe o identificador da migration, como 0058 ou 0018b. ${USAGE}`);
  }
  return args;
}

function migrationsDirectory(project: ProjectName): string {
  return path.resolve(API_DIR, MIGRATION_PROJECTS[project].migrationsFolder);
}

function readMigrationFiles(project: ProjectName): MigrationFile[] {
  const directory = migrationsDirectory(project);
  const files = fs.readdirSync(directory)
    .filter((filename) => filename.endsWith('.sql'))
    .map((filename) => ({ filename, content: fs.readFileSync(path.join(directory, filename), 'utf8') }));
  return orderMigrations(files);
}

function readEnvironment(project: ProjectName, database: DatabaseName): Record<string, string | undefined> {
  const { envFile } = MIGRATION_PROJECTS[project].databases[database];
  const explicit = process.env['DOTENV_CONFIG_PATH'];
  const filename = explicit ? path.resolve(process.cwd(), explicit) : path.join(ROOT_DIR, envFile);
  if (explicit && !fs.existsSync(filename)) {
    throw new MigrationRefusal('O arquivo indicado em DOTENV_CONFIG_PATH não existe.');
  }
  return fs.existsSync(filename) ? { ...process.env, ...dotenv.parse(fs.readFileSync(filename)) } : process.env;
}

function connect(project: ProjectName, database: DatabaseName): { client: Client; schema: string } {
  const env = readEnvironment(project, database);
  const resolved = resolveDatabase(project, database, env);
  const client = new Client({ connectionString: resolved.url, ...(resolved.ssl ? { ssl: { rejectUnauthorized: false } } : {}) });
  return { client, schema: resolved.schema };
}

async function readRegistry(client: Client): Promise<{ exists: boolean; applied: AppliedMigration[] }> {
  const { rows } = await client.query<{ exists: boolean }>(`SELECT to_regclass('schema_migrations') IS NOT NULL AS exists`);
  if (rows[0]?.exists !== true) return { exists: false, applied: [] };
  const applied = await client.query<AppliedMigration>('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
  return { exists: true, applied: applied.rows };
}

async function showStatus(client: Client, files: MigrationFile[], args: Args): Promise<void> {
  const { exists, applied } = await readRegistry(client);
  const status = migrationStatus(files, applied);
  console.log(`Banco ${args.database} (${args.project}): ${exists ? `schema_migrations com ${applied.length} registro(s)` : 'schema_migrations ainda não existe'} · ${files.length} migration(s) no repositório`);
  console.log(status.pending.length === 0
    ? 'Pendentes: nenhuma'
    : `Pendentes (${status.pending.length}): ${status.pending.map((file) => file.id).join(', ')}`);
  if (status.edited.length > 0) {
    console.log(`Editadas depois de aplicadas (${status.edited.length}): ${status.edited.map((file) => file.filename).join(', ')}`);
  }
  if (status.missingFile.length > 0) {
    console.log(`Registros sem arquivo (${status.missingFile.length}): ${status.missingFile.map((item) => item.filename).join(', ')}`);
  }
}

async function apply(client: Client, files: MigrationFile[], args: Args): Promise<void> {
  const { exists, applied } = await readRegistry(client);
  const target = migrationToApply(files, applied, args.id!, exists, MIGRATION_PROJECTS[args.project].registryMigration);
  await client.query(fs.readFileSync(path.join(migrationsDirectory(args.project), target.filename), 'utf8'));
  await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [target.filename, target.checksum]);
  console.log(`Aplicada no banco ${args.database} (${args.project}): ${target.filename}`);
}

async function registerExisting(client: Client, files: MigrationFile[], args: Args): Promise<void> {
  const { exists, applied } = await readRegistry(client);
  if (!exists) {
    throw new MigrationRefusal(`Este banco ainda não tem a schema_migrations: aplique primeiro a ${MIGRATION_PROJECTS[args.project].registryMigration}.`);
  }
  const toRegister = migrationsToRegister(files, applied, args.upTo!);
  for (const file of toRegister) {
    await client.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING',
      [file.filename, file.checksum],
    );
  }
  const range = toRegister.length > 0 ? ` (${toRegister[0]!.id} a ${toRegister[toRegister.length - 1]!.id})` : '';
  console.log(`Registradas sem executar no banco ${args.database} (${args.project}): ${toRegister.length}${range}`);
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  const writes = args.command !== 'status';
  if (writes && args.database === 'producao' && !args.confirmed) {
    throw new MigrationRefusal('Escrever na produção exige --confirmo, com o ok do usuário.');
  }

  const files = readMigrationFiles(args.project);
  const { client, schema } = connect(args.project, args.database);
  await client.connect();
  try {
    await client.query(writes ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY');
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    if (args.command === 'status') await showStatus(client, files, args);
    if (args.command === 'aplicar') await apply(client, files, args);
    if (args.command === 'registrar-existentes') await registerExisting(client, files, args);
    await client.query(writes ? 'COMMIT' : 'ROLLBACK');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      console.error('Não foi possível confirmar o rollback da operação de migrations.');
    }
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) main().catch((error: unknown) => {
  if (error instanceof MigrationRefusal) {
    console.error(`Recusado: ${error.message}`);
  } else {
    console.error('Erro (nada foi gravado):', error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
