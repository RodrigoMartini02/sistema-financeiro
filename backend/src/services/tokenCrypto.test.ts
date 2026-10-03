import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'crypto';
import { SecretKeyError, decryptSecret, encryptSecret, readSecretKey } from './tokenCrypto';

const KEY = randomBytes(32);

test('cifra e decifra o token, com IV diferente a cada vez', () => {
  const first = encryptSecret('APP_USR-123', KEY);
  const second = encryptSecret('APP_USR-123', KEY);
  assert.notEqual(first, second);
  assert.equal(first.includes('APP_USR'), false);
  assert.equal(decryptSecret(first, KEY), 'APP_USR-123');
  assert.equal(decryptSecret(second, KEY), 'APP_USR-123');
});

test('texto adulterado ou chave errada são recusados', () => {
  const payload = encryptSecret('APP_USR-123', KEY);
  const [iv, tag, cipher] = payload.split('.');
  const tampered = [iv, tag, Buffer.from('outra coisa').toString('base64')].join('.');
  assert.throws(() => decryptSecret(tampered, KEY));
  assert.throws(() => decryptSecret(payload, randomBytes(32)));
  assert.throws(() => decryptSecret(`${iv}.${cipher}`, KEY));
});

test('a chave precisa existir e ter 32 bytes em base64', () => {
  assert.equal(readSecretKey(KEY.toString('base64')).length, 32);
  assert.throws(() => readSecretKey(undefined), SecretKeyError);
  assert.throws(() => readSecretKey(randomBytes(16).toString('base64')), SecretKeyError);
});
