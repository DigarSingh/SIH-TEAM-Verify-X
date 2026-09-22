import type { Certificate } from '@prisma/client';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { verificationUrl } from './certificate.service';

const NAVY = '#0B1F3A';
const SKY = '#2D8CFF';
const TEAL = '#0EA5A8';
const MUTED = '#52667A';

/**
 * PDFKit's built-in fonts cover Latin (WinAnsi) only. Accents are stripped and
 * anything else is replaced so a name never renders as garbage glyphs.
 */
export function pdfSafe(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
}

const formatDate = (date: Date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date);

/** QR code (PNG) encoding the public verification URL of a certificate. */
export function certificateQrPng(certificateNumber: string): Promise<Buffer> {
  return QRCode.toBuffer(verificationUrl(certificateNumber), { errorCorrectionLevel: 'M', margin: 1, width: 360, type: 'png' });
}

/** Renders the certificate as an A4 landscape PDF (returned as a Buffer). */
export async function renderCertificatePdf(certificate: Certificate): Promise<Buffer> {
  const qr = await certificateQrPng(certificate.certificateNumber);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: {
        Title: pdfSafe(`Certificate - ${certificate.courseTitle}`),
        Author: pdfSafe(certificate.issuer),
        Subject: 'Certificate of Completion',
        Keywords: certificate.certificateNumber,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width;
    const height = doc.page.height;
    const centre = (text: string, y: number, options: PDFKit.Mixins.TextOptions = {}) => doc.text(text, 60, y, { width: width - 120, align: 'center', ...options });

    // ---- frame ------------------------------------------------------------------------------
    doc.rect(0, 0, width, height).fill('#FFFFFF');
    doc.lineWidth(10).strokeColor(NAVY).rect(22, 22, width - 44, height - 44).stroke();
    doc.lineWidth(1.5).strokeColor(SKY).rect(36, 36, width - 72, height - 72).stroke();
    doc.rect(36, 36, width - 72, 6).fill(TEAL);

    // ---- header -----------------------------------------------------------------------------
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9);
    centre('GOVERNMENT OF INDIA  •  MINISTRY OF EARTH SCIENCES', 62, { characterSpacing: 1.5 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24);
    centre('INDIA METEOROLOGICAL DEPARTMENT', 80);
    doc.fillColor(SKY).font('Helvetica-Bold').fontSize(10);
    centre('CAPACITY CONNECT  •  COMPETENCY DEVELOPMENT PLATFORM', 112, { characterSpacing: 1.2 });

    // ---- title --------------------------------------------------------------------------------------
    doc.fillColor(NAVY).font('Times-Italic').fontSize(44);
    centre('Certificate of Completion', 140);

    doc.fillColor(MUTED).font('Helvetica').fontSize(13);
    centre('This is to certify that', 202);

    // ---- holder --------------------------------------------------------------------------------------
    doc.fillColor(NAVY).font('Times-Bold').fontSize(38);
    centre(pdfSafe(certificate.holderName), 226, { lineBreak: false });
    doc.lineWidth(1).strokeColor(SKY).moveTo(width / 2 - 190, 276).lineTo(width / 2 + 190, 276).stroke();

    doc.fillColor(MUTED).font('Helvetica').fontSize(13);
    centre('has successfully completed the course', 288);

    // ---- course ----------------------------------------------------------------------------------------
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24);
    centre(pdfSafe(certificate.courseTitle), 312, { width: width - 200, lineGap: 2 });
    const scoreLine = certificate.score === null ? 'Course requirements fulfilled' : `Assessment score: ${Math.round(certificate.score * 10) / 10}%`;
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13);
    centre(scoreLine, 356);

    // ---- footer ------------------------------------------------------------------------------------------
    const footerY = height - 150;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    doc.text('DATE OF ISSUE', 90, footerY, { characterSpacing: 1 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(formatDate(certificate.issuedAt), 90, footerY + 14);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('CERTIFICATE ID', 90, footerY + 44, { characterSpacing: 1 });
    doc.fillColor(NAVY).font('Courier-Bold').fontSize(14).text(certificate.certificateNumber, 90, footerY + 58);

    doc.lineWidth(0.8).strokeColor(MUTED).moveTo(width / 2 - 110, footerY + 44).lineTo(width / 2 + 110, footerY + 44).stroke();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('Capacity Building Division', width / 2 - 110, footerY + 50, { width: 220, align: 'center' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(pdfSafe(certificate.issuer), width / 2 - 150, footerY + 64, { width: 300, align: 'center' });

    doc.image(qr, width - 90 - 96, footerY - 8, { width: 96, height: 96 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Scan to verify', width - 90 - 96, footerY + 92, { width: 96, align: 'center' });

    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
    centre(`Verify this certificate at ${verificationUrl(certificate.certificateNumber)}`, height - 58);

    doc.end();
  });
}
