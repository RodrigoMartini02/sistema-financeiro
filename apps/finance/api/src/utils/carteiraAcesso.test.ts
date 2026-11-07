import assert from 'node:assert/strict';
import test from 'node:test';
import { podeAcessarCarteiraDeOutros } from './carteiraAcesso';

test('dono da conta sempre acessa a carteira de outros', () => {
  assert.equal(podeAcessarCarteiraDeOutros({ ehDono: true, vinculoAtivo: false, permissaoLiberada: false }), true);
});

test('quem nao e dono e nao tem vinculo ativo nunca acessa, mesmo com permissao', () => {
  assert.equal(podeAcessarCarteiraDeOutros({ ehDono: false, vinculoAtivo: false, permissaoLiberada: true }), false);
});

test('membro ou colaborador com vinculo ativo sem permissao nao acessa', () => {
  assert.equal(podeAcessarCarteiraDeOutros({ ehDono: false, vinculoAtivo: true, permissaoLiberada: false }), false);
});

test('membro ou colaborador com vinculo ativo e permissao acessa', () => {
  assert.equal(podeAcessarCarteiraDeOutros({ ehDono: false, vinculoAtivo: true, permissaoLiberada: true }), true);
});
