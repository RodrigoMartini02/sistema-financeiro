import crypto from 'crypto';

const KEY_LENGTH = 64;

export function hashFootballPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyFootballPassword(password: string, storedHash: string): boolean {
  if (!storedHash.includes(':')) {
    return false;
  }

  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) {
    return false;
  }

  const derivedHash = crypto.scryptSync(password, salt, KEY_LENGTH);
  const originalBuffer = Buffer.from(originalHash, 'hex');

  if (originalBuffer.length !== derivedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(originalBuffer, derivedHash);
}
