import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chaveEscopoPessoas, descreverEscopoPessoas, escopoInicial, gravarEscopoPessoas, lerEscopoPessoas,
} from './escopoPessoasSalvo';

function armazenamentoFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, valor),
    removeItem: (chave: string) => void dados.delete(chave),
  };
}

const quebrado = {
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('bloqueado'); },
  removeItem: () => { throw new Error('bloqueado'); },
};

test('a chave separa usuário e conta', () => {
  assert.equal(chaveEscopoPessoas(7, 17), 'painel:pessoas:v1:7:17');
  assert.equal(chaveEscopoPessoas('7', null), 'painel:pessoas:v1:7:ativa');
  assert.notEqual(chaveEscopoPessoas(7, 17), chaveEscopoPessoas(7, 18));
  assert.notEqual(chaveEscopoPessoas(7, 17), chaveEscopoPessoas(8, 17));
});

test('ler: nada salvo, texto inválido, formato errado e armazenamento bloqueado dão null', () => {
  const chave = 'k';
  assert.equal(lerEscopoPessoas(armazenamentoFalso(), chave), null);
  assert.equal(lerEscopoPessoas(armazenamentoFalso({ k: '{nao e json' }), chave), null);
  assert.equal(lerEscopoPessoas(armazenamentoFalso({ k: '{"a":1}' }), chave), null);
  assert.equal(lerEscopoPessoas(armazenamentoFalso({ k: '[1,2]' }), chave), null);
  assert.equal(lerEscopoPessoas(quebrado, chave), null);
  assert.deepEqual(lerEscopoPessoas(armazenamentoFalso({ k: '["3","7"]' }), chave), ['3', '7']);
});

test('gravar: "só eu" apaga o que havia; outra escolha fica salva, em ordem; bloqueio não lança', () => {
  const armazenamento = armazenamentoFalso({ k: '["3","7"]' });
  gravarEscopoPessoas(armazenamento, 'k', new Set(['7']), '7');
  assert.equal(armazenamento.dados.has('k'), false);
  gravarEscopoPessoas(armazenamento, 'k', new Set(['9', '7']), '7');
  assert.equal(armazenamento.dados.get('k'), '["7","9"]');
  gravarEscopoPessoas(armazenamento, 'k', new Set(), '7');
  assert.equal(armazenamento.dados.has('k'), false);
  assert.doesNotThrow(() => gravarEscopoPessoas(quebrado, 'k', new Set(['7', '9']), '7'));
});

test('abrir o Painel: só vale quem ainda está na lista; sem nada que sirva, só eu', () => {
  const pessoas = ['7', '9'];
  assert.deepEqual([...escopoInicial(['7', '9'], '7', pessoas)], ['7', '9']);
  // Quem saiu da conta (ou perdeu a permissão) cai fora.
  assert.deepEqual([...escopoInicial(['7', '12'], '7', pessoas)], ['7']);
  assert.deepEqual([...escopoInicial(['12'], '7', pessoas)], ['7']);
  assert.deepEqual([...escopoInicial(null, '7', pessoas)], ['7']);
  assert.deepEqual([...escopoInicial([], '7', pessoas)], ['7']);
  // Só a outra pessoa também é uma escolha válida.
  assert.deepEqual([...escopoInicial(['9'], '7', pessoas)], ['9']);
});

test('quem está sendo somado, em poucas palavras', () => {
  const pessoas = [
    { usuarioId: 7, nome: 'Mirian' }, { usuarioId: 9, nome: 'Rodrigo' }, { usuarioId: 11, nome: 'Ana' }, { usuarioId: 12, nome: 'Davi' },
  ];
  assert.equal(descreverEscopoPessoas(new Set(['7']), pessoas, '7'), 'Só você');
  assert.equal(descreverEscopoPessoas(new Set(), pessoas, '7'), 'Só você');
  assert.equal(descreverEscopoPessoas(new Set(['7', '9']), pessoas, '7'), 'Você + Rodrigo');
  assert.equal(descreverEscopoPessoas(new Set(['7', '9', '11']), pessoas, '7'), 'Você + Rodrigo + Ana');
  assert.equal(descreverEscopoPessoas(new Set(['7', '9', '11', '12']), pessoas, '7'), 'Você + 3 pessoas');
  // Sem o próprio usuário marcado.
  assert.equal(descreverEscopoPessoas(new Set(['9']), pessoas, '7'), 'Rodrigo');
  assert.equal(descreverEscopoPessoas(new Set(['9', '11', '12']), pessoas, '7'), '3 pessoas');
  // Ids que não estão na lista são ignorados.
  assert.equal(descreverEscopoPessoas(new Set(['7', '99']), pessoas, '7'), 'Só você');
});
