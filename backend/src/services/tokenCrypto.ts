// Cifra dos segredos guardados no banco (tokens do Mercado Pago de cada
// loja): AES-256-GCM com IV aleatório. O texto adulterado é recusado pela tag
// de autenticação. Sem acesso ao banco nem ao ambiente: a chave é passada.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export class SecretKeyError extends Error {}

/** Chave em base64 com 32 bytes (por exemplo, `openssl rand -base64 32`). */
export function readSecretKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new SecretKeyError('Chave de cifra não configurada');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new SecretKeyError('Chave de cifra inválida: precisa ter 32 bytes em base64');
  }
  return key;
}

/** `iv.tag.cifra`, cada parte em base64. */
export function encryptSecret(plainText: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64')).join('.');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Encrypted secret has an invalid format');
  }
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv(ALGORITHM, key, iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(encrypted!), decipher.final()]).toString('utf8');
}
