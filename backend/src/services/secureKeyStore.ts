import * as crypto from 'crypto';

const PREFIX = 'enc:v1:';

function getSecret(): string {
  return process.env['GEN_KEY_ENCRYPTION_SECRET'] ?? process.env['JWT_SECRET'] ?? process.env['SESSION_SECRET'] ?? '';
}

function getCipherKey(): Buffer | null {
  const secret = getSecret();
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptKey(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return value ?? null;
  if (isEncrypted(value)) return value;

  const key = getCipherKey();
  if (!key) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = (cipher as crypto.CipherGCM).getAuthTag();

  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptKey(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return value ?? null;
  if (!isEncrypted(value)) return value;

  const key = getCipherKey();
  if (!key) return null;

  try {
    const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const enc = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function decryptKeyMap(keys: Record<string, string> = {}): Record<string, string | null> {
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return {};
  return Object.fromEntries(Object.entries(keys).map(([provider, value]) => [provider, decryptKey(value)]));
}

export function encryptKeyMap(keys: Record<string, string> = {}): Record<string, string | null> {
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return {};
  return Object.fromEntries(
    Object.entries(keys)
      .filter(([, value]) => !!value)
      .map(([provider, value]) => [provider, encryptKey(value)]),
  );
}

export function maskKey(value: string | null | undefined): string | null {
  const plain = decryptKey(value ?? null);
  if (!plain) return null;
  return plain.slice(0, 6) + '********';
}
