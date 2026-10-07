import assert from 'node:assert/strict';
import test from 'node:test';
import { PRIVACY_CONTENT, TERMS_CONTENT } from '../screens/public/legalContent';
import { parseLegalText } from './legalText';

test('texto legal: título, item e parágrafo; linhas vazias só separam', () => {
  assert.deepEqual(parseLegalText('\n**1. OBJETO**\nTexto corrido.\n\n• Primeiro item\n'), [
    { kind: 'heading', text: '1. OBJETO' },
    { kind: 'paragraph', text: 'Texto corrido.' },
    { kind: 'item', text: 'Primeiro item' },
  ]);
});

test('termos e privacidade cobrem as duas soluções e as regras de cancelamento', () => {
  const terms = parseLegalText(TERMS_CONTENT).map((block) => block.text).join('\n');
  assert.match(terms, /FINGERENCE Finanças/);
  assert.match(terms, /FINGERENCE Licitações/);
  assert.match(terms, /PNCP/, 'a fonte dos editais fica nos termos (decisão 4)');
  assert.match(terms, /o acesso termina na hora/);
  assert.match(terms, /o acesso continua até o fim do teste ou do período já pago/);
  const privacy = parseLegalText(PRIVACY_CONTENT).map((block) => block.text).join('\n');
  assert.match(privacy, /Mercado Pago/);
  assert.match(privacy, /FINGERENCE Licitações/);
});

test('termos e privacidade não falam em "módulo" nem em "mesmo login"', () => {
  for (const content of [TERMS_CONTENT, PRIVACY_CONTENT]) {
    assert.doesNotMatch(content, /m[óo]dulo/i);
    assert.doesNotMatch(content, /mesmo login/i);
  }
});
