import crypto from 'node:crypto';

/** SHA-256 hex digest - used for refresh-token storage (tokens are high-entropy, so a fast hash is appropriate). */
export const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

/** URL-safe random token with `bytes` bytes of entropy. */
export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

/** Random human-friendly upper-case hex string, e.g. for certificate ids. */
export const randomHex = (length: number): string => crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length).toUpperCase();

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Generates a strong temporary password that satisfies the password policy
 * (upper, lower, digit, symbol). Uses rejection sampling to avoid modulo bias.
 */
export function generateTemporaryPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*?';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(set.length)] as string;
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}
