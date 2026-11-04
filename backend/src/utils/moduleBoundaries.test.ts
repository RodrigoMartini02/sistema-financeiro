import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Fronteira entre Finanças e Licitações no backend (plano .plans/separar-etapa-1-fronteiras-backend.md).
// Varre os imports escritos como texto em src/ e scripts/ e confere as duas direções contra listas de ligações
// conhecidas. As listas só encolhem: uma ligação nova falha, e uma ligação da lista que deixou de existir também
// falha (é a hora de tirá-la da lista). Imports montados por código não são vistos.

const BACKEND_DIRECTORY = path.resolve(__dirname, '..', '..');
const TENDERS_DIRECTORY = 'src/modules/tenders/';
const SCANNED_DIRECTORIES = ['src', 'scripts'];
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist']);
/** Teste e apoio de teste: a direção Licitações para Finanças só vale para o código de produção. */
const TEST_FILE = /(\.test|TestSupport)\.ts$/;

/**
 * Ligações de Finanças para Licitações (código e testes) que ainda existem: o schema de Licitações dentro do schema
 * de Finanças e o início do período de teste no cadastro (etapa 3) e a montagem das rotas no servidor (etapa 4).
 */
const FINANCE_TO_TENDERS_ALLOWED: readonly string[] = [
  'src/db/schema/index.ts -> src/modules/tenders/db/schema.ts',
  'src/routes/auth.ts -> src/modules/tenders/services/subscription.ts',
  'src/server.ts -> src/modules/tenders/collector/logger.ts',
  'src/server.ts -> src/modules/tenders/contractStore/service.ts',
  'src/server.ts -> src/modules/tenders/routes/index.ts',
];

/**
 * Destinos de Finanças que o código de Licitações ainda importa: as tabelas de usuários, contas e vínculos, a
 * leitura e a validação de entrada, a cobrança do Mercado Pago e o cadastro de membro. As etapas 3 e 4 tiram os deles.
 */
const TENDERS_TO_FINANCE_ALLOWED_TARGETS: readonly string[] = [
  'src/db/schema/accountMembers.ts',
  'src/db/schema/accounts.ts',
  'src/db/schema/users.ts',
  'src/middleware/validation.ts',
  'src/services/accountMemberCreation.ts',
  'src/services/memberInput.ts',
  'src/services/mercadoPagoCharges.ts',
  'src/utils/requestInput.ts',
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

test('fronteira: o código de Licitações só importa de Finanças nos destinos conhecidos, e a lista não guarda destino que já saiu', () => {
  const found = [
    ...new Set(
      collectEdges()
        .filter((edge) => isTendersFile(edge.from) && !isTendersFile(edge.to) && !TEST_FILE.test(edge.from))
        .map((edge) => edge.to),
    ),
  ].sort();
  const allowed = [...TENDERS_TO_FINANCE_ALLOWED_TARGETS].sort();

  assert.deepEqual(
    found.filter((target) => !allowed.includes(target)),
    [],
    'Licitações passou a importar de Finanças: tire a ligação ou, se for de uma etapa futura do plano, registre o destino na lista',
  );
  assert.deepEqual(
    allowed.filter((target) => !found.includes(target)),
    [],
    'o destino deixou de ser importado: tire-o da lista TENDERS_TO_FINANCE_ALLOWED_TARGETS',
  );
});
