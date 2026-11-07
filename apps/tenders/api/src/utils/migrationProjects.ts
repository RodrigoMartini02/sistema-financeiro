import { MigrationRefusal, REGISTRY_MIGRATION } from './migrationStatus';

export const PROJECT_NAMES = ['tenders'] as const;
export type ProjectName = (typeof PROJECT_NAMES)[number];
export const DATABASE_NAMES = ['local', 'producao'] as const;
export type DatabaseName = (typeof DATABASE_NAMES)[number];

export const MIGRATION_PROJECTS = {
  tenders: {
    migrationsFolder: 'migrations',
    registryMigration: REGISTRY_MIGRATION,
    databases: {
      local: { envFile: '.env.dev', urlPattern: /@localhost:5433\/fingerence_licitacoes_dev$/, ssl: false },
      producao: { envFile: '.env', urlPattern: /\.render\.com\//, ssl: true },
    },
  },
} as const;

export function databaseNameOf(url: string): string {
  const pathname = url.split('?')[0] ?? '';
  return pathname.slice(pathname.lastIndexOf('/') + 1);
}

export function resolveDatabase(
  project: ProjectName,
  database: DatabaseName,
  env: Readonly<Record<string, string | undefined>>,
): { url: string; schema: string; ssl: boolean } {
  const config = MIGRATION_PROJECTS[project].databases[database];
  const url = env['TENDERS_DATABASE_URL'] ?? '';
  if (!config.urlPattern.test(url)) {
    throw new MigrationRefusal(`O ${config.envFile} (TENDERS_DATABASE_URL) não aponta para o banco "${database}" esperado.`);
  }
  const financeUrl = env['DATABASE_URL'];
  if (financeUrl && databaseNameOf(financeUrl) === databaseNameOf(url)) {
    throw new MigrationRefusal('TENDERS_DATABASE_URL aponta para o mesmo banco de DATABASE_URL: Licitações tem banco próprio.');
  }
  return { url, schema: 'public', ssl: config.ssl };
}
