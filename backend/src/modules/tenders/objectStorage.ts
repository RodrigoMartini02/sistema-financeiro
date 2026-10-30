import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
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
  /** Contadores agregados desta instância; os clientes simulados podem omitir. */
  metrics?(): ObjectStorageMetrics;
  /** Fecha as conexões, no fim do uso. */
  close(): void;
}

export interface ObjectStorageMetrics {
  putRequests: number;
  getRequests: number;
  listRequests: number;
  deleteRequests: number;
  failedRequests: number;
  /** Bytes dos corpos enviados, incluindo tentativas repetidas do SDK. */
  uploadAttemptedBytes: number;
  /** Bytes dos objetos cujo envio foi confirmado. */
  uploadedBytes: number;
  /** Bytes efetivamente lidos, inclusive partes de downloads que falharam. */
  downloadedBytes: number;
}

const R2_CONNECTION_TIMEOUT_MS = 10_000;
const R2_REQUEST_TIMEOUT_MS = 120_000;

/** Grava num arquivo temporário e renomeia no fim: arquivo pela metade nunca fica com o nome final. */
async function writeStreamToFile(body: Readable, filePath: string, onBytes: (bytes: number) => void): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const partialPath = `${filePath}.parcial`;
  try {
    const countBytes = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        onBytes(chunk.length);
        callback(null, chunk);
      },
    });
    await pipeline(body, countBytes, createWriteStream(partialPath));
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
  const metrics: ObjectStorageMetrics = {
    putRequests: 0,
    getRequests: 0,
    listRequests: 0,
    deleteRequests: 0,
    failedRequests: 0,
    uploadAttemptedBytes: 0,
    uploadedBytes: 0,
    downloadedBytes: 0,
  };
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
  // Deserialize roda dentro do ciclo de retries: conta cada tentativa HTTP, não só
  // cada chamada de alto nível. Não armazena chaves, headers ou credenciais.
  client.middlewareStack.add(
    (next, context) => async (args) => {
      if (context.commandName === 'PutObjectCommand') {
        metrics.putRequests += 1;
        const input = args.input as { Body?: unknown };
        if (input.Body instanceof Uint8Array) {
          metrics.uploadAttemptedBytes += input.Body.byteLength;
        }
      } else if (context.commandName === 'GetObjectCommand') {
        metrics.getRequests += 1;
      } else if (context.commandName === 'ListObjectsV2Command') {
        metrics.listRequests += 1;
      } else if (context.commandName === 'DeleteObjectCommand') {
        metrics.deleteRequests += 1;
      }
      try {
        return await next(args);
      } catch (error) {
        metrics.failedRequests += 1;
        throw error;
      }
    },
    { step: 'deserialize', name: 'collectorStorageMetrics', priority: 'high' },
  );
  const bucket = settings.bucket;
  const fullKey = (key: string) => `${settings.prefix}/${key}`;
  const folder = `${settings.prefix}/`;

  return {
    async putObject(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: fullKey(key), Body: body, ContentType: contentType }));
      metrics.uploadedBytes += body.byteLength;
    },
    async getObject(key) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
        if (!response.Body) {
          return new Uint8Array();
        }
        if (response.Body instanceof Readable) {
          response.Body.on('data', (chunk: Buffer) => {
            metrics.downloadedBytes += chunk.length;
          });
          return await response.Body.transformToByteArray();
        }
        const body = await response.Body.transformToByteArray();
        metrics.downloadedBytes += body.byteLength;
        return body;
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
      await writeStreamToFile(response.Body, filePath, (bytes) => {
        metrics.downloadedBytes += bytes;
      });
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
    metrics: () => ({ ...metrics }),
    close: () => client.destroy(),
  };
}
