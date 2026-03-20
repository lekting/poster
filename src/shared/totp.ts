/**
 * Minimal TOTP (RFC 6238) implementation using Node.js built-in crypto.
 * No external dependencies required.
 */
import crypto from 'crypto';

/** Decode a base32-encoded string to a Buffer. */
function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = encoded.replace(/[\s=-]+/g, '').toUpperCase();

  let bits = '';
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

/**
 * Generate a TOTP code from a base32-encoded secret.
 * @param secret Base32-encoded TOTP secret key
 * @param period Time step in seconds (default: 30)
 * @param digits Number of digits in the code (default: 6)
 * @returns The TOTP code as a zero-padded string
 */
export function generateTOTP(
  secret: string,
  period = 30,
  digits = 6
): string {
  const key = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const remaining = period - (epoch % period);

  // If less than 5 seconds left in current window, use next window's code
  // to avoid expiry between generation and server validation
  const counter = remaining < 5
    ? Math.floor(epoch / period) + 1
    : Math.floor(epoch / period);

  // Convert counter to 8-byte big-endian buffer
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter & 0xffffffff, 4);

  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuf);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}
