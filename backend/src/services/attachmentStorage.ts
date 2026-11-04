// O R2 dos anexos: o mesmo bucket e as mesmas variáveis do armazém de contratos das Licitações
// (TENDERS_ARCHIVE_* e TENDERS_STORAGE_PREFIX), na subpasta `anexos/` da pasta do ambiente. As
// varreduras das Licitações só mexem nas pastas delas, então `anexos/` nunca é tocada por elas.
import { CollectorConfigError, loadStorageSettings } from '../modules/tenders/collector/config';
import { createR2Storage, type ObjectStorage } from '../modules/tenders/objectStorage';
import { RequestInputError } from '../utils/requestInput';
import { buildContentDisposition, type PreparedAttachment } from './attachmentFile';
import { ATTACHMENT_LINK_TTL_SECONDS } from './attachmentRules';

export const ATTACHMENT_STORAGE_UNAVAILABLE_MESSAGE = 'Não foi possível guardar ou abrir arquivos agora. Tente de novo em instantes.';

// O arquivo é privado: quem abre usa um link assinado, de uso imediato, e nada fica em cache.
const PRIVATE_CACHE_CONTROL = 'private, no-store';

/** Chave do arquivo no R2, relativa à pasta do ambiente. */
export function attachmentStorageKey(attachmentId: string): string {
  return `anexos/${attachmentId}`;
}

/**
 * O R2 dos anexos a partir das variáveis de ambiente. Sem as variáveis do R2 (ou com elas incompletas),
 * só os anexos ficam indisponíveis (503): o resto do sistema segue.
 */
export function createAttachmentStorage(env: NodeJS.ProcessEnv): ObjectStorage {
  try {
    const settings = loadStorageSettings(env, env['DATABASE_URL'] ?? '');
    if (!settings) {
      console.error('Attachment storage is off: TENDERS_ARCHIVE_* and TENDERS_STORAGE_PREFIX are not set');
      throw new RequestInputError(ATTACHMENT_STORAGE_UNAVAILABLE_MESSAGE, 503);
    }
    return createR2Storage(settings);
  } catch (error) {
    if (error instanceof CollectorConfigError) {
      console.error('Attachment storage configuration rejected:', error.message);
      throw new RequestInputError(ATTACHMENT_STORAGE_UNAVAILABLE_MESSAGE, 503);
    }
    throw error;
  }
}

let sharedStorage: ObjectStorage | null = null;

/** O R2 dos anexos do servidor: criado na primeira vez que alguém precisa dele e reaproveitado depois. */
export function getAttachmentStorage(): ObjectStorage {
  sharedStorage ??= createAttachmentStorage(process.env);
  return sharedStorage;
}

/** Só para testes: troca o R2 dos anexos (por exemplo, pelo simulado na memória); `null` volta ao real. */
export function overrideAttachmentStorageForTests(storage: ObjectStorage | null): void {
  sharedStorage = storage;
}

/** Grava o arquivo no R2, com o tipo e o cabeçalho de download que o link assinado vai devolver. Devolve a chave. */
export async function putAttachmentObject(
  storage: ObjectStorage,
  attachmentId: string,
  file: Pick<PreparedAttachment, 'content' | 'contentType' | 'originalName' | 'inline'>,
): Promise<string> {
  const key = attachmentStorageKey(attachmentId);
  await storage.putObject(key, file.content, file.contentType, {
    contentDisposition: buildContentDisposition(file.originalName, file.inline),
    cacheControl: PRIVATE_CACHE_CONTROL,
  });
  return key;
}

/**
 * Apaga os arquivos do R2 depois de o banco já ter deixado de apontar para eles. Uma falha não
 * desfaz o que o usuário pediu: fica no log e o arquivo sobra no R2 até a conferência de órfãos.
 * Devolve quantos não puderam ser apagados.
 */
export async function removeStoredObjects(storage: ObjectStorage, keys: readonly string[]): Promise<number> {
  let failed = 0;
  for (const key of keys) {
    try {
      await storage.deleteObject(key);
    } catch (error) {
      failed += 1;
      console.error('Remove attachment object error:', { key, error });
    }
  }
  return failed;
}

/**
 * Apaga do R2 os arquivos de anexos que o banco já deixou de apontar porque o dono foi excluído. Sem chaves,
 * nem abre o R2. Sem R2 configurado, registra e segue: a exclusão do dono já foi confirmada e não falha por isso.
 */
export async function removeAttachmentObjects(
  keys: readonly string[],
  getStorage: () => ObjectStorage = getAttachmentStorage,
): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  let storage: ObjectStorage;
  try {
    storage = getStorage();
  } catch (error) {
    console.error('Attachment files left in storage, storage unavailable:', { keys, error });
    return;
  }
  await removeStoredObjects(storage, keys);
}

export interface AttachmentLink {
  url: string;
  expiresAt: string;
}

/** Link de leitura do arquivo, de vida curta: o navegador baixa direto do R2, sem passar pelo servidor. */
export async function createAttachmentLink(storage: ObjectStorage, storageKey: string, now = new Date()): Promise<AttachmentLink> {
  if (!storage.signedGetUrl) {
    throw new Error('This object storage cannot sign read links');
  }
  const url = await storage.signedGetUrl(storageKey, ATTACHMENT_LINK_TTL_SECONDS);
  return { url, expiresAt: new Date(now.getTime() + ATTACHMENT_LINK_TTL_SECONDS * 1000).toISOString() };
}
