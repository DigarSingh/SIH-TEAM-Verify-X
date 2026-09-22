import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Ed25519 signatures for certificates.
 *
 * A certificate is signed over a canonical JSON representation of the facts it
 * asserts. Anyone holding the public key can then confirm both that this server
 * issued it and that not one character has been altered since — without a
 * database lookup and without trusting the page that displays it.
 *
 * The private key is read from `CERTIFICATE_SIGNING_KEY` and never leaves this
 * module: it is not logged, not returned by any endpoint and not written to the
 * database. Only the public key is published.
 *
 * Signing is optional. With no key configured, certificates are issued unsigned
 * and verification says so plainly rather than claiming a signature it cannot
 * check. That keeps an existing installation working after an upgrade.
 */

/** The facts a signature covers. Field order here IS the canonical order. */
export interface CertificatePayload {
  certificateNumber: string;
  holderName: string;
  courseTitle: string;
  issuer: string;
  /** Percentage, or null when the course had no score. */
  score: number | null;
  /** ISO-8601, milliseconds included, always UTC. */
  issuedAt: string;
  /** Competencies the course develops, sorted, so the order can never differ. */
  competencies: string[];
}

/**
 * Canonical JSON: fixed key order, no incidental whitespace.
 *
 * Two servers must produce byte-identical input for the same certificate, so
 * this never relies on JavaScript's object key ordering or on `JSON.stringify`
 * of a caller-built object.
 */
export function canonicalPayload(payload: CertificatePayload): string {
  return JSON.stringify([
    ['certificateNumber', payload.certificateNumber],
    ['holderName', payload.holderName],
    ['courseTitle', payload.courseTitle],
    ['issuer', payload.issuer],
    ['score', payload.score],
    ['issuedAt', payload.issuedAt],
    ['competencies', [...payload.competencies].sort()],
  ]);
}

let cached: { privateKey: KeyObject; publicKey: KeyObject; keyId: string } | null | undefined;

/** Short, stable identifier for a public key, so a rotated key can be told apart. */
export function keyIdFor(publicKey: KeyObject): string {
  const raw = publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Loads the configured signing key, or null when none is set.
 *
 * A malformed key is a configuration error worth shouting about, but it must not
 * stop the server from starting: certificates simply go unsigned until it is fixed.
 */
function loadKeys(): { privateKey: KeyObject; publicKey: KeyObject; keyId: string } | null {
  if (cached !== undefined) return cached;

  const pem = env.CERTIFICATE_SIGNING_KEY;
  if (!pem) {
    cached = null;
    return cached;
  }
  try {
    const privateKey = createPrivateKey(pem.includes('BEGIN') ? pem : Buffer.from(pem, 'base64').toString('utf8'));
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error(`expected an ed25519 key, found ${privateKey.asymmetricKeyType ?? 'unknown'}`);
    const publicKey = createPublicKey(privateKey);
    cached = { privateKey, publicKey, keyId: keyIdFor(publicKey) };
  } catch (error) {
    // Never include the key material itself in the log.
    logger.error({ err: error instanceof Error ? error.message : 'unreadable' }, 'CERTIFICATE_SIGNING_KEY could not be read; certificates will be issued unsigned');
    cached = null;
  }
  return cached;
}

/** Forgets the cached key. Tests use this after changing the environment. */
export function resetSigningKeyForTesting(): void {
  cached = undefined;
}

export const isSigningConfigured = (): boolean => loadKeys() !== null;

/** The public key in PEM form, for anyone who wants to verify independently. */
export function verificationKey(): { publicKey: string; keyId: string; algorithm: 'Ed25519' } | null {
  const keys = loadKeys();
  if (!keys) return null;
  return { publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), keyId: keys.keyId, algorithm: 'Ed25519' };
}

export interface Signature {
  /** Base64 Ed25519 signature over the canonical payload. */
  signature: string;
  keyId: string;
}

/** Signs a certificate payload, or returns null when no key is configured. */
export function signCertificate(payload: CertificatePayload): Signature | null {
  const keys = loadKeys();
  if (!keys) return null;
  // Ed25519 hashes internally, so the algorithm argument must be null.
  const signature = cryptoSign(null, Buffer.from(canonicalPayload(payload), 'utf8'), keys.privateKey);
  return { signature: signature.toString('base64'), keyId: keys.keyId };
}

export type SignatureCheck =
  | { state: 'VALID'; keyId: string }
  /** The stored data no longer matches what was signed, or the signature is forged. */
  | { state: 'INVALID'; keyId: string | null }
  /** The certificate carries no signature (issued before signing was configured). */
  | { state: 'UNSIGNED' }
  /** It is signed, but this server cannot check it: no key, or a key that has been rotated. */
  | { state: 'UNVERIFIABLE'; keyId: string | null; reason: string };

/** Checks a stored signature against the certificate's current data. */
export function verifySignature(payload: CertificatePayload, signature: string | null, keyId: string | null): SignatureCheck {
  if (!signature) return { state: 'UNSIGNED' };

  const keys = loadKeys();
  if (!keys) return { state: 'UNVERIFIABLE', keyId, reason: 'This server has no certificate signing key configured.' };
  if (keyId !== null && keyId !== keys.keyId) {
    return { state: 'UNVERIFIABLE', keyId, reason: 'This certificate was signed with a different key from the one this server now holds.' };
  }

  let ok = false;
  try {
    ok = cryptoVerify(null, Buffer.from(canonicalPayload(payload), 'utf8'), keys.publicKey, Buffer.from(signature, 'base64'));
  } catch {
    ok = false; // a malformed signature is simply not a valid one
  }
  return ok ? { state: 'VALID', keyId: keys.keyId } : { state: 'INVALID', keyId };
}

/** Generates a fresh Ed25519 key pair. Used by the key-generation script and by tests. */
export function generateSigningKeyPair(): { privateKeyPem: string; publicKeyPem: string; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    keyId: keyIdFor(publicKey),
  };
}
