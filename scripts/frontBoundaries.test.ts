import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Fronteira entre os projetos do front (plano .plans/separar-etapa-2-pastas-e-front.md).
// Varre os imports escritos como texto em cada projeto (código e testes) e confere:
//   - packages/ui não importa de nenhum app, e Licitações só importa de si e de packages/ui;
//   - site e Finanças só se importam nas ligações conhecidas (a lista só encolhe: uma ligação nova falha, e uma
//     ligação da lista que deixou de existir também falha, é a hora de tirá-la);
//   - todo import resolve para um arquivo com a caixa exata do nome (a Render é Linux, o Windows não percebe);
//   - cada projeto declara no package.json os pacotes npm que importa, e só eles.
// Imports montados por código não são vistos.

const ROOT_DIRECTORY = path.resolve(__dirname, '..');
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist']);
const SOURCE_FILE = /\.(ts|tsx)$/;

type ProjectName = 'ui' | 'site' | 'finance' | 'tenders';

interface Project {
  name: ProjectName;
  /** Pasta do código, a partir da raiz do repositório. */
  directory: string;
  /** Apelido de importação deste projeto (o `tenders` não tem: ninguém importa de Licitações). */
  alias: string | null;
  packageJson: string;
}

const PROJECTS: readonly Project[] = [
  { name: 'ui', directory: 'packages/ui/src', alias: '@ui', packageJson: 'packages/ui/package.json' },
  { name: 'site', directory: 'apps/site/src', alias: '@site', packageJson: 'apps/site/package.json' },
  { name: 'finance', directory: 'apps/finance/web/src', alias: '@finance', packageJson: 'apps/finance/web/package.json' },
  { name: 'tenders', directory: 'apps/tenders/web/src', alias: null, packageJson: 'apps/tenders/web/package.json' },
];

/**
 * Ligações entre o site e Finanças que ainda existem (código e testes): a loja pública montada na página inicial do
 * site, o login do site embutido em Finanças, as avaliações e a contagem de acessos. O login por produto já usa
 * serviços e sessões próprios; as ligações restantes são tratadas nas próximas etapas.
 */
const SITE_FINANCE_ALLOWED: readonly string[] = [
  'apps/finance/web/src/components/auth/AuthenticatedAppGate.tsx -> apps/site/src/screens/public/LoginPage.tsx',
  'apps/site/src/SiteApp.tsx -> apps/finance/web/src/screens/public/storefront/StorefrontCartPage.tsx',
  'apps/site/src/SiteApp.tsx -> apps/finance/web/src/screens/public/storefront/StorefrontCheckoutPage.tsx',
  'apps/site/src/SiteApp.tsx -> apps/finance/web/src/screens/public/storefront/StorefrontOrderPage.tsx',
  'apps/site/src/SiteApp.tsx -> apps/finance/web/src/screens/public/storefront/StorefrontPage.tsx',
  'apps/site/src/SiteApp.tsx -> apps/finance/web/src/services/analyticsService.ts',
  'apps/site/src/screens/public/components/ReviewsSection.tsx -> apps/finance/web/src/services/queryKeys.ts',
  'apps/site/src/services/reviewsService.ts -> apps/finance/web/src/services/apiClient.ts',
];

/**
 * Pacotes que o código importa sem declarar no package.json: o `workbox-*` do service worker vem do
 * vite-plugin-pwa (declarar seria uma dependência nova).
 */
const UNDECLARED_PACKAGES_ALLOWED = /^workbox-/;

const IMPORT_PATTERNS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
];

/** Nome de pacote npm (com escopo ou sem, com subcaminho): descarta o que não parece endereço, como texto de string. */
const PACKAGE_SPECIFIER = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w./@-]*)?$/i;

interface ImportEdge {
  from: string;
  to: string;
  fromProject: ProjectName;
  toProject: ProjectName;
}

interface ScanResult {
  filesByProject: Record<ProjectName, number>;
  edges: ImportEdge[];
  unresolved: string[];
  wrongCase: string[];
  packagesByProject: Record<ProjectName, Set<string>>;
}

