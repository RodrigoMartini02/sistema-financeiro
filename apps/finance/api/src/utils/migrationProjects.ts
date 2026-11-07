// Projetos e bancos que o runner de migrations (scripts/migrations.ts) conhece. Cada projeto tem a sua pasta
// de migrations, a sua tabela schema_migrations e, em cada ambiente, um banco só: o .env.dev aponta para o banco
// local e o .env para a produção. Sem acesso ao banco: só confere se a URL é a esperada antes de qualquer conexão.
import { MigrationRefusal, REGISTRY_MIGRATION } from './migrationStatus';

export const PROJECT_NAMES = ['finance'] as const;
export type ProjectName = (typeof PROJECT_NAMES)[number];

export const DATABASE_NAMES = ['local', 'producao'] as const;
export type DatabaseName = (typeof DATABASE_NAMES)[number];

interface DatabaseConfig {
  envFile: '.env.dev' | '.env';
  /** Variável do arquivo com a URL do banco. */
  urlVariable: string;
  /** Cada banco só aceita a URL esperada. */
  urlPattern: RegExp;
  ssl: boolean;
  /** Variável com o schema padrão da sessão; sem ela, `public`. */
  schemaVariable: string | null;
  /** Variável de outro projeto, no mesmo arquivo, que NÃO pode apontar para o mesmo banco. */
  mustDifferFrom: string | null;
}

export interface MigrationProject {
  /** Pasta das migrations, a partir desta API. */
  migrationsFolder: string;
  registryMigration: string;
  databases: Record<DatabaseName, DatabaseConfig>;
}

export const MIGRATION_PROJECTS: Record<ProjectName, MigrationProject> = {
  finance: {
    migrationsFolder: 'drizzle',
    registryMigration: REGISTRY_MIGRATION,
    databases: {
      local: { envFile: '.env.dev', urlVariable: 'DATABASE_URL', urlPattern: /@localhost:5433\/sistema_financas_dev$/, ssl: false, schemaVariable: 'DB_SCHEMA', mustDifferFrom: null },
      producao: { envFile: '.env', urlVariable: 'DATABASE_URL', urlPattern: /\.render\.com\//, ssl: true, schemaVariable: 'DB_SCHEMA', mustDifferFrom: null },
    },
  },
};

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

/** Nome do banco no fim da URL de conexão (sem a query string). */
export function databaseNameOf(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path.slice(path.lastIndexOf('/') + 1);
}

export interface ResolvedDatabase {
  url: string;
  schema: string;
  ssl: boolean;
}

/** URL e schema do banco do projeto no ambiente, ou o motivo de recusar: nada se conecta antes disto. */
export function resolveDatabase(
  project: ProjectName,
  database: DatabaseName,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedDatabase {
  const config = MIGRATION_PROJECTS[project].databases[database];
  return resolveConfig(config, database, env);
}

/** Usado somente ao aplicar a migration histórica 0096; status e boot não o chamam. */
export function resolveTendersCleanupDatabase(
  database: DatabaseName,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedDatabase {
  return resolveConfig({
    envFile: database === 'local' ? '.env.dev' : '.env',
    urlVariable: 'TENDERS_DATABASE_URL',
    urlPattern: database === 'local' ? /@localhost:5433\/fingerence_licitacoes_dev$/ : /\.render\.com\//,
    ssl: database === 'producao',
    schemaVariable: null,
    mustDifferFrom: 'DATABASE_URL',
  }, database, env);
}

function resolveConfig(
  config: DatabaseConfig,
  database: DatabaseName,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedDatabase {
  const url = env[config.urlVariable] ?? '';
  if (!config.urlPattern.test(url)) {
    throw new MigrationRefusal(
      `O ${config.envFile} (${config.urlVariable}) não aponta para o banco "${database}" esperado.`,
    );
  }

  const other = config.mustDifferFrom ? env[config.mustDifferFrom] : undefined;
  if (other && databaseNameOf(other) === databaseNameOf(url)) {
    throw new MigrationRefusal(
      `${config.urlVariable} aponta para o mesmo banco de ${config.mustDifferFrom}: Licitações tem banco próprio.`,
    );
  }

  const schema = (config.schemaVariable ? env[config.schemaVariable] : undefined) ?? 'public';
  if (!SCHEMA_NAME.test(schema)) {
    throw new MigrationRefusal(`${config.schemaVariable ?? 'schema'} inválido no ${config.envFile}.`);
  }
  return { url, schema, ssl: config.ssl };
}
