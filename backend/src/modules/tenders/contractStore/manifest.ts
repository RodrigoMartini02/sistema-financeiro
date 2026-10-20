import { z } from 'zod/v4';
import type { ObjectStorage } from '../objectStorage';
import { MANIFEST_KEY, STORE_DATASETS, type StoreDataset } from './layout';

// Manifesto do armazém de contratos: a lista dos arquivos em uso de cada
// conjunto e os totais. A gravação envia os arquivos novos antes e o manifesto
// por último, numa escrita só: quem lê vê a versão anterior inteira ou a nova
// inteira, nunca metade. Manifesto fora do formato é recusado, e quem lê fica
// com a versão que já tinha.

const fileSchema = z.object({
  /** Chave do arquivo no bucket, dentro da pasta do ambiente. */
  path: z.string().min(1),
  rows: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  /** Pasta do arquivo: o ano do contrato, ou a faixa de vencimento nos vigentes. */
  partition: z.string().min(1),
  /** Início da faixa da parte (pela chave da faixa, layout.ts); a primeira parte de cada ano começa em "". */
  from: z.string(),
});

const manifestSchema = z.object({
  format: z.literal(1),
  /** Execução que publicou e o número da publicação nela: muda a cada publicação. */
  revision: z.string().min(1),
  publishedAt: z.iso.datetime(),
  /** Dia (Brasília) a partir do qual os vigentes foram calculados. */
  today: z.iso.date(),
  totals: z.object({
    contracts: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    withoutExpiry: z.number().int().nonnegative(),
  }),
  datasets: z.object({
    vigentes: z.array(fileSchema),
    contratos: z.array(fileSchema),
    fornecedor: z.array(fileSchema),
  }),
});

export type ManifestFile = z.infer<typeof fileSchema>;
export type StoreManifest = z.infer<typeof manifestSchema>;

export class InvalidManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidManifestError';
  }
}

export function parseManifest(body: Uint8Array): StoreManifest {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body).toString('utf8'));
  } catch {
    throw new InvalidManifestError('Manifesto do armazém de contratos ilegível');
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new InvalidManifestError(`Manifesto do armazém de contratos fora do formato: ${problems}`);
  }
  return parsed.data;
}

/** O manifesto em uso; null quando o armazém ainda não tem nenhuma publicação. */
export async function readManifest(storage: ObjectStorage): Promise<StoreManifest | null> {
  const body = await storage.getObject(MANIFEST_KEY);
  return body === null ? null : parseManifest(body);
}

export function serializeManifest(manifest: StoreManifest): Uint8Array {
  return Buffer.from(`${JSON.stringify(manifest, null, 1)}\n`, 'utf8');
}

/** Todos os arquivos do manifesto, de todos os conjuntos. */
export function manifestFiles(manifest: StoreManifest | null): ManifestFile[] {
  if (!manifest) {
    return [];
  }
  return STORE_DATASETS.flatMap((dataset) => manifest.datasets[dataset]);
}

export function datasetFiles(manifest: StoreManifest | null, dataset: StoreDataset): ManifestFile[] {
  return manifest?.datasets[dataset] ?? [];
}
