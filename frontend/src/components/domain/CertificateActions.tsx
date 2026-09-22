import { useMutation } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { downloadCertificatePdf, fetchCertificateQr } from '../../services/certificates';
import { Button, IconButton, Modal, Spinner, useToast } from '../ui';

interface CertificateLike {
  id: string;
  certificateNumber: string;
}

export function verificationLink(certificateNumber: string): string {
  return `${window.location.origin}/verify/${certificateNumber}`;
}

/** Download / copy-link / QR actions for one certificate. */
export function CertificateActions({ certificate, compact = false }: { certificate: CertificateLike; compact?: boolean }) {
  const toast = useToast();
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const download = useMutation({ mutationFn: () => downloadCertificatePdf(certificate), onError: (error) => toast.error(errorMessage(error)) });
  const open = useMutation({ mutationFn: () => downloadCertificatePdf(certificate, 'open'), onError: (error) => toast.error(errorMessage(error)) });

  useEffect(() => {
    if (!qrOpen || qrUrl) return undefined;
    let revoked: string | null = null;
    fetchCertificateQr(certificate.id)
      .then((url) => {
        revoked = url;
        setQrUrl(url);
      })
      .catch((error) => setQrError(errorMessage(error)));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [qrOpen, qrUrl, certificate.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verificationLink(certificate.certificateNumber));
      toast.success('Verification link copied to the clipboard');
    } catch {
      toast.info(`Verification link: ${verificationLink(certificate.certificateNumber)}`);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {compact ? (
          <>
            <IconButton label="Download certificate PDF" onClick={() => download.mutate()} disabled={download.isPending}>
              <Download size={16} />
            </IconButton>
            <IconButton label="Show QR code" onClick={() => setQrOpen(true)}>
              <QrCode size={16} />
            </IconButton>
          </>
        ) : (
          <>
            <Button size="sm" loading={download.isPending} onClick={() => download.mutate()} leftIcon={<Download size={14} />}>
              Download PDF
            </Button>
            <Button size="sm" variant="secondary" loading={open.isPending} onClick={() => open.mutate()} leftIcon={<ExternalLink size={14} />}>
              Open
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setQrOpen(true)} leftIcon={<QrCode size={14} />}>
              QR code
            </Button>
            <Button size="sm" variant="ghost" onClick={copy} leftIcon={<Copy size={14} />}>
              Copy link
            </Button>
          </>
        )}
      </div>
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="Verification QR code" description="Anyone can scan this to confirm the certificate is genuine." size="sm">
        <div className="flex flex-col items-center gap-4 text-center">
          {qrError ? (
            <p className="text-sm text-red-600">{qrError}</p>
          ) : qrUrl ? (
            <img src={qrUrl} alt={`QR code that opens the verification page for certificate ${certificate.certificateNumber}`} className="h-56 w-56 rounded-xl border border-slate-100 p-2" />
          ) : (
            <Spinner label="Generating QR code" />
          )}
          <p className="font-mono text-sm font-bold text-navy">{certificate.certificateNumber}</p>
          <p className="break-all text-xs text-slate-500">{verificationLink(certificate.certificateNumber)}</p>
          <Button variant="secondary" size="sm" onClick={copy} leftIcon={<Copy size={14} />}>
            Copy verification link
          </Button>
        </div>
      </Modal>
    </>
  );
}
