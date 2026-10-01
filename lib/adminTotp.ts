import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Authenticator-app codes (TOTP, RFC 6238: HMAC-SHA1, 6 digits, 30-second steps) for the
// shared admin login. Google Authenticator, Microsoft Authenticator, Authy etc. all use
// these defaults. The secret is stored encrypted, so a database dump alone can't mint codes.

const STEP_SECONDS = 30;
const DIGITS = 6;
const ISSUER = 'ULAB MMS';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET must be set - admin 2FA secrets are encrypted with it');
}
const KEY = crypto.createHash('sha256').update(`${process.env.NEXTAUTH_SECRET}:admin-totp`).digest();

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits, the RFC's recommended size), base32 as apps expect. */
export function newSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * The step a code matches, allowing one step of clock drift either way - or null. A step at
 * or before `lastUsedStep` is refused, so a code seen over someone's shoulder can't be reused.
 */
export function verifyCode(secret: string, code: string, lastUsedStep = -1, now = Date.now()): number | null {
  const clean = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    if (s <= lastUsedStep) continue;
    const expected = codeAt(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account = 'Shared admin'): string {
  const label = encodeURIComponent(`${ISSUER}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ── Encryption at rest (AES-256-GCM) ──────────────────────────────────────────────────────

export function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(stored: string): string {
  const [iv, tag, enc] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ── Backup codes: one-time, for when the phone is lost ────────────────────────────────────

export async function newBackupCodes(count = 8): Promise<{ codes: string[]; hashes: string[] }> {
  const codes = Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex'); // 40 bits
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  return { codes, hashes };
}

/** Index of the matching backup code's hash, or -1. The caller removes it (one use only). */
export async function matchBackupCode(code: string, hashes: string[]): Promise<number> {
  const clean = String(code).trim().toLowerCase().replace(/\s/g, '');
  if (!/^[0-9a-f]{5}-?[0-9a-f]{5}$/.test(clean)) return -1;
  const normalized = clean.includes('-') ? clean : `${clean.slice(0, 5)}-${clean.slice(5)}`;
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalized, hashes[i])) return i;
  }
  return -1;
}
