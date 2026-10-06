import { loadCollectorConfig } from './config';
import { createCollectorDatabase } from './database';
import { createCollectorLogger } from './logger';
import { PncpClient } from './pncpClient';
import type { CollectorContext } from './runs';

// Ambiente de uma execução do coletor: configuração (variáveis de ambiente),
// log, conexão própria com o banco e cliente do PNCP. Usado pelo CLI do
// coletor e pela rotina diária (src/services/dailyJobs.ts).

export interface CollectorRuntime {
  context: CollectorContext;
  /** Fecha a conexão com o banco: chamar no fim da execução. */
  close: () => Promise<void>;
}

/** Lê a configuração e prepara o banco do coletor. Configuração inválida: CollectorConfigError. */
export function createCollectorRuntime(env: NodeJS.ProcessEnv): CollectorRuntime {
  const config = loadCollectorConfig(env);
  const logger = createCollectorLogger(config.logLevel);
  const { pool, db } = createCollectorDatabase(config.databaseUrl, logger);
  const pncp = new PncpClient({
    ...config.pncp,
    onRetry: (info) => logger.warn('Nova tentativa no PNCP', { ...info }),
  });

  return {
    context: { db, pool, pncp, config, logger, now: () => new Date() },
    close: () => pool.end(),
  };
}
