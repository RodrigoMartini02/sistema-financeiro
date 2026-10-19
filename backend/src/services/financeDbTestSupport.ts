import * as dotenv from 'dotenv';

// Apoio dos testes de banco de finanças (*.db.test.ts em services). Eles só rodam pelo script test:finance-db
// (FINANCE_DB_TESTS=1) e só em banco local; cada teste cria a sua pessoa de teste e apaga o que criou, sem tocar
// nos dados dos outros.

const LOCAL_DATABASE_URL = /@(localhost|127\.0\.0\.1)(:\d+)?\/[\w-]+$/;

export const databaseTestsSkipReason =
  process.env['FINANCE_DB_TESTS'] === '1' ? false : 'teste de banco: rode npm --prefix backend run test:finance-db';

/** Confere que o banco é local. Vem antes de importar db/client, que abre a conexão ao ser importado. */
export function assertLocalDatabase(): void {
  if (process.env['DOTENV_CONFIG_PATH']) {
    dotenv.config({ path: process.env['DOTENV_CONFIG_PATH'] });
  }
  if (!LOCAL_DATABASE_URL.test(process.env['DATABASE_URL'] ?? '')) {
    throw new Error('Os testes de banco só rodam em banco local (localhost ou 127.0.0.1).');
  }
}
