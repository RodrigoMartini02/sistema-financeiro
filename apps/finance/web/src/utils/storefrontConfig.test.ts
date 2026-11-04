import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeSlug, formatWhatsappInput, isValidStorefrontSlug, sanitizeSlugInput } from './storefrontConfig';

test('link enquanto digita: sem acento, minúsculo e com hífens', () => {
  assert.equal(sanitizeSlugInput('Doces da Ana'), 'doces-da-ana');
  assert.equal(sanitizeSlugInput('Pão & Café'), 'pao-cafe');
  assert.equal(sanitizeSlugInput('--minha--loja'), 'minha-loja');
  assert.equal(sanitizeSlugInput('minha-'), 'minha-');
});

test('link pronto para salvar perde o hífen solto no fim', () => {
  assert.equal(finalizeSlug('minha-loja-'), 'minha-loja');
  assert.equal(isValidStorefrontSlug(finalizeSlug('Doces da Ana!')), true);
  assert.equal(isValidStorefrontSlug('ab'), false);
});

test('WhatsApp gravado ou digitado no formato (DDD) número', () => {
  assert.equal(formatWhatsappInput('5511987654321'), '(11) 98765-4321');
  assert.equal(formatWhatsappInput('551134567890'), '(11) 3456-7890');
  assert.equal(formatWhatsappInput('11987654321'), '(11) 98765-4321');
  assert.equal(formatWhatsappInput('5555987654321'), '(55) 98765-4321');
});

test('WhatsApp aos poucos enquanto digita', () => {
  assert.equal(formatWhatsappInput(''), '');
  assert.equal(formatWhatsappInput('1'), '(1');
  assert.equal(formatWhatsappInput('119'), '(11) 9');
  assert.equal(formatWhatsappInput('1198765'), '(11) 9876-5');
});
