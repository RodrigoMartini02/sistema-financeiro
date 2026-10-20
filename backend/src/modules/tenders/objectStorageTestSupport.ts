import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ObjectStorage } from './objectStorage';

// R2 simulado para os testes: guarda os objetos na memória, com as chaves
// relativas à pasta do ambiente, como o cliente real. `fails` recusa as chaves
// indicadas, no envio e no download.

export interface MemoryStorage {
  storage: ObjectStorage;
  objects: Map<string, Uint8Array>;
}

export function createMemoryStorage(fails: (key: string) => boolean = () => false): MemoryStorage {
  const objects = new Map<string, Uint8Array>();
  const refuse = (key: string) => {
    if (fails(key)) {
      throw new Error('R2 fora do ar');
    }
  };
  const storage: ObjectStorage = {
    async putObject(key, body) {
      refuse(key);
      objects.set(key, body);
    },
    async getObject(key) {
      refuse(key);
      return objects.get(key) ?? null;
    },
    async downloadToFile(key, filePath) {
      refuse(key);
      const body = objects.get(key);
      if (!body) {
        throw new Error(`objeto inexistente: ${key}`);
      }
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
    },
    async listKeys(prefix) {
      return [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
    async deleteObject(key) {
      objects.delete(key);
    },
    close: () => {},
  };
  return { storage, objects };
}