const toRepositoryPath = (file: string): string => path.relative(ROOT_DIRECTORY, file).split(path.sep).join('/');

function listSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return IGNORED_DIRECTORIES.has(entry.name) ? [] : listSourceFiles(fullPath);
    }
    return SOURCE_FILE.test(entry.name) ? [fullPath] : [];
  });
}

/** Tira comentários para um `from '...'` escrito num comentário não contar. Endereços (`https://`) ficam. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function resolveToFile(base: string): string | null {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, `${base}.css`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** Projeto dono do arquivo, pela pasta. */
function projectOfFile(file: string): Project | undefined {
  return PROJECTS.find((project) => {
    const directory = path.join(ROOT_DIRECTORY, project.directory) + path.sep;
    return file.toLowerCase().startsWith(directory.toLowerCase());
  });
}

function hasExactCase(file: string): boolean {
  return toRepositoryPath(realpathSync.native(file)) === toRepositoryPath(file);
}

function packageNameOf(specifier: string): string {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : (specifier.split('/')[0] ?? specifier);
}

function scanProjects(): ScanResult {
  const result: ScanResult = {
    filesByProject: { ui: 0, site: 0, finance: 0, tenders: 0 },
    edges: [],
    unresolved: [],
    wrongCase: [],
    packagesByProject: { ui: new Set(), site: new Set(), finance: new Set(), tenders: new Set() },
  };
  const edges = new Map<string, ImportEdge>();

  for (const project of PROJECTS) {
    for (const file of listSourceFiles(path.join(ROOT_DIRECTORY, project.directory))) {
      result.filesByProject[project.name]++;
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const pattern of IMPORT_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          const specifier = match[1] ?? '';
          const label = `${toRepositoryPath(file)}: ${specifier}`;

          let base: string | null = null;
          if (specifier.startsWith('.')) {
            base = path.resolve(path.dirname(file), specifier);
          } else {
            const aliasOwner = PROJECTS.find((candidate) => candidate.alias !== null && specifier.startsWith(`${candidate.alias}/`));
            if (aliasOwner) {
              base = path.join(ROOT_DIRECTORY, aliasOwner.directory, specifier.slice(aliasOwner.alias!.length + 1));
            } else if (specifier.startsWith('@') && /^@(ui|site|finance|tenders)\//.test(specifier)) {
              result.unresolved.push(`${label} (apelido sem projeto)`);
              continue;
            }
          }

          if (base === null) {
            if (!specifier.startsWith('node:') && PACKAGE_SPECIFIER.test(specifier)) {
              result.packagesByProject[project.name].add(packageNameOf(specifier));
            }
            continue;
          }

          const target = resolveToFile(base);
          if (!target) {
            result.unresolved.push(label);
            continue;
          }
          if (!hasExactCase(target)) {
            result.wrongCase.push(`${label} (arquivo real: ${toRepositoryPath(realpathSync.native(target))})`);
          }
          const targetProject = projectOfFile(target);
          if (targetProject && targetProject.name !== project.name) {
            const edge: ImportEdge = {
              from: toRepositoryPath(file),
              to: toRepositoryPath(target),
              fromProject: project.name,
              toProject: targetProject.name,
            };
            edges.set(`${edge.from} -> ${edge.to}`, edge);
          }
        }
      }
    }
  }
  result.edges = [...edges.values()];
  return result;
}

const scan = scanProjects();
const describeEdge = (edge: ImportEdge): string => `${edge.from} -> ${edge.to}`;

const SESSION_KEY = /^(?:token|usuarioAtual|dadosUsuarioLogado|contaAtiva(?:Id|Nome|Tipo)|auth_origin|(?:finance|tenders)\.)/;

