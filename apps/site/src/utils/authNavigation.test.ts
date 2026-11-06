import assert from 'node:assert/strict';
import test from 'node:test';
import { destinationAfterAuth, googleOAuthUrl, googleStateForSolution, solutionFromGoogleState } from './authNavigation';

test('Google: o state distingue as soluções e só valores conhecidos abrem o retorno', () => {
  for (const solution of ['finance', 'tenders'] as const) {
    const url = new URL(googleOAuthUrl(solution, 'https://fingerence.com.br/index.html', 'client-id'));
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://fingerence.com.br/index.html');
    assert.equal(url.searchParams.get('state'), googleStateForSolution(solution));
    assert.equal(solutionFromGoogleState(url.searchParams.get('state')), solution);
  }
  assert.equal(solutionFromGoogleState(null), null);
  assert.equal(solutionFromGoogleState('google-oauth'), null);
  assert.equal(solutionFromGoogleState('google-oauth:other'), null);
});

test('destino: Finanças distingue app e assistente, Licitações sempre abre seu próprio app', () => {
  assert.equal(destinationAfterAuth('finance', null), '/app.html');
  assert.equal(destinationAfterAuth('finance', 'assistant'), '/assistant.html');
  assert.equal(destinationAfterAuth('finance', 'tenders'), '/app.html');
  assert.equal(destinationAfterAuth('tenders', 'assistant'), '/licitacoes/app');
});
