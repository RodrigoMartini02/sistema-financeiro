import assert from 'node:assert/strict';
import test from 'node:test';
import { FINANCE_LOGIN_ADDRESS, TENDERS_LOGIN_ADDRESS } from './authOrigin';
import { canonicalUrlFor, isProductsArea, pageOfSolution, PUBLIC_PAGES, publicPageFor, SITE_URL } from './publicPages';

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
    '/produtos/',
    '/produtos/financas/',
    '/produtos/licitacoes/',
    '/sobre/',
    '/contato/',
    '/termos/',
    '/privacidade/',
  ]);
});

test('endereço: com ou sem barra é a mesma página; /index.html e desconhecido viram a home', () => {
  assert.equal(publicPageFor('/produtos').path, '/produtos/');
  assert.equal(publicPageFor('/produtos/financas').path, '/produtos/financas/');
  assert.equal(publicPageFor('/').path, '/');
  assert.equal(publicPageFor('/index.html').path, '/');
  assert.equal(publicPageFor('/nao-existe').path, '/');
  assert.equal(publicPageFor('/planos/').path, '/', 'a página de planos saiu: os planos ficam em cada solução');
  assert.equal(publicPageFor('/licitacoes').path, '/', '/licitacoes é do sistema, não do site');
});

test('solução da página: Finanças e Licitações nas páginas delas; nenhuma nas da empresa', () => {
  assert.equal(publicPageFor('/produtos/financas/').solution, 'finance');
  assert.equal(publicPageFor('/produtos/licitacoes').solution, 'tenders');
  assert.equal(publicPageFor('/').solution, null);
  assert.equal(publicPageFor('/produtos/').solution, null);
  assert.equal(publicPageFor('/contato').solution, null);
  assert.equal(pageOfSolution('finance').path, '/produtos/financas/');
  assert.equal(pageOfSolution('tenders').path, '/produtos/licitacoes/');
});

test('área de Produtos: a lista e as páginas das soluções', () => {
  assert.equal(isProductsArea('/produtos'), true);
  assert.equal(isProductsArea('/produtos/licitacoes/'), true);
  assert.equal(isProductsArea('/'), false);
  assert.equal(isProductsArea('/sobre/'), false);
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
  assert.equal(canonicalUrlFor(publicPageFor('/produtos/licitacoes')), `${SITE_URL}/produtos/licitacoes/`);
  assert.equal(canonicalUrlFor(publicPageFor('/')), `${SITE_URL}/`);
});
