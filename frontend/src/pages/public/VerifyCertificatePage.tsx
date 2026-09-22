import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ExternalLink, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { LogoMark } from '../../components/domain/LogoMark';
import { Button, Card, ErrorState, KeyValue, Spinner, TextField } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { useAuth } from '../../hooks/useAuth';
import { verifyCertificate } from '../../services/certificates';
import type { SignatureCheck } from '../../types';
import { formatDate } from '../../utils/format';
import { HOME_PATH } from '../../utils/constants';

/** Public page (no sign-in): confirms whether a certificate is genuine. The QR code on every certificate points here. */
/**
 * The cryptographic half of the answer: whether the certificate carries a valid
 * Ed25519 signature from the issuing server, and what it means when it does not.
 */
function SignaturePanel({ signature }: { signature: SignatureCheck }) {
  if (signature.state === 'VALID') {
    return (
      <p className="mt-6 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-bold">Digital signature valid.</span> The details above are cryptographically signed by the issuing server (Ed25519, key{' '}
          <span className="font-mono">{signature.keyId}</span>) and have not been altered since issue.
        </span>
      </p>
    );
  }
  if (signature.state === 'UNSIGNED') {
    return (
      <p className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-bold">Not digitally signed.</span> This certificate was issued before signing was switched on. The record above comes from the issuing
          system and is genuine, but it carries no signature you can check independently.
        </span>
      </p>
    );
  }
  return (
    <p className="mt-6 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-bold">Signature could not be checked.</span>{' '}
        {signature.state === 'UNVERIFIABLE' ? signature.reason : 'This server could not check the signature.'} The certificate details above still come from the issuing system.
      </span>
    </p>
  );
}

export default function VerifyCertificatePage() {
  usePageTitle('Verify a certificate');
  const { certificateId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const query = useQuery({ queryKey: keys.verify(certificateId ?? ''), queryFn: () => verifyCertificate(certificateId as string), enabled: Boolean(certificateId), retry: false });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (value) navigate(`/verify/${encodeURIComponent(value)}`);
  };

  const result = query.data;
  return (
    <div className="min-h-screen bg-cloud">
      <header className="bg-navy px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <LogoMark />
          <Link to={user ? HOME_PATH[user.role] : '/login'} className="text-sm font-semibold text-white/70 hover:text-white">
            {user ? 'Open my workspace' : 'Sign in'}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-deep">Certificate verification</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-navy">Is this certificate genuine?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Anyone can check a Capacity Connect certificate. Scan the QR code on the certificate or type its certificate ID below.</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField wrapperClassName="flex-1" label="Certificate ID" placeholder="CC-2026-7K3M9PQX" value={input} onChange={(event) => setInput(event.target.value)} autoComplete="off" spellCheck={false} />
          <Button type="submit" disabled={!input.trim()}>
            Verify
          </Button>
        </form>

        <div className="mt-8" aria-live="polite">
          {certificateId && query.isLoading && <Spinner label="Checking the certificate" />}
          {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Verification is unavailable" />}
          {result && result.valid && (
            <Card className="border-emerald-200">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700" aria-hidden>
                  <BadgeCheck size={26} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-emerald-700">Valid certificate</h2>
                  <p className="mt-1 text-sm text-slate-500">This certificate was issued by Capacity Connect and has not been revoked.</p>
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <KeyValue label="Awarded to">{result.holderName}</KeyValue>
                <KeyValue label="Course">{result.courseTitle}</KeyValue>
                <KeyValue label="Assessment score">{result.score === null ? 'Course completed' : `${result.score}%`}</KeyValue>
                <KeyValue label="Date of issue">{formatDate(result.issuedAt)}</KeyValue>
                <KeyValue label="Issued by">{result.issuer}</KeyValue>
                <KeyValue label="Certificate ID">
                  <span className="font-mono">{result.certificateNumber}</span>
                </KeyValue>
                {result.competencies.length > 0 && <KeyValue label="Competencies">{result.competencies.join(', ')}</KeyValue>}
              </dl>
              <SignaturePanel signature={result.signature} />
            </Card>
          )}
          {result && !result.valid && result.reason === 'TAMPERED' && (
            <Card className="border-red-200">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600" aria-hidden>
                  <ShieldX size={26} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-red-700">Verification failed</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    A certificate with the ID <span className="font-mono">{result.certificateNumber}</span> exists, but its digital signature does not match its contents. That means the
                    record has been altered since it was issued. Do not rely on this certificate; report it to the issuing office.
                  </p>
                </div>
              </div>
            </Card>
          )}
          {result && !result.valid && result.reason === 'REVOKED' && (
            <Card className="border-red-200">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600" aria-hidden>
                  <ShieldX size={26} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-red-700">Certificate revoked</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Certificate <span className="font-mono">{result.certificateNumber}</span> was revoked{result.revokedAt ? ` on ${formatDate(result.revokedAt)}` : ''} and is no longer valid.
                    {result.holderName && ` It was issued to ${result.holderName} for ${result.courseTitle}.`}
                  </p>
                </div>
              </div>
            </Card>
          )}
          {result && !result.valid && result.reason === 'NOT_FOUND' && (
            <Card className="border-amber-200">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700" aria-hidden>
                  <ShieldAlert size={26} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-amber-700">No matching certificate</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    We could not find a certificate with the ID <span className="font-mono">{result.certificateNumber}</span>. Check the ID for typing mistakes. If the document was given to you as genuine, treat it with caution.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
        <p className="mt-10 flex items-center gap-1.5 text-xs text-slate-500">
          <ExternalLink size={12} aria-hidden /> Verification shows only what is printed on the certificate. No personal contact details are disclosed.
        </p>
      </main>
    </div>
  );
}
