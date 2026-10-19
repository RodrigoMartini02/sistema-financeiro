import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { StorageSettings } from './collector/config';

// Cloudflare R2 do módulo de Licitações: o arquivo bruto das coletas (plano
// .plans/licitacoes-base-nacional.md, parte 1) e o armazém de contratos (plano
// .plans/licitacoes-contratos-no-r2.md). Cada ambiente grava numa pasta própria
// do bucket (TENDERS_STORAGE_PREFIX): as chaves que o resto do código usa são
// relativas a ela, e o cliente acrescenta a pasta.

/** O R2 visto pelo módulo: chaves relativas à pasta do ambiente. */
export interface ObjectStorage {
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** O objeto inteiro (para os pequenos, como o manifesto); null quando não existe. */
  getObject(key: string): Promise<Uint8Array | null>;
  /** Baixa o objeto para um arquivo local, sem passar tudo pela memória. */
  downloadToFile(key: string, filePath: string): Promise<void>;
  /** Todas as chaves que começam com `prefix`. */
  listKeys(prefix: string): Promise<string[]>;
  deleteObject(key: string): Promise<void>;
  /** Fecha as conexões, no fim do uso. */
  close(): void;
}

const R2_CONNECTION_TIMEOUT_MS = 10_000;
const R2_REQUEST_TIMEOUT_MS = 120_000;

/** Grava num arquivo temporário e renomeia no fim: arquivo pela metade nunca fica com o nome final. */
async function writeStreamToFile(body: Readable, filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const partialPath = `${filePath}.parcial`;
  try {
    await pipeline(body, createWriteStream(partialPath));
    await rename(partialPath, filePath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}

function isMissingObject(error: unknown): boolean {
  return error instanceof NoSuchKey || (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404);
}

/** Cliente S3 do Cloudflare R2: região "auto", com o endpoint, as chaves e a pasta da configuração. */
export function createR2Storage(settings: StorageSettings): ObjectStorage {
  const client = new S3Client({
    region: 'auto',
    endpoint: settings.endpoint,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    // Caminho /<bucket>/<chave>: o formato do endereço S3 que o painel do R2 mostra.
    forcePathStyle: true,
    // Checksum só quando a operação exige, como no SDK antes da 3.729: o padrão
    // novo manda checksums em todo envio, e nem todo serviço S3 compatível os aceita.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      connectionTimeout: R2_CONNECTION_TIMEOUT_MS,
      requestTimeout: R2_REQUEST_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
  });
  const bucket = settings.bucket;
  const fullKey = (key: string) => `${settings.prefix}/${key}`;
  const folder = `${settings.prefix}/`;

  return {
    async putObject(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: fullKey(key), Body: body, ContentType: contentType }));
    },
    async getObject(key) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
        return response.Body ? await response.Body.transformToByteArray() : new Uint8Array();
      } catch (error) {
        if (isMissingObject(error)) {
          return null;
        }
        throw error;
      }
    },
    async downloadToFile(key, filePath) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
      if (!(response.Body instanceof Readable)) {
        throw new Error(`Resposta do R2 sem corpo para ${key}`);
      }
      await writeStreamToFile(response.Body, filePath);
    },
    async listKeys(prefix) {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: fullKey(prefix), ContinuationToken: continuationToken }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key?.startsWith(folder)) {
            keys.push(object.Key.slice(folder.length));
          }
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return keys;
    },
    // Um por vez: o DeleteObjects exige checksum do corpo, que o R2 nem sempre aceita
    // do jeito que o SDK novo manda. As limpezas apagam poucas dezenas de arquivos.
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
    },
    close: () => client.destroy(),
  };
}
