import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';

// ---------------------------------------------------------------------------------------------
// Deterministic randomness: the same seed always builds the same demo organisation.
// ---------------------------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(probability: number): boolean {
    return this.next() < probability;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j] as T, result[i] as T];
    }
    return result;
  }
  /** Approximately normal (Box-Muller). */
  gaussian(mean: number, sd: number): number {
    const u = Math.max(this.next(), 1e-9);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const DAY = 24 * 60 * 60 * 1000;
export const daysAgo = (days: number, now: Date) => new Date(now.getTime() - days * DAY);

// ---------------------------------------------------------------------------------------------
// Minimal PNG encoder (no dependencies) used to generate course cover images.
// ---------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export type Rgb = [number, number, number];

/**
 * A radar-inspired cover: a diagonal gradient with concentric range rings and a sweep line,
 * tinted with the course category colour.
 */
export function coverPng(width: number, height: number, from: Rgb, to: Rgb, seed: number): Buffer {
  const rng = new Rng(seed);
  const cx = width * (0.62 + rng.float() * 0.2);
  const cy = height * (0.35 + rng.float() * 0.3);
  const sweep = rng.float() * Math.PI * 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      let r = from[0] + (to[0] - from[0]) * t;
      let g = from[1] + (to[1] - from[1]) * t;
      let b = from[2] + (to[2] - from[2]) * t;
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      // range rings
      const ring = Math.abs(((distance % 46) + 46) % 46 - 23);
      const ringStrength = ring < 1.4 ? 0.22 : 0;
      // sweep wedge
      const angle = Math.atan2(dy, dx);
      const delta = ((angle - sweep + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const wedge = delta > -0.55 && delta < 0 && distance < 260 ? 0.18 * (1 + delta / 0.55) : 0;
      // soft echoes
      const echo = Math.max(0, 1 - Math.hypot(dx - 70, dy + 30) / 60) * 0.25 + Math.max(0, 1 - Math.hypot(dx + 90, dy - 40) / 45) * 0.2;
      const lift = ringStrength + wedge + echo;
      r = clamp(r + (255 - r) * lift, 0, 255);
      g = clamp(g + (255 - g) * lift, 0, 255);
      b = clamp(b + (255 - b) * lift, 0, 255);
      const offset = row + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------------------
// PDF handbook (real, readable document attached to the first module of every course)
// ---------------------------------------------------------------------------------------------

export interface HandbookInput {
  title: string;
  category: string;
  difficulty: string;
  trainer: string;
  description: string;
  outcomes: string[];
  modules: { title: string; description: string; notes: string }[];
}

export function handbookPdf(input: HandbookInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `${input.title} - Course Handbook`, Author: 'Capacity Connect - IMD' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#0B1F3A';
    const sky = '#2D8CFF';
    const muted = '#52667A';

    doc.rect(0, 0, doc.page.width, 150).fill(navy);
    doc.fillColor('#8FB8E8').font('Helvetica-Bold').fontSize(9).text('INDIA METEOROLOGICAL DEPARTMENT  •  CAPACITY CONNECT', 56, 46, { characterSpacing: 1.2 });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text(input.title, 56, 68, { width: doc.page.width - 112 });
    doc.fillColor('#BBD3F0').font('Helvetica').fontSize(11).text(`Course handbook  •  ${input.category}  •  ${input.difficulty.charAt(0)}${input.difficulty.slice(1).toLowerCase()}`, 56, 120);

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(13).text('About this course', 56, 176);
    doc.fillColor('#33475B').font('Helvetica').fontSize(11).text(input.description, { lineGap: 3 });
    doc.moveDown(0.6).fillColor(muted).fontSize(10).text(`Trainer: ${input.trainer}`);

    doc.moveDown(1.2).fillColor(navy).font('Helvetica-Bold').fontSize(13).text('What you will be able to do');
    doc.moveDown(0.4).fillColor('#33475B').font('Helvetica').fontSize(11);
    for (const outcome of input.outcomes) doc.text(`•  ${outcome}`, { lineGap: 3, indent: 6 });

    doc.moveDown(1.2).fillColor(navy).font('Helvetica-Bold').fontSize(13).text('Modules and key notes');
    input.modules.forEach((module, index) => {
      doc.moveDown(0.8).fillColor(sky).font('Helvetica-Bold').fontSize(11).text(`Module ${index + 1}`, { continued: true }).fillColor(navy).text(`   ${module.title}`);
      doc.moveDown(0.2).fillColor(muted).font('Helvetica-Oblique').fontSize(10).text(module.description);
      doc.moveDown(0.2).fillColor('#33475B').font('Helvetica').fontSize(10.5).text(module.notes, { lineGap: 2.5 });
    });

    doc.moveDown(1.5).fillColor(muted).font('Helvetica').fontSize(9).text('This handbook summarises the course notes. Work through every module on the platform, then take the assessment to earn your competency update and certificate.', { lineGap: 2 });
    doc.end();
  });
}
