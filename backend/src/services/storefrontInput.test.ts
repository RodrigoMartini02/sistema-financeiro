import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import {
  isValidLogoDataUrl,
  isValidStorefrontSlug,
  normalizeWhatsapp,
  parseStorefrontParam,
  readStorefrontInput,
  slugify,
  withSlugSuffix,
} from './storefrontInput';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    conta_id: 19,
    nome: '  Doces da Ana ',
    descricao: ' Bolos e tortas ',
    whatsapp: '(11) 98765-4321',
    link: 'doces-da-ana',
    logo: null,
    ...overrides,
  };
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('link a partir do nome: sem acento, minúsculo e com hífens', () => {
  assert.equal(slugify('Doces da Ana'), 'doces-da-ana');
  assert.equal(slugify('  Pão & Café — Ltda.  '), 'pao-cafe-ltda');
  assert.equal(slugify('AÇÚCAR'), 'acucar');
});

test('nome curto ou sem letras ainda gera um link válido', () => {
  assert.equal(slugify('AB'), 'loja-ab');
  assert.equal(slugify('!!!'), 'loja');
  assert.equal(slugify(''), 'loja');
});

test('link longo é cortado em 60 caracteres sem hífen na ponta', () => {
  const slug = slugify(`${'a'.repeat(59)} b`);
  assert.equal(slug.length <= 60, true);
  assert.equal(slug.endsWith('-'), false);
  assert.equal(isValidStorefrontSlug(slug), true);
});

test('sufixo numérico para link repetido, cabendo no limite', () => {
  assert.equal(withSlugSuffix('minha-loja', 1), 'minha-loja');
  assert.equal(withSlugSuffix('minha-loja', 2), 'minha-loja-2');
  const long = withSlugSuffix('a'.repeat(60), 12);
  assert.equal(long.length, 60);
  assert.equal(long.endsWith('-12'), true);
});

test('formato do link', () => {
  assert.equal(isValidStorefrontSlug('doces-da-ana'), true);
  assert.equal(isValidStorefrontSlug('ab'), false);
  assert.equal(isValidStorefrontSlug('Doces'), false);
  assert.equal(isValidStorefrontSlug('doces--ana'), false);
  assert.equal(isValidStorefrontSlug('-doces'), false);
  assert.equal(isValidStorefrontSlug('doces_ana'), false);
});

test('WhatsApp com ou sem máscara e com ou sem o 55 vira só dígitos com o 55', () => {
  assert.equal(normalizeWhatsapp('(11) 98765-4321'), '5511987654321');
  assert.equal(normalizeWhatsapp('11 3456-7890'), '551134567890');
  assert.equal(normalizeWhatsapp('+55 (21) 99876-5432'), '5521998765432');
  assert.equal(normalizeWhatsapp(''), null);
  assert.equal(normalizeWhatsapp(null), null);
});

test('recusa WhatsApp sem DDD, com DDD zero ou de outro país', () => {
  assertRejects(() => normalizeWhatsapp('98765-4321'), 'WhatsApp inválido: informe o DDD e o número');
  assertRejects(() => normalizeWhatsapp('(01) 98765-4321'), 'WhatsApp inválido: informe o DDD e o número');
  assertRejects(() => normalizeWhatsapp('+1 415 555 0100'), 'WhatsApp inválido: informe o DDD e o número');
  assertRejects(() => normalizeWhatsapp(11987654321), 'WhatsApp inválido');
});

test('logo só como data URL de imagem e dentro do limite', () => {
  assert.equal(isValidLogoDataUrl(TINY_PNG), true);
  assert.equal(isValidLogoDataUrl('data:image/gif;base64,R0lGODlhAQABAAAAACw='), false);
  assert.equal(isValidLogoDataUrl('https://exemplo.com/logo.png'), false);
  assert.equal(isValidLogoDataUrl(`data:image/png;base64,${'A'.repeat(310 * 1024)}`), false);
});

test('endereço público: código antigo (UUID) ou link', () => {
  assert.deepEqual(parseStorefrontParam('550E8400-E29B-41D4-A716-446655440000'), {
    kind: 'id',
    id: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.deepEqual(parseStorefrontParam('Doces-da-Ana'), { kind: 'slug', slug: 'doces-da-ana' });
  assert.equal(parseStorefrontParam('x'), null);
  assert.equal(parseStorefrontParam('../segredo'), null);
});

test('lê a configuração da vitrine', () => {
  const input = readStorefrontInput(body({ link: '  Doces-da-Ana ', logo: TINY_PNG }));
  assert.deepEqual(input, {
    accountId: 19,
    name: 'Doces da Ana',
    description: 'Bolos e tortas',
    whatsapp: '5511987654321',
    slug: 'doces-da-ana',
    logo: TINY_PNG,
  });
  const empty = readStorefrontInput(body({ nome: '', descricao: null, whatsapp: '', logo: '' }));
  assert.equal(empty.name, null);
  assert.equal(empty.description, null);
  assert.equal(empty.whatsapp, null);
  assert.equal(empty.logo, null);
});

test('recusa configuração sem conta, com link inválido, logo inválido ou texto longo', () => {
  assertRejects(() => readStorefrontInput(body({ conta_id: undefined })), 'Informe a conta da vitrine');
  assertRejects(
    () => readStorefrontInput(body({ link: 'a b' })),
    'Link inválido: use de 3 a 60 letras minúsculas, números e hífens',
  );
  assertRejects(() => readStorefrontInput(body({ logo: 'data:text/html;base64,PGI+' })), 'Logo inválido: envie uma imagem JPG, PNG ou WebP');
  assertRejects(() => readStorefrontInput(body({ descricao: 'x'.repeat(281) })), 'Descrição: até 280 caracteres');
  assertRejects(() => readStorefrontInput(body({ nome: 'x'.repeat(101) })), 'Nome da loja: até 100 caracteres');
});
