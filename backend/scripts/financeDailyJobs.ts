// Rotina de vencimento de planos de Finanças: chama a rota interna do backend com o segredo da rotina.
//   npm --prefix backend run finance:daily-jobs
// Variáveis: BILLING_CRON_SECRET e, se fugir do padrão, BACKEND_URL. Só lê arquivo de ambiente quando
// DOTENV_CONFIG_PATH está definido: nunca cai no .env de produção por padrão. Quem agenda este comando
// ainda não está definido (plano .plans/separar-financas-e-licitacoes.md, etapa 4). A lógica fica em
// src/services/planLifecycleJob.ts. A rotina diária de Licitações é outro comando: `npm run daily-jobs`.
import * as dotenv from 'dotenv';
import { createJobLogger, runPlanLifecycleJob } from '../src/services/planLifecycleJob';

if (process.env['DOTENV_CONFIG_PATH']) {
  dotenv.config({ path: process.env['DOTENV_CONFIG_PATH'] });
}

const logger = createJobLogger();

logger.info('Rotina de planos iniciada');
runPlanLifecycleJob(process.env, logger)
  .then(() => {
    logger.info('Rotina de planos finalizada');
  })
  .catch((error: unknown) => {
    logger.error('A rotina de planos falhou', { error });
    process.exitCode = 1;
  });
