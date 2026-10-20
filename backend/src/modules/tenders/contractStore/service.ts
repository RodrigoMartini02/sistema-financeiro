import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CollectorConfigError, loadStorageSettings, type StorageSettings } from '../collector/config';
import { errorMessage, type CollectorLogger } from '../collector/logger';
import { createR2Storage } from '../objectStorage';
import { ContractStoreReader, ContractStoreUnavailableError, type ContractStoreAccess, type ContractStoreStatus } from './reader';

// O armazém de contratos no Web Service (plano .plans/licitacoes-contratos-no-r2.md,
// Parte R2): começa junto com o servidor, mas a cópia dos arquivos acontece em
// segundo plano, sem atrasar o /health nem o resto do sistema. Até a cópia ficar
// pronta (cerca de 1 minuto depois de um deploy), as buscas de contratos
// respondem "atualizando" (ContractStoreUnavailableError). Sem as variáveis do
// R2, o armazém fica desligado e responde o mesmo.

/** Pasta da cópia de leitura: o disco temporário da máquina. */
export const WEB_STORE_DIRECTORY = join(tmpdir(), 'licitacoes-contratos');

export interface ContractStoreService extends ContractStoreAccess {
  close(): Promise<void>;
}

const NOT_READY: ContractStoreStatus = { ready: false, revision: null, publishedAt: null, today: null, totals: null };

export function startContractStore(settings: StorageSettings | null, logger: CollectorLogger, directory = WEB_STORE_DIRECTORY): ContractStoreService {
  if (!settings) {
    logger.warn('R2 desligado: as variáveis TENDERS_ARCHIVE_* e TENDERS_STORAGE_PREFIX não estão definidas; os contratos ficam indisponíveis');
    return {
      query: () => Promise.reject(new ContractStoreUnavailableError()),
      status: () => NOT_READY,
      close: async () => {},
    };
  }

  const storage = createR2Storage(settings);
  let reader: ContractStoreReader | null = null;
  let closed = false;
  const starting = ContractStoreReader.create({ storage, directory, logger })
    .then(async (created) => {
      if (closed) {
        await created.close();
        return;
      }
      reader = created;
      created.start();
    })
    .catch((error: unknown) => {
      logger.error('O armazém de contratos não iniciou', { error: errorMessage(error) });
    });

  return {
    query: (run) => (reader ? reader.query(run) : Promise.reject(new ContractStoreUnavailableError())),
    status: () => reader?.status() ?? NOT_READY,
    close: async () => {
      closed = true;
      await starting;
      await reader?.close();
      storage.close();
    },
  };
}

/**
 * O armazém do Web Service a partir das variáveis de ambiente. Configuração do
 * R2 incompleta ou inválida é registrada como erro e deixa só os contratos
 * indisponíveis: o resto do sistema não cai por causa dela.
 */
export function startContractStoreFromEnv(env: NodeJS.ProcessEnv, logger: CollectorLogger): ContractStoreService {
  try {
    return startContractStore(loadStorageSettings(env, env['DATABASE_URL'] ?? ''), logger);
  } catch (error) {
    if (!(error instanceof CollectorConfigError)) {
      throw error;
    }
    logger.error('Configuração do R2 recusada; os contratos ficam indisponíveis', { error: error.message });
    return startContractStore(null, logger);
  }
}
