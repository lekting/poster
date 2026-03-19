import crypto from 'crypto';
import { config } from '../config/index.js';

const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptText(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(config.ACCOUNT_ENCRYPTION_SECRET);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plainText, 'utf8')),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptText(cipherText: string): string {
  const [ivHex, tagHex, encryptedHex] = cipherText.split(':');
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error('Invalid encrypted payload format');
  }

  const key = deriveKey(config.ACCOUNT_ENCRYPTION_SECRET);
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGO,
    key,
    Buffer.from(ivHex, 'hex')
  );

  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}
