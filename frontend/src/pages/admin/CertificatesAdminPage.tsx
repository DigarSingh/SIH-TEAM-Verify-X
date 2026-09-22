import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Award, Download, ExternalLink, RotateCcw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, IconButton, InlineAlert, Modal, PageHeader, Pagination, SearchInput, SelectField, Skeleton, Td, TextAreaField, Th, useConfirm, useToast } from '../../components/ui';
import { useApiMutation, useDebounce, usePageTitle } from '../../hooks/misc';
import { downloadCertificatePdf, fetchAllCertificates, reinstateCertificate, revokeCertificate } from '../../services/certificates';
import type { Certificate } from '../../types';
import { formatDate } from '../../utils/format';

const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason (at least 3 characters)').max(300, 'At most 300 characters') });

function RevokeDialog({ certificate, onClose }: { certificate: Certificate; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<{ reason: string }>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } });
  const revoke = useApiMutation({
    mutationFn: (values: { reason: string }) => revokeCertificate(certificate.id, values.reason),
    successMessage: 'Certificate revoked. Its public verification page now reports it as revoked.',
    invalidate: [keys.certificates, keys.certificatesAdminAll],
    onSuccess: onClose,
    onError: (error) => setError('root', { message: errorMessage(error) }),
  });
  const submit = handleSubmit((values) => revoke.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      title="Revoke this certificate?"
      description={`${certificate.certificateNumber} · ${certificate.holderName} · ${certificate.courseTitle}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="!bg-red-600 !text-white hover:!bg-red-700" loading={revoke.isPending} onClick={() => void submit()}>
            Revoke certificate
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <InlineAlert tone="warning">Anyone who scans the QR code or opens the verification link will see that this certificate is no longer valid. The holder is notified. You can reinstate it later.</InlineAlert>
        <TextAreaField label="Reason" required rows={3} hint="Recorded in the audit log and shown on the verification page." error={errors.reason?.message} {...register('reason')} />
        {errors.root?.message && <InlineAlert tone="danger">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function CertificatesAdminPage() {
  usePageTitle('Certificates');
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [revoking, setRevoking] = useState<Certificate | null>(null);
  const debounced = useDebounce(search, 350);

  const request = { page, pageSize: 15, q: debounced, status };
  const query = useQuery({ queryKey: keys.certificatesAdmin(request), queryFn: () => fetchAllCertificates(request), placeholderData: keepPreviousData });
  const reinstate = useApiMutation({ mutationFn: (id: string) => reinstateCertificate(id), successMessage: 'Certificate reinstated', invalidate: [keys.certificatesAdminAll] });
  const download = useApiMutation({ mutationFn: (certificate: Certificate) => downloadCertificatePdf(certificate), onError: (error) => toast.error(errorMessage(error)) });

  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Administration" title="Certificates" description="Every certificate issued by the platform. Anyone can verify a certificate publicly by its number or QR code. Revoking one is recorded and takes effect immediately." />
      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SearchInput className="md:col-span-2" label="Search certificates" placeholder="Certificate number, holder or course" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
          <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="VALID">Valid</option>
            <option value="REVOKED">Revoked</option>
          </SelectField>
        </div>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState title="No certificates match" icon={<Award size={18} />} />
      ) : query.data ? (
        <Card padded={false}>
          <DataTable caption="Certificates">
            <thead>
              <tr>
                <Th>Certificate</Th>
                <Th>Holder</Th>
                <Th>Course</Th>
                <Th align="right">Score</Th>
                <Th>Issued</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((certificate) => (
                <tr key={certificate.id} className="hover:bg-slate-50/60">
                  <Td className="font-mono text-xs font-bold text-navy">{certificate.certificateNumber}</Td>
                  <Td className="font-semibold text-navy">{certificate.holderName}</Td>
                  <Td>{certificate.courseTitle}</Td>
                  <Td align="right">{certificate.score !== null ? `${certificate.score}%` : '-'}</Td>
                  <Td className="whitespace-nowrap text-xs">{formatDate(certificate.issuedAt)}</Td>
                  <Td>
                    {certificate.status === 'VALID' ? (
                      <Badge tone="success">Valid</Badge>
                    ) : (
                      <span title={certificate.revokedReason ?? undefined}>
                        <Badge tone="danger">
                          <ShieldAlert size={11} aria-hidden /> Revoked
                        </Badge>
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton label={`Download PDF of ${certificate.certificateNumber}`} onClick={() => download.mutate(certificate)}>
                        <Download size={16} />
                      </IconButton>
                      <a href={`/verify/${certificate.certificateNumber}`} target="_blank" rel="noopener noreferrer" aria-label={`Open the public verification page for ${certificate.certificateNumber} (new tab)`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-navy">
                        <ExternalLink size={16} />
                      </a>
                      {certificate.status === 'VALID' ? (
                        <Button size="sm" variant="danger" onClick={() => setRevoking(certificate)}>
                          Revoke
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<RotateCcw size={13} />}
                          onClick={async () => {
                            if (await confirm({ title: 'Reinstate this certificate?', message: `${certificate.certificateNumber} will be reported as valid again.`, confirmLabel: 'Reinstate' })) reinstate.mutate(certificate.id);
                          }}
                        >
                          Reinstate
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination meta={query.data.meta} onPage={setPage} label="Certificate pages" />
        </Card>
      ) : null}
      {revoking && <RevokeDialog certificate={revoking} onClose={() => setRevoking(null)} />}
    </div>
  );
}