/** Also checks named constants, so moving a key into a constant cannot bypass the session boundary. */
function rawSessionAccesses(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const constants = new Map<string, ts.Expression>();
  const found: string[] = [];
  const collectConstants = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constants.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectConstants);
  };
  collectConstants(source);

  const keyOf = (node: ts.Expression, seen = new Set<string>()): string | null => {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isTemplateExpression(node)) return node.head.text;
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      seen.add(node.text);
      const initializer = constants.get(node.text);
      return initializer ? keyOf(initializer, seen) : null;
    }
    return null;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && /^(getItem|setItem|removeItem)$/.test(node.expression.name.text)
      && /(?:localStorage|sessionStorage)/.test(node.expression.expression.getText(source))) {
      const argument = node.arguments[0];
      const key = argument ? keyOf(argument) : null;
      if (key && SESSION_KEY.test(key)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        found.push(`${toRepositoryPath(file)}:${line}: ${key}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test('sessão: chaves de identidade só são acessadas pelo módulo compartilhado de sessão', () => {
  const forbidden = PROJECTS.flatMap((project) => listSourceFiles(path.join(ROOT_DIRECTORY, project.directory)))
    .filter((file) => !file.endsWith('.test.ts') && toRepositoryPath(file) !== 'packages/ui/src/auth/session.ts')
    .flatMap(rawSessionAccesses);
  assert.deepEqual(forbidden, [], 'use o serviço de sessão do produto para ler e gravar identidade e conta ativa');
});

test('fronteira: a varredura enxerga arquivos de todos os projetos', () => {
  for (const project of PROJECTS) {
    assert.ok(scan.filesByProject[project.name] > 0, `nenhum arquivo em ${project.directory}`);
  }
});

test('fronteira: packages/ui não importa de nenhum app, e Licitações só importa de si e de packages/ui', () => {
  const forbidden = scan.edges
    .filter((edge) => edge.fromProject === 'ui' || edge.fromProject === 'tenders' || edge.toProject === 'tenders')
    .filter((edge) => !(edge.fromProject === 'tenders' && edge.toProject === 'ui'))
    .map(describeEdge)
    .sort();

  assert.deepEqual(forbidden, [], 'ligação proibida: o pacote comum não depende de app, e ninguém importa de Licitações');
});

test('fronteira: site e Finanças só se importam nas ligações conhecidas, e a lista não guarda ligação que já saiu', () => {
  const found = scan.edges
    .filter((edge) => edge.fromProject !== 'ui' && edge.toProject !== 'ui')
    .filter((edge) => edge.fromProject !== 'tenders' && edge.toProject !== 'tenders')
    .map(describeEdge)
    .sort();
  const allowed = [...SITE_FINANCE_ALLOWED].sort();

  assert.deepEqual(
    found.filter((edge) => !allowed.includes(edge)),
    [],
    'site e Finanças passaram a se importar: tire a ligação ou, se for de uma etapa futura do plano, registre-a na lista',
  );
  assert.deepEqual(
    allowed.filter((edge) => !found.includes(edge)),
    [],
    'a ligação saiu do código: tire-a da lista SITE_FINANCE_ALLOWED',
  );
});

test('imports: todo import relativo ou por apelido resolve para um arquivo com a caixa exata do nome', () => {
  assert.deepEqual(scan.unresolved, [], 'import que não leva a nenhum arquivo');
  assert.deepEqual(scan.wrongCase, [], 'import com maiúsculas ou minúsculas diferentes do nome do arquivo (quebra na Render)');
});

test('dependências: cada projeto declara no package.json os pacotes npm que importa, e só eles', () => {
  for (const project of PROJECTS) {
    const manifest = JSON.parse(readFileSync(path.join(ROOT_DIRECTORY, project.packageJson), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);
    const used = [...scan.packagesByProject[project.name]].filter((name) => !UNDECLARED_PACKAGES_ALLOWED.test(name)).sort();

    assert.deepEqual(
      used.filter((name) => !declared.has(name)),
      [],
      `${project.packageJson}: pacote importado e não declarado`,
    );
    assert.deepEqual(
      [...declared].filter((name) => !used.includes(name)).sort(),
      [],
      `${project.packageJson}: pacote declarado e não importado`,
    );
  }
});
