import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Each API owns its source and scripts. Relative imports cannot escape its package.
const API_DIRECTORY = path.resolve(__dirname, '..', '..');
const SCANNED_DIRECTORIES = ['src', 'scripts'];
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist']);

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
  return path.relative(API_DIRECTORY, file).split(path.sep).join('/');
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
    return /\.(?:ts|js|mjs|cjs)$/.test(entry.name) ? [fullPath] : [];
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
  const relative = path.relative(API_DIRECTORY, base);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return base;
  for (const candidate of [base, `${base}.ts`, base.replace(/\.js$/, '.ts'), path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function collectEdges(): ImportEdge[] {
  const edges = new Map<string, ImportEdge>();
  for (const directory of SCANNED_DIRECTORIES) {
    for (const file of listSourceFiles(path.join(API_DIRECTORY, directory))) {
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

test('API source and scripts cannot import files outside their own package', () => {
  const outside = collectEdges()
    .filter((edge) => edge.to === '..' || edge.to.startsWith('../') || path.isAbsolute(edge.to))
    .map((edge) => edge.from + ' -> ' + edge.to)
    .sort();
  assert.deepEqual(outside, [], 'Copy the required code into this API; imports from the other product or repository are forbidden');
});
