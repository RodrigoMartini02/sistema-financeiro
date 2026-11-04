import assert from 'node:assert/strict';
import test from 'node:test';
import { TENDERS_LOGIN_ADDRESS } from './loginAddress';

test('entrada de Licitações sem sessão: a página de Licitações com o login aberto, como o site espera', () => {
  // Contrato com o site: `?entrar=1` abre o login da solução. Finanças tem a mesma regra.
  assert.equal(TENDERS_LOGIN_ADDRESS, '/licitacoes/?entrar=1');
});
