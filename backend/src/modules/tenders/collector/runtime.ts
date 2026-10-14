import { PNCP_API_BASE_URL } from '../services/pncpDetails';
import { loadCollectorConfig } from './config';
import { createCollectorDatabase } from './database';
import { createCollectorLogger } from './logger';
import { PncpClient } from './pncpClient';
import type { CollectorContext } from './runs';

// Ambiente de uma execução do coletor: configuração (variáveis de ambiente),
// log, conexão própria com o banco e clientes do PNCP. Usado pelo CLI do
// coletor e pela rotina diária (src/services/dailyJobs.ts).

export interface CollectorRuntime {
  context: CollectorContext;
  /** Fecha a conexão com o banco: chamar no fim da execução. */
  close: () => Promise<void>;
}

/** Termos por página na API principal (a lista de um contrato costuma caber numa só). */
const TERMS_PAGE_SIZE = 500;

/** Lê a configuração e prepara o banco do coletor. Configuração inválida: CollectorConfigError. */
export function createCollectorRuntime(env: NodeJS.ProcessEnv): CollectorRuntime {
  const config = loadCollectorConfig(env);
  const logger = createCollectorLogger(config.logLevel);
  const { pool, db } = createCollectorDatabase(config.databaseUrl, logger);
  const onRetry = (info: object) => logger.warn('Nova tentativa no PNCP', { ...info });
  const pncp = new PncpClient({ ...config.pncp, onRetry });
  // Contratos: a mesma API de Consultas e o mesmo ritmo, com páginas maiores.
  const contractsPncp = new PncpClient({ ...config.pncp, pageSize: config.contracts.pageSize, onRetry });
  // Termos: API principal, com ritmo próprio, separado do da consulta.
  const termsPncp = new PncpClient({
    ...config.pncp,
    baseUrl: PNCP_API_BASE_URL,
    pageSize: TERMS_PAGE_SIZE,
    requestIntervalMs: config.contracts.termsIntervalMs,
    onRetry,
  });

  return {
    context: { db, pool, pncp, contractsPncp, termsPncp, config, logger, now: () => new Date() },
    close: () => pool.end(),
  };
}
