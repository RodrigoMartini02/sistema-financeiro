import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorageSettings } from './objectStorageSettings';

// Cloudflare R2 dos anexos de Finanças. Cada ambiente grava numa pasta própria do bucket (TENDERS_STORAGE_PREFIX): as
// chaves que o resto do código usa são relativas a ela, e o cliente acrescenta a pasta. O cliente é próprio de
// Finanças e tem só o que Finanças usa (plano .plans/separar-financas-e-licitacoes.md, etapa 1).

/** Cabeçalhos que o R2 guarda com o objeto e devolve em toda leitura dele, inclusive pelo link assinado. */
export interface PutObjectOptions {
  contentDisposition?: string;
  cacheControl?: string;
}

/** O R2 visto pelo código de Finanças: chaves relativas à pasta do ambiente. */
export interface ObjectStorage {
  putObject(key: string, body: Uint8Array, contentType: string, options?: PutObjectOptions): Promise<void>;
  /** O objeto inteiro; null quando não existe. */
  getObject(key: string): Promise<Uint8Array | null>;
  /** Todas as chaves que começam com `prefix`. */
  listKeys(prefix: string): Promise<string[]>;
  deleteObject(key: string): Promise<void>;
  /**
   * Link de leitura do objeto, válido por `expiresInSeconds`: quem o tem baixa direto do R2, sem passar
   * pelo servidor. Calculado na hora, sem chamar o R2. Só o cliente real assina; os simulados podem omitir.
   */
  signedGetUrl?(key: string, expiresInSeconds: number): Promise<string>;
  /** Fecha as conexões, no fim do uso. */
  close(): void;
}

const R2_CONNECTION_TIMEOUT_MS = 10_000;
const R2_REQUEST_TIMEOUT_MS = 120_000;

function isMissingObject(error: unknown): boolean {
  return error instanceof NoSuchKey || (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404);
}

/** Cliente S3 do Cloudflare R2: região "auto", com o endpoint, as chaves e a pasta da configuração. */
export function createR2Storage(settings: ObjectStorageSettings): ObjectStorage {
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
    async putObject(key, body, contentType, options) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fullKey(key),
          Body: body,
          ContentType: contentType,
          ...(options?.contentDisposition ? { ContentDisposition: options.contentDisposition } : {}),
          ...(options?.cacheControl ? { CacheControl: options.cacheControl } : {}),
        }),
      );
    },
    async getObject(key) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
        if (!response.Body) {
          return new Uint8Array();
        }
        return await response.Body.transformToByteArray();
      } catch (error) {
        if (isMissingObject(error)) {
          return null;
        }
        throw error;
      }
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
    signedGetUrl: (key, expiresInSeconds) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) }), { expiresIn: expiresInSeconds }),
    close: () => client.destroy(),
  };
}
