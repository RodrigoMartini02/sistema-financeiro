import { access, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ObjectStorage } from '../objectStorage';
import { FILES_FOLDER, STORE_DATASETS, type StoreDataset } from './layout';
import { manifestFiles, type StoreManifest } from './manifest';

// Cópia local do armazém de contratos: os arquivos do manifesto numa pasta do
// disco, com o mesmo caminho que têm no bucket. O Cron Job (cópia de trabalho)
// e o Web Service (cópia de leitura) usam a mesma regra. Arquivo que já está na
// pasta não é baixado de novo: o nome tem a versão, e o conteúdo nunca muda.

/** Caminho local de um arquivo do bucket. */
export function localPath(directory: string, key: string): string {
  return join(directory, ...key.split('/'));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Baixa os arquivos do manifesto que ainda não estão na pasta; devolve quantos baixou. Só os dos conjuntos
 * indicados (sem a lista, todos): o Web Service e o escritor de contratos não baixam os vencedores.
 */
export async function downloadManifestFiles(
  storage: ObjectStorage,
  manifest: StoreManifest | null,
  directory: string,
  datasets: readonly StoreDataset[] = STORE_DATASETS,
): Promise<number> {
  let downloaded = 0;
  for (const file of manifestFiles(manifest, datasets)) {
    const path = localPath(directory, file.path);
    if (await exists(path)) {
      continue;
    }
    await storage.downloadToFile(file.path, path);
    downloaded += 1;
  }
  return downloaded;
}

async function listLocalFiles(directory: string): Promise<string[]> {
  const root = localPath(directory, FILES_FOLDER);
  if (!(await exists(root))) {
    return [];
  }
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

/** Apaga da pasta os arquivos que nenhum dos manifestos usa; devolve quantos apagou. */
export async function removeUnusedLocalFiles(directory: string, keep: ReadonlyArray<StoreManifest | null>): Promise<number> {
  const used = new Set(keep.flatMap((manifest) => manifestFiles(manifest).map((file) => localPath(directory, file.path))));
  let removed = 0;
  for (const path of await listLocalFiles(directory)) {
    if (!used.has(path)) {
      await rm(path, { force: true });
      removed += 1;
    }
  }
  return removed;
}
