import { useQuery } from '@tanstack/react-query';
import { Award, ExternalLink, ShieldAlert } from 'lucide-react';
import { keys } from '../../api/keys';
import { CertificateActions } from '../../components/domain/CertificateActions';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, ButtonLink, EmptyState, InlineAlert, PageHeader } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchMyCertificates } from '../../services/certificates';
import type { Certificate } from '../../types';
import { cn } from '../../utils/cn';
import { formatDate } from '../../utils/format';

function CertificateCard({ certificate }: { certificate: Certificate }) {
  const revoked = certificate.status === 'REVOKED';
  return (
    <article className={cn('overflow-hidden rounded-2xl border bg-white shadow-card', revoked ? 'border-red-100' : 'border-slate-100')} aria-label={`Certificate for ${certificate.courseTitle}`}>
      <div className={cn('relative px-6 py-5 text-white', revoked ? 'bg-gradient-to-br from-slate-500 to-slate-600' : 'bg-gradient-to-br from-navy via-[#12305a] to-[#1b4a8c]')}>
        <span aria-hidden className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[22px] border-white/10" />
        <div className="relative flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15" aria-hidden>
            <Award size={22} />
          </span>
          {revoked ? (
            <Badge tone="danger">
              <ShieldAlert size={11} aria-hidden /> Revoked
            </Badge>
          ) : (
            <Badge tone="success">Valid</Badge>
          )}
        </div>
        <p className="relative mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Certificate of completion</p>
        <h2 className="relative mt-1 font-display text-xl font-bold leading-snug">{certificate.courseTitle}</h2>
        <p className="relative mt-1 text-sm text-white/70">{certificate.holderName}</p>
      </div>
      <div className="space-y-4 p-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Issued</dt>
            <dd className="font-semibold text-navy">{formatDate(certificate.issuedAt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Assessment score</dt>
            <dd className="font-semibold text-navy">{certificate.score !== null ? `${certificate.score}%` : '-'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Certificate number</dt>
            <dd className="font-mono text-sm font-bold text-navy">{certificate.certificateNumber}</dd>
          </div>
        </dl>
        {revoked ? (
          <InlineAlert tone="danger">
            This certificate was revoked{certificate.revokedAt ? ` on ${formatDate(certificate.revokedAt)}` : ''}
            {certificate.revokedReason ? `: ${certificate.revokedReason}` : '.'}
          </InlineAlert>
        ) : (
          <>
            <CertificateActions certificate={certificate} />
            <a href={`/verify/${certificate.certificateNumber}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
              <ExternalLink size={12} aria-hidden /> Open the public verification page
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        )}
      </div>
    </article>
  );
}

export default function CertificatesPage() {
  usePageTitle('Certificates');
  const query = useQuery({ queryKey: keys.certificates, queryFn: fetchMyCertificates });
  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Trainee workspace" title="Certificates" description="Every certificate carries a unique number and a QR code. Anyone can confirm it is genuine on the public verification page, without signing in." />
      <QueryBoundary query={query}>
        {(certificates) =>
          certificates.length === 0 ? (
            <EmptyState title="No certificates yet" description="Complete a course and pass its assessment to earn your first certificate." icon={<Award size={18} />} action={<ButtonLink to="/trainee/my-courses">Go to my courses</ButtonLink>} />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {certificates.map((certificate) => (
                <CertificateCard key={certificate.id} certificate={certificate} />
              ))}
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}
