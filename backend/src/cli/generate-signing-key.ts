/**
 * Generates the Ed25519 key pair used to sign certificates.
 *
 *   npm run cert:keygen
 *
 * Prints a private key to paste into `CERTIFICATE_SIGNING_KEY` in `.env`, and the
 * matching public key, which is safe to publish so that anyone can verify a
 * certificate independently.
 *
 * The private key is printed once and never stored by this script. Treat it like
 * a password: anyone holding it can issue certificates that appear genuine.
 * Rotating it does not invalidate existing certificates, but this server can no
 * longer verify them, so keep the old public key if you rotate.
 */
import { generateSigningKeyPair } from '../modules/certificates/certificate-signing';

function main(): void {
  const { privateKeyPem, publicKeyPem, keyId } = generateSigningKeyPair();

  console.log('Certificate signing key (Ed25519)');
  console.log('=================================\n');
  console.log(`Key id: ${keyId}\n`);
  console.log('1. Put this in your .env as a single line, keeping the \\n escapes:\n');
  console.log(`CERTIFICATE_SIGNING_KEY="${privateKeyPem.trimEnd().replace(/\n/g, '\\n')}"\n`);
  console.log('2. Restart the API. New certificates will be signed.\n');
  console.log('Public key (safe to publish; also served at GET /api/certificates/verification-key):\n');
  console.log(publicKeyPem.trimEnd());
  console.log('\nKeep the private key secret. Anyone who has it can issue certificates that verify as genuine.');
}

if (require.main === module) main();
