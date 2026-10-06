// Rotina diária do Cron Job do Render: rotina de vencimento de planos,
// varredura de Licitações, lembretes de prazo e, aos domingos, limpeza.
// Um comando só, porque o Render não aceita um Command longo.
//   npm --prefix backend run daily-jobs
// Variáveis: BILLING_CRON_SECRET, TENDERS_COLLECTOR_DATABASE_URL e, se fugir
// do padrão, BACKEND_URL. Só lê arquivo de ambiente quando DOTENV_CONFIG_PATH
// está definido, como o coletor: nunca cai no .env de produção por padrão.
// A lógica fica em src/services/dailyJobs.ts.
import * as dotenv from 'dotenv';
import { errorMessage } from '../src/modules/tenders/collector/logger';
import { runDailyJobs } from '../src/services/dailyJobs';

if (process.env['DOTENV_CONFIG_PATH']) {
  dotenv.config({ path: process.env['DOTENV_CONFIG_PATH'] });
}

runDailyJobs(process.env)
  .then((allSucceeded) => {
    if (!allSucceeded) {
      process.exitCode = 1;
    }
  })
  .catch((error: unknown) => {
    console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), msg: 'A rotina diária parou com erro', error: errorMessage(error) }));
    process.exitCode = 1;
  });
