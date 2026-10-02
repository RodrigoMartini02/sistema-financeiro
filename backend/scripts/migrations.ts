// Controle das migrations de backend/drizzle pela tabela schema_migrations.
//
//   status                          só lê: pendentes, editadas depois de aplicadas e registros sem arquivo
//   aplicar ID                      executa UMA migration (ex.: 0058) e grava o registro na mesma transação
//   registrar-existentes --ate ID   registra, sem executar, as que já estavam aplicadas antes do controle
//
// Sempre com --banco local (.env.dev) ou --banco producao (.env). Escrever na
// produção exige --confirmo e o ok do usuário; migration que depende do deploy
// só depois do deploy. O script não decide quando aplicar.
//   npm --prefix backend run migrations:status -- --banco local
//   npm --prefix backend run migrations:aplicar -- 0058 --banco producao --confirmo
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import {
  MIGRATION_ID_PATTERN, MigrationRefusal, migrationStatus, migrationToApply, migrationsToRegister, orderMigrations,
  type AppliedMigration, type MigrationFile,
} from '../src/utils/migrationStatus';

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'drizzle');

const COMMANDS = ['status', 'aplicar', 'registrar-existentes'] as const;
type Command = (typeof COMMANDS)[number];

/** Cada banco só aceita a URL esperada: o .env aponta para a produção, o .env.dev para o banco local. */
const DATABASES = {
  local: { envFile: '.env.dev', urlPattern: /@localhost:5433\/sistema_financas_dev$/, ssl: false },
  producao: { envFile: '.env', urlPattern: /\.render\.com\//, ssl: true },
} as const;
type DatabaseName = keyof typeof DATABASES;

interface Args {
  command: Command;
  database: DatabaseName;
  id?: string;
  upTo?: string;
  confirmed: boolean;
}

const USAGE = 'Uso: status | aplicar ID | registrar-existentes --ate ID, sempre com --banco local|producao (produção grava só com --confirmo).';

function readArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as Command)) throw new MigrationRefusal(USAGE);

  const valueOf = (flag: string): string | undefined => {
    const index = rest.indexOf(flag);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const flagValues = new Set([valueOf('--banco'), valueOf('--ate')]);
  const positional = rest.filter((arg) => !arg.startsWith('--') && !flagValues.has(arg));

  const database = valueOf('--banco');
  if (database !== 'local' && database !== 'producao') throw new MigrationRefusal(`Informe --banco local ou --banco producao. ${USAGE}`);

  const args: Args = { command: command as Command, database, confirmed: rest.includes('--confirmo') };
  if (args.command === 'aplicar') args.id = positional[0];
  if (args.command === 'registrar-existentes') args.upTo = valueOf('--ate');

  const id = args.id ?? args.upTo;
  if (args.command !== 'status' && (!id || !MIGRATION_ID_PATTERN.test(id))) {
    throw new MigrationRefusal(`Informe o identificador da migration, como 0058 ou 0018b. ${USAGE}`);
  }
  return args;
}

function readMigrationFiles(): MigrationFile[] {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith('.sql'))
    .map((filename) => ({ filename, content: fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8') }));
  return orderMigrations(files);
}

function connect(database: DatabaseName): { client: Client; schema: string } {
  const config = DATABASES[database];
  const env = dotenv.parse(fs.readFileSync(path.join(ROOT_DIR, config.envFile)));
  const url = env['DATABASE_URL'] ?? '';
  if (!config.urlPattern.test(url)) throw new MigrationRefusal(`O ${config.envFile} não aponta para o banco "${database}" esperado.`);
  const schema = env['DB_SCHEMA'] ?? 'public';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new MigrationRefusal(`DB_SCHEMA inválido no ${config.envFile}.`);
  const client = new Client({ connectionString: url, ...(config.ssl ? { ssl: { rejectUnauthorized: false } } : {}) });
  return { client, schema };
}

async function readRegistry(client: Client): Promise<{ exists: boolean; applied: AppliedMigration[] }> {
  const { rows } = await client.query<{ exists: boolean }>(`SELECT to_regclass('schema_migrations') IS NOT NULL AS exists`);
  if (rows[0]?.exists !== true) return { exists: false, applied: [] };
  const applied = await client.query<AppliedMigration>('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
  return { exists: true, applied: applied.rows };
}

async function showStatus(client: Client, files: MigrationFile[], database: DatabaseName): Promise<void> {
  const { exists, applied } = await readRegistry(client);
  const status = migrationStatus(files, applied);
  console.log(`Banco ${database}: ${exists ? `schema_migrations com ${applied.length} registro(s)` : 'schema_migrations ainda não existe'} · ${files.length} migration(s) no repositório`);
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

async function apply(client: Client, files: MigrationFile[], id: string, database: DatabaseName): Promise<void> {
  const { exists, applied } = await readRegistry(client);
  const target = migrationToApply(files, applied, id, exists);
  await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, target.filename), 'utf8'));
  await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [target.filename, target.checksum]);
  console.log(`Aplicada no banco ${database}: ${target.filename}`);
}

async function registerExisting(client: Client, files: MigrationFile[], upTo: string, database: DatabaseName): Promise<void> {
  const { exists, applied } = await readRegistry(client);
  if (!exists) throw new MigrationRefusal('Este banco ainda não tem a schema_migrations: aplique primeiro a 0057.');
  const toRegister = migrationsToRegister(files, applied, upTo);
  for (const file of toRegister) {
    await client.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING',
      [file.filename, file.checksum],
    );
  }
  const range = toRegister.length > 0 ? ` (${toRegister[0]!.id} a ${toRegister[toRegister.length - 1]!.id})` : '';
  console.log(`Registradas sem executar no banco ${database}: ${toRegister.length}${range}`);
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  const writes = args.command !== 'status';
  if (writes && args.database === 'producao' && !args.confirmed) {
    throw new MigrationRefusal('Escrever na produção exige --confirmo, com o ok do usuário.');
  }

  const files = readMigrationFiles();
  const { client, schema } = connect(args.database);
  await client.connect();
  try {
    await client.query(writes ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY');
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    if (args.command === 'status') await showStatus(client, files, args.database);
    if (args.command === 'aplicar') await apply(client, files, args.id!, args.database);
    if (args.command === 'registrar-existentes') await registerExisting(client, files, args.upTo!, args.database);
    await client.query(writes ? 'COMMIT' : 'ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof MigrationRefusal) {
    console.error(`Recusado: ${error.message}`);
  } else {
    console.error('Erro (nada foi gravado):', error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
