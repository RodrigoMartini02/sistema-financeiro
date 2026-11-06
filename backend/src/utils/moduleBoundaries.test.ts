import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Fronteira entre Finanças e Licitações no backend (planos .plans/separar-etapa-1-fronteiras-backend.md e
// .plans/separar-etapa-3-identidade-e-banco.md). Varre os imports escritos como texto em src/ e scripts/.
// Licitações não importa nada de Finanças. Finanças importa de Licitações só nas ligações da lista abaixo, que só
// encolhe: uma ligação nova falha, e uma ligação da lista que deixou de existir também falha (é a hora de tirá-la
// da lista). Imports montados por código não são vistos.

const BACKEND_DIRECTORY = path.resolve(__dirname, '..', '..');
const TENDERS_DIRECTORY = 'src/modules/tenders/';
const SCANNED_DIRECTORIES = ['src', 'scripts'];
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist']);

/**
 * Montagem transitória de Licitações no servidor, até a etapa 4.
 */
const FINANCE_TO_TENDERS_ALLOWED: readonly string[] = [
  'src/server.ts -> src/modules/tenders/collector/logger.ts',
  'src/server.ts -> src/modules/tenders/contractStore/service.ts',
  'src/server.ts -> src/modules/tenders/db/pool.ts',
  'src/server.ts -> src/modules/tenders/routes/index.ts',
];

const IMPORT_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
];

interface ImportEdge {
  from: string;
  to: string;
}

function toRelativePath(file: string): string {
  return path.relative(BACKEND_DIRECTORY, file).split(path.sep).join('/');
}

function listSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return IGNORED_DIRECTORIES.has(entry.name) ? [] : listSourceFiles(fullPath);
    }
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

/** Tira comentários para um `from '...'` escrito num comentário não contar. Endereços (`https://`) ficam. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function resolveImport(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const base = path.resolve(path.dirname(file), specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function collectEdges(): ImportEdge[] {
  const edges = new Map<string, ImportEdge>();
  for (const directory of SCANNED_DIRECTORIES) {
    for (const file of listSourceFiles(path.join(BACKEND_DIRECTORY, directory))) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const pattern of IMPORT_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          const target = resolveImport(file, match[1] ?? '');
          if (target) {
            const edge = { from: toRelativePath(file), to: toRelativePath(target) };
            edges.set(`${edge.from} -> ${edge.to}`, edge);
          }
        }
      }
    }
  }
  return [...edges.values()];
}

const isTendersFile = (file: string) => file.startsWith(TENDERS_DIRECTORY);

function describeEdge(edge: ImportEdge): string {
  return `${edge.from} -> ${edge.to}`;
}

test('fronteira: Finanças só importa de Licitações nas ligações conhecidas, e a lista não guarda ligação que já saiu', () => {
  const found = collectEdges()
    .filter((edge) => !isTendersFile(edge.from) && isTendersFile(edge.to))
    .map(describeEdge)
    .sort();
  const allowed = [...FINANCE_TO_TENDERS_ALLOWED].sort();

  assert.deepEqual(
    found.filter((edge) => !allowed.includes(edge)),
    [],
    'Finanças passou a importar de Licitações: tire a ligação ou, se for de uma etapa futura do plano, registre-a na lista',
  );
  assert.deepEqual(
    allowed.filter((edge) => !found.includes(edge)),
    [],
    'a ligação saiu do código: tire-a da lista FINANCE_TO_TENDERS_ALLOWED',
  );
});

test('fronteira: o módulo de Licitações não importa nada de Finanças, nem no código nem nos testes', () => {
  const found = collectEdges()
    .filter((edge) => isTendersFile(edge.from) && !isTendersFile(edge.to))
    .map(describeEdge)
    .sort();

  assert.deepEqual(found, [], 'Licitações passou a importar de Finanças: copie o que precisa para dentro do módulo');
});
