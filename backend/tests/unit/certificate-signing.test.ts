import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ed25519 certificate signatures.
 *
 * The environment is read when the signing module first needs a key, so each
 * group sets `CERTIFICATE_SIGNING_KEY` and then resets the cached key.
 */
const load = async (privateKey?: string) => {
  vi.resetModules();
  vi.doMock('../../src/config/env', () => ({ env: { CERTIFICATE_SIGNING_KEY: privateKey } }));
  vi.doMock('../../src/config/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
  return import('../../src/modules/certificates/certificate-signing');
};

const payload = {
  certificateNumber: 'CC-2026-7K3M9PQX',
  holderName: 'Dr. Ananya Rao',
  courseTitle: 'Advanced Radar Analysis',
  issuer: 'India Meteorological Department, Ministry of Earth Sciences',
  score: 84,
  issuedAt: '2026-09-20T10:00:00.000Z',
  competencies: ['Radar Meteorology', 'Weather Forecasting'],
};

describe('canonical payload', () => {
  it('is stable regardless of the order the competencies arrive in', async () => {
    const { canonicalPayload } = await load();
    const a = canonicalPayload(payload);
    const b = canonicalPayload({ ...payload, competencies: ['Weather Forecasting', 'Radar Meteorology'] });
    expect(a).toBe(b);
  });

  it('changes when any signed fact changes', async () => {
    const { canonicalPayload } = await load();
    const base = canonicalPayload(payload);
    expect(canonicalPayload({ ...payload, score: 85 })).not.toBe(base);
    expect(canonicalPayload({ ...payload, holderName: 'Someone Else' })).not.toBe(base);
    expect(canonicalPayload({ ...payload, issuedAt: '2026-09-21T10:00:00.000Z' })).not.toBe(base);
    expect(canonicalPayload({ ...payload, competencies: [...payload.competencies, 'Extra'] })).not.toBe(base);
  });

  it('distinguishes a null score from a zero one', async () => {
    const { canonicalPayload } = await load();
    expect(canonicalPayload({ ...payload, score: null })).not.toBe(canonicalPayload({ ...payload, score: 0 }));
  });
});

describe('with no signing key configured', () => {
  it('reports that signing is off and signs nothing', async () => {
    const module = await load(undefined);
    expect(module.isSigningConfigured()).toBe(false);
    expect(module.verificationKey()).toBeNull();
    expect(module.signCertificate(payload)).toBeNull();
  });

  it('calls an unsigned certificate UNSIGNED, not invalid', async () => {
    const module = await load(undefined);
    expect(module.verifySignature(payload, null, null)).toEqual({ state: 'UNSIGNED' });
  });

  it('cannot check a signature it has no key for, and says so rather than failing it', async () => {
    const module = await load(undefined);
    const result = module.verifySignature(payload, 'c2lnbmF0dXJl', 'abc123');
    expect(result.state).toBe('UNVERIFIABLE');
  });
});

describe('with a signing key configured', () => {
  let key: { privateKeyPem: string; publicKeyPem: string; keyId: string };

  beforeEach(async () => {
    const generator = await load();
    key = generator.generateSigningKeyPair();
  });

  it('signs a certificate and verifies its own signature', async () => {
    const module = await load(key.privateKeyPem);
    expect(module.isSigningConfigured()).toBe(true);
    const signed = module.signCertificate(payload);
    expect(signed).not.toBeNull();
    expect(module.verifySignature(payload, signed?.signature ?? null, signed?.keyId ?? null)).toEqual({ state: 'VALID', keyId: key.keyId });
  });

  it('rejects a certificate whose data was altered after signing', async () => {
    const module = await load(key.privateKeyPem);
    const signed = module.signCertificate(payload);
    for (const tampered of [
      { ...payload, score: 99 },
      { ...payload, holderName: 'Impostor' },
      { ...payload, courseTitle: 'A Different Course' },
      { ...payload, issuer: 'Somewhere Else' },
      { ...payload, issuedAt: '2020-01-01T00:00:00.000Z' },
      { ...payload, competencies: ['Radar Meteorology'] },
    ]) {
      expect(module.verifySignature(tampered, signed?.signature ?? null, signed?.keyId ?? null).state).toBe('INVALID');
    }
  });

  it('rejects a forged or malformed signature without throwing', async () => {
    const module = await load(key.privateKeyPem);
    expect(module.verifySignature(payload, Buffer.from('not a signature').toString('base64'), key.keyId).state).toBe('INVALID');
    expect(module.verifySignature(payload, 'not base64 at all !!!', key.keyId).state).toBe('INVALID');
  });

  it('publishes the public key and its id, and never the private key', async () => {
    const module = await load(key.privateKeyPem);
    const published = module.verificationKey();
    expect(published?.algorithm).toBe('Ed25519');
    expect(published?.keyId).toBe(key.keyId);
    expect(published?.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(JSON.stringify(published)).not.toContain('PRIVATE');
  });

  it('accepts the key base64-encoded as well as in PEM form', async () => {
    const module = await load(Buffer.from(key.privateKeyPem, 'utf8').toString('base64'));
    expect(module.isSigningConfigured()).toBe(true);
    expect(module.verificationKey()?.keyId).toBe(key.keyId);
  });

  it('will not check a signature made by a different key, rather than calling it forged', async () => {
    const other = (await load()).generateSigningKeyPair();
    const signedElsewhere = (await load(other.privateKeyPem)).signCertificate(payload);

    const module = await load(key.privateKeyPem);
    const result = module.verifySignature(payload, signedElsewhere?.signature ?? null, other.keyId);
    expect(result.state).toBe('UNVERIFIABLE');
    if (result.state === 'UNVERIFIABLE') expect(result.reason).toContain('different key');
  });

  it('produces a different key id for every key', async () => {
    const generator = await load();
    const ids = new Set([key.keyId, generator.generateSigningKeyPair().keyId, generator.generateSigningKeyPair().keyId]);
    expect(ids.size).toBe(3);
  });
});

describe('an unusable key', () => {
  it('does not stop the server: certificates are issued unsigned instead', async () => {
    const module = await load('this is not a key at all');
    expect(module.isSigningConfigured()).toBe(false);
    expect(module.signCertificate(payload)).toBeNull();
  });

  it('is refused when it is the wrong kind of key', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const module = await load(rsa);
    expect(module.isSigningConfigured()).toBe(false);
  });

  it('never writes the key material into the log', async () => {
    vi.resetModules();
    const error = vi.fn();
    vi.doMock('../../src/config/env', () => ({ env: { CERTIFICATE_SIGNING_KEY: 'SECRET-KEY-MATERIAL-not-a-key' } }));
    vi.doMock('../../src/config/logger', () => ({ logger: { error, warn: vi.fn(), info: vi.fn() } }));
    const module = await import('../../src/modules/certificates/certificate-signing');
    module.isSigningConfigured();
    expect(error).toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('SECRET-KEY-MATERIAL');
  });
});
