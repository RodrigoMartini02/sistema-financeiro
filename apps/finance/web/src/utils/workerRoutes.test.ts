import assert from 'node:assert/strict';
import test from 'node:test';
import { isTendersAppPath } from './workerRoutes';

test('service worker financeiro exclui entrada, rotas profundas e assets de Licitações', () => {
  for (const address of [
    '/licitacoes/app',
    '/licitacoes/app/',
    '/licitacoes/app/buscar?termo=limpeza',
    '/licitacoes/app/assets/tenders-a1.js',
    '/licitacoes/app/icons/favicon.svg',
  ]) {
    assert.equal(isTendersAppPath(new URL(address, 'https://fingerence.com.br').pathname), true, address);
  }
});

test('service worker preserva assistente, páginas públicas e limites de caminho', () => {
  for (const pathname of ['/assistant.html', '/app.html', '/assets/assistant-a1.js', '/icons/pwa-192.png', '/licitacoes/', '/licitacoes/app-preview']) {
    assert.equal(isTendersAppPath(pathname), false, pathname);
  }
});
