// Rotina diária de Licitações, no Cron Job do Render ou na máquina própria: varredura
// de editais, lembretes de prazo, contratos e, aos domingos, limpeza.
// Um comando só, porque o Render não aceita um Command longo.
//   npm --prefix apps/tenders/api run daily-jobs
// Variáveis: TENDERS_COLLECTOR_DATABASE_URL e as do R2. Só lê arquivo de ambiente
// quando DOTENV_CONFIG_PATH está definido, como o coletor: nunca cai no .env de
// produção por padrão. A lógica fica em dailyRoutine.ts. A rotina de planos de
// Finanças roda em outra API: `npm --prefix apps/finance/api run daily-jobs`.
import { loadEnvironment } from '../config/environment';
import { runDailyJobs } from './dailyRoutine';
import { errorMessage } from './logger';

loadEnvironment();

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
