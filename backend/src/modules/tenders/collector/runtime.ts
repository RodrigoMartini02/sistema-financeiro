import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createR2Storage } from '../objectStorage';
import { PNCP_API_BASE_URL } from '../services/pncpDetails';
import { ComprasGovClient } from './comprasGovClient';
import { loadCollectorConfig } from './config';
import { createCollectorDatabase } from './database';
import { createCollectorLogger } from './logger';
import { PncpClient } from './pncpClient';
import type { CollectorContext } from './runs';

// Ambiente de uma execução do coletor: configuração (variáveis de ambiente),
// log, conexão própria com o banco, clientes do PNCP e do Compras.gov.br e o R2 (arquivo bruto e
// armazém de contratos).
// Usado pelo CLI do coletor e pela rotina diária (src/services/dailyJobs.ts).

export interface CollectorRuntime {
  context: CollectorContext;
  /** Fecha as conexões com o banco e com o R2: chamar no fim da execução. */
  close: () => Promise<void>;
}

/** Termos por página na API principal (a lista de um contrato costuma caber numa só). */
const TERMS_PAGE_SIZE = 500;

/**
 * Cópia de trabalho do armazém de contratos, no disco temporário: a coleta e os
 * avisos da mesma rotina usam a mesma pasta, e o que a coleta publicou já está
 * lá quando os avisos começam.
 */
const CONTRACT_WORK_DIRECTORY = join(tmpdir(), 'licitacoes-contratos-coletor');

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
  // Resultados das licitações: outra fonte, com o ritmo próprio da variável COMPRASGOV_REQUEST_INTERVAL_MS.
  const comprasGov = new ComprasGovClient({
    requestIntervalMs: config.comprasGov.requestIntervalMs,
    onRetry: (info) => logger.warn('Nova tentativa na consulta de resultados', { ...info }),
  });
  const storage = config.storage ? createR2Storage(config.storage) : null;
  if (!storage) {
    logger.warn('R2 desligado: as variáveis TENDERS_ARCHIVE_* e TENDERS_STORAGE_PREFIX não estão definidas');
  }

  return {
    context: { db, pool, pncp, contractsPncp, termsPncp, comprasGov, storage, contractWorkDirectory: CONTRACT_WORK_DIRECTORY, config, logger, now: () => new Date() },
    close: async () => {
      storage?.close();
      await pool.end();
    },
  };
}
