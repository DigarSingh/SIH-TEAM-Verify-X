import { api, openBlob, saveBlob } from '../api/client';
import type { Certificate, CertificateVerification, PageMeta } from '../types';

export const fetchMyCertificates = async () => (await api.get<Certificate[]>('/certificates/me')).data;
export const verifyCertificate = async (id: string) => (await api.get<CertificateVerification>(`/certificates/verify/${encodeURIComponent(id)}`)).data;

export async function fetchAllCertificates(params: { page: number; pageSize: number; q?: string; status?: string }) {
  const { data, meta } = await api.get<Certificate[]>('/certificates', { page: params.page, pageSize: params.pageSize, q: params.q, status: params.status });
  return { items: data, meta: meta as PageMeta };
}

/** Downloads (or opens) the PDF through the API so authorization errors surface as messages, not blank pages. */
export async function downloadCertificatePdf(certificate: Pick<Certificate, 'id' | 'certificateNumber'>, mode: 'download' | 'open' = 'download') {
  const { blob, fileName } = await api.blob(`/certificates/${certificate.id}/pdf`);
  if (mode === 'open') openBlob(blob);
  else saveBlob(blob, fileName ?? `certificate-${certificate.certificateNumber}.pdf`);
}

export async function fetchCertificateQr(id: string): Promise<string> {
  const { blob } = await api.blob(`/certificates/${id}/qr`);
  return URL.createObjectURL(blob);
}

export const revokeCertificate = async (id: string, reason: string) => (await api.post<Certificate>(`/certificates/${id}/revoke`, { reason })).data;
export const reinstateCertificate = async (id: string) => (await api.post<Certificate>(`/certificates/${id}/reinstate`)).data;
