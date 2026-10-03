import assert from 'node:assert/strict';
import test from 'node:test';
import { isOwnLogin, pickLoginByDocument, type LoginCandidate } from './loginDocument';

function candidate(id: number, type: LoginCandidate['type'], status: LoginCandidate['status'] = 'ativo'): LoginCandidate {
  return { id, type, status };
}

test('acesso próprio: titular, admin e tipo nulo; membro não', () => {
  assert.equal(isOwnLogin(candidate(1, 'titular')), true);
  assert.equal(isOwnLogin(candidate(1, 'admin')), true);
  assert.equal(isOwnLogin(candidate(1, null)), true);
  assert.equal(isOwnLogin(candidate(1, 'membro')), false);
});

test('o acesso próprio vence os de colaborador, em qualquer ordem', () => {
  const own = candidate(9, 'titular');
  assert.deepEqual(pickLoginByDocument([candidate(3, 'membro'), own, candidate(5, 'membro')]), { kind: 'found', user: own });
  const admin = candidate(1, 'admin');
  assert.deepEqual(pickLoginByDocument([candidate(2, 'membro'), admin]), { kind: 'found', user: admin });
});

test('o acesso próprio bloqueado continua sendo o escolhido (o aviso aparece depois da senha)', () => {
  const blocked = candidate(4, 'titular', 'bloqueado');
  assert.deepEqual(pickLoginByDocument([candidate(2, 'membro'), blocked]), { kind: 'found', user: blocked });
});

test('sem acesso próprio: o único colaborador entra, mesmo inativo', () => {
  const only = candidate(7, 'membro', 'inativo');
  assert.deepEqual(pickLoginByDocument([only]), { kind: 'found', user: only });
});

test('vários colaboradores: entra o único ativo; dois ativos é ambíguo', () => {
  const active = candidate(8, 'membro', 'ativo');
  assert.deepEqual(pickLoginByDocument([candidate(3, 'membro', 'inativo'), active]), { kind: 'found', user: active });
  assert.deepEqual(pickLoginByDocument([candidate(3, 'membro'), candidate(8, 'membro')]), { kind: 'ambiguous' });
  assert.deepEqual(pickLoginByDocument([candidate(3, 'membro', 'inativo'), candidate(8, 'membro', 'inativo')]), { kind: 'ambiguous' });
});

test('nenhum acesso com o documento', () => {
  assert.deepEqual(pickLoginByDocument([]), { kind: 'none' });
});
