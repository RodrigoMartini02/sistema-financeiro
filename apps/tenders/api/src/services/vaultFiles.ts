import { randomUUID } from 'node:crypto';
import type { ObjectStorage } from '../objectStorage';
import { RequestInputError } from '../utils/requestInput';
import { DOCUMENT_LINK_TTL_SECONDS, contentDispositionFor, type DocumentUpload } from './documentUpload';

// Os arquivos do cofre no R2 (item 5), tudo num lugar só: o desenho da chave, o envio, a limpeza e o link de abertura. O
// arquivo mora no R2 (AGENT.md: arquivo duradouro não vai para coluna do banco); a linha em `documento` guarda só a chave, e
// a chave nunca sai na API: o app abre o arquivo por um link assinado de vida curta, direto do R2.

/** Pasta dos documentos no R2 do ambiente: documentos/<conta>/<uuid>.<extensão>. */
export const DOCUMENT_STORAGE_PREFIX = 'documentos';

const FILES_UNAVAILABLE_MESSAGE = 'O envio e a abertura de documentos não estão disponíveis agora. Tente de novo mais tarde.';

/** O R2 dos arquivos; sem ele configurado, 503: o resto do cofre (listas, dados) segue funcionando. */
export function requireDocumentStorage(storage: ObjectStorage | null): ObjectStorage {
  if (!storage) {
    throw new RequestInputError(FILES_UNAVAILABLE_MESSAGE, 503);
  }
  return storage;
}

/** Grava o arquivo no R2 e devolve a chave. O objeto abre na própria aba e, ao salvar, propõe o nome original. */
export async function storeDocumentFile(storage: ObjectStorage, accountId: number, upload: DocumentUpload): Promise<string> {
  const key = `${DOCUMENT_STORAGE_PREFIX}/${accountId}/${randomUUID()}.${upload.extension}`;
  await storage.putObject(key, upload.bytes, upload.contentType, {
    contentDisposition: contentDispositionFor(upload.fileName),
    cacheControl: 'private, max-age=3600',
  });
  return key;
}

/**
 * Apaga os objetos sem derrubar a operação: quando a linha já saiu do banco, o que sobrar no R2 é só lixo, e fica registrado
 * (só a chave, que não tem dado pessoal). Sem R2 configurado, registra do mesmo jeito.
 */
export async function removeDocumentFiles(storage: ObjectStorage | null, keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    if (!storage) {
      console.error('Vault file left in storage, storage unavailable:', { key });
      continue;
    }
    try {
      await storage.deleteObject(key);
    } catch (error) {
      console.error('Vault file left in storage:', { key, error });
    }
  }
}

/** O link de abertura do arquivo, de vida curta. Sem o cliente real do R2 (que é quem assina), 503. */
export async function signDocumentFileLink(storage: ObjectStorage, key: string): Promise<{ url: string; expiresInSeconds: number }> {
  if (!storage.signedGetUrl) {
    throw new RequestInputError(FILES_UNAVAILABLE_MESSAGE, 503);
  }
  return { url: await storage.signedGetUrl(key, DOCUMENT_LINK_TTL_SECONDS), expiresInSeconds: DOCUMENT_LINK_TTL_SECONDS };
}
