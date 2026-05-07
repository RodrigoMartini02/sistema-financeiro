'use strict';

const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getSecret() {
    return process.env.GEN_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET || '';
}

function getCipherKey() {
    const secret = getSecret();
    if (!secret) return null;
    return crypto.createHash('sha256').update(secret).digest();
}

function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptKey(value) {
    if (!value || typeof value !== 'string') return value || null;
    if (isEncrypted(value)) return value;

    const key = getCipherKey();
    if (!key) return value;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptKey(value) {
    if (!value || typeof value !== 'string') return value || null;
    if (!isEncrypted(value)) return value;

    const key = getCipherKey();
    if (!key) return null;

    try {
        const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
        const iv = payload.subarray(0, 12);
        const tag = payload.subarray(12, 28);
        const encrypted = payload.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

function decryptKeyMap(keys = {}) {
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return {};
    return Object.fromEntries(
        Object.entries(keys || {}).map(([provider, value]) => [provider, decryptKey(value)])
    );
}

function encryptKeyMap(keys = {}) {
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return {};
    return Object.fromEntries(
        Object.entries(keys || {})
            .filter(([, value]) => !!value)
            .map(([provider, value]) => [provider, encryptKey(value)])
    );
}

function maskKey(value) {
    const plain = decryptKey(value);
    if (!plain) return null;
    return plain.slice(0, 6) + '********';
}

module.exports = {
    encryptKey,
    decryptKey,
    encryptKeyMap,
    decryptKeyMap,
    maskKey,
    isEncrypted,
};
