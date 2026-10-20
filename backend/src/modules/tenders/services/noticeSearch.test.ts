import assert from 'node:assert/strict';
import test from 'node:test';
import { noticeSituationLabel, numberGroupsOf } from './noticeSearch';

test('situação: nome da tela pela lista (a 1 chega do PNCP como "Divulgada no PNCP"); fora da lista, o nome gravado', () => {
  assert.equal(noticeSituationLabel(1, 'Divulgada no PNCP'), 'Divulgada');
  assert.equal(noticeSituationLabel(4, 'Suspensa'), 'Suspensa');
  assert.equal(noticeSituationLabel(99, 'Outra situação'), 'Outra situação');
  assert.equal(noticeSituationLabel(null, null), null);
});

// Busca por número: os grupos seguem a regra de licitacoes.fn_grupos_digitos (migration 0079).

test('número: grupos de dígitos sem os zeros à esquerda e sem repetir', () => {
  assert.deepEqual(numberGroupsOf('PE 352/2026'), ['352', '2026']);
  assert.deepEqual(numberGroupsOf('154.00015971/2026-66'), ['154', '15971', '2026', '66']);
  assert.deepEqual(numberGroupsOf('83497594000115-1-000038/2026'), ['83497594000115', '1', '38', '2026']);
  assert.deepEqual(numberGroupsOf('000/2026 2026'), ['0', '2026'], 'só zeros vira 0, e o grupo repetido sai');
  assert.deepEqual(numberGroupsOf('PE'), [], 'sem dígito, sem grupo');
});
