import assert from 'node:assert/strict';
import test from 'node:test';
import { FINANCE_LOGIN_ADDRESS, TENDERS_LOGIN_ADDRESS } from './authOrigin';
import { canonicalUrlFor, pageOfSolution, PUBLIC_PAGES, publicPageFor, SITE_URL } from './publicPages';

// Palavras que não entram no texto do site (o PNCP aparece só no conteúdo dos Termos e da Privacidade).
const FORBIDDEN_SITE_WORDS = [
  /m[óo]dulo/i,
  /\bprodutos?\b/i,
  /mesmo login/i,
  /PNCP/,
  /titular/i,
  /conta habilitada/i,
  /cortesia/i,
  /assinatura recorrente/i,
];

test('páginas: título, descrição, texto de reserva e endereço canônico com barra no fim', () => {
  const paths = new Set<string>();
  for (const page of PUBLIC_PAGES) {
    assert.ok(page.title.trim() && page.description.trim(), `${page.path} sem título ou descrição`);
    assert.ok(page.fallback.label.trim() && page.fallback.heading.trim() && page.fallback.body.trim(), `${page.path} sem texto de reserva`);
    assert.ok(page.path.startsWith('/') && page.path.endsWith('/'), `${page.path} fora do padrão`);
    assert.ok(page.file.endsWith('index.html'), `${page.file} fora do padrão`);
    assert.ok(!paths.has(page.path), `${page.path} repetida`);
    paths.add(page.path);
  }
  assert.deepEqual([...paths], [
    '/',
    '/financas/',
    '/licitacoes/',
    '/sobre/',
    '/contato/',
    '/termos/',
    '/privacidade/',
  ]);
});

test('textos das páginas sem as palavras proibidas do site', () => {
  for (const page of PUBLIC_PAGES) {
    const texts = [page.title, page.description, page.fallback.label, page.fallback.heading, page.fallback.body];
    for (const text of texts) {
      for (const word of FORBIDDEN_SITE_WORDS) {
        assert.doesNotMatch(text, word, `${page.path}: "${text}"`);
      }
    }
  }
});

test('endereço: com ou sem barra é a mesma página; /index.html e desconhecido viram a home', () => {
  assert.equal(publicPageFor('/sobre').path, '/sobre/');
  assert.equal(publicPageFor('/financas').path, '/financas/');
  assert.equal(publicPageFor('/').path, '/');
  assert.equal(publicPageFor('/index.html').path, '/');
  assert.equal(publicPageFor('/nao-existe').path, '/');
});

test('solução da página: Finanças e Licitações nas páginas delas; nenhuma nas da empresa', () => {
  assert.equal(publicPageFor('/financas/').solution, 'finance');
  assert.equal(publicPageFor('/licitacoes').solution, 'tenders');
  assert.equal(publicPageFor('/licitacoes/app').solution, null, '/licitacoes/app é o sistema, não a página do site');
  assert.equal(publicPageFor('/').solution, null);
  assert.equal(publicPageFor('/sobre/').solution, null);
  assert.equal(publicPageFor('/contato').solution, null);
  assert.equal(pageOfSolution('finance').path, '/financas/');
  assert.equal(pageOfSolution('tenders').path, '/licitacoes/');
});

test('entrada do FINGERENCE sem sessão: a página de Finanças, que abre o login', () => {
  const address = new URL(FINANCE_LOGIN_ADDRESS, SITE_URL);
  assert.equal(publicPageFor(address.pathname).solution, 'finance');
  assert.equal(address.searchParams.get('entrar'), '1');
});

test('entrada de Licitações sem sessão: a página de Licitações, que abre o login', () => {
  const address = new URL(TENDERS_LOGIN_ADDRESS, SITE_URL);
  assert.equal(publicPageFor(address.pathname).solution, 'tenders');
  assert.equal(address.searchParams.get('entrar'), '1');
});

test('endereço canônico no domínio do site', () => {
  assert.equal(canonicalUrlFor(publicPageFor('/licitacoes')), `${SITE_URL}/licitacoes/`);
  assert.equal(canonicalUrlFor(publicPageFor('/')), `${SITE_URL}/`);
});
