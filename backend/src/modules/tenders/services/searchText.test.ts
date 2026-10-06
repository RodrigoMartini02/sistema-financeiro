import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../../../utils/requestInput';
import { parseSearchText } from './searchText';

test('palavras soltas viram termos; aspas viram frase; -palavra e -"frase" viram exclusão', () => {
  assert.deepEqual(parseSearchText('software "gestão tributária" -impressora -"material de limpeza"'), {
    terms: ['software', 'gestão tributária'],
    excludedTerms: ['impressora', 'material de limpeza'],
  });
});

test('termos curtos são ignorados, espaços são normalizados e repetições somem', () => {
  assert.deepEqual(parseSearchText('  a  ISS  "  nota   fiscal "  iss - -x  '), {
    terms: ['ISS', 'nota fiscal'],
    excludedTerms: [],
  });
});

test('aspas sem fechamento não quebram: a palavra entra sem as aspas', () => {
  assert.deepEqual(parseSearchText('"material hospitalar'), { terms: ['material', 'hospitalar'], excludedTerms: [] });
});

test('texto vazio não tem termos', () => {
  assert.deepEqual(parseSearchText(''), { terms: [], excludedTerms: [] });
});

test('termo acima de 80 caracteres ou mais de 30 termos recusam a busca', () => {
  assert.throws(() => parseSearchText(`"${'a'.repeat(81)}"`), RequestInputError);
  const tooMany = Array.from({ length: 31 }, (_, index) => `termo${index}`).join(' ');
  assert.throws(() => parseSearchText(tooMany), RequestInputError);
  const tooManyExclusions = Array.from({ length: 31 }, (_, index) => `-termo${index}`).join(' ');
  assert.throws(() => parseSearchText(tooManyExclusions), RequestInputError);
});
