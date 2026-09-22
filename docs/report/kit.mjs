/**
 * Shared helpers for building the project report.
 *
 * Figure and table numbers are derived from the chapter they appear in, so
 * inserting a figure never means renumbering anything by hand. The registries
 * are also what the List of Figures and List of Tables are generated from.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = 'D:/Capacity Connect';
export const SHOTS = path.join(ROOT, 'docs/screenshots');
export const DIAGRAMS = path.join(ROOT, 'docs/report/diagrams');

export const figures = [];
export const tables = [];
export const missingAssets = [];
/** Every heading that should appear in the table of contents, in document order. */
export const toc = [];

let chapter = 0;
let figureNo = 0;
let tableNo = 0;
let headingNo = 0;

/** Starts a numbered chapter and resets the figure/table counters. */
export function startChapter(n) {
  chapter = typeof n === 'number' ? n : n;
  figureNo = 0;
  tableNo = 0;
  headingNo = 0;
}

/** Opens a numbered chapter: registers it for the contents and prints its heading. */
export function chapterOpen(n, title) {
  startChapter(n);
  const id = `ch-${n}`;
  toc.push({ level: 1, id, number: String(n), title, kind: 'chapter' });
  return `<section class="chapter" id="${id}">
  <header class="chhead"><div class="chno">Chapter ${n}</div><h1>${md(title)}</h1></header>`;
}

/** Opens a lettered appendix. Figures and tables inside it number A.1, A.2, ... */
export function appendixOpen(letter, title) {
  startChapter(letter);
  const id = `app-${letter}`;
  toc.push({ level: 1, id, number: letter, title, kind: 'appendix' });
  return `<section class="chapter appendix" id="${id}">
  <header class="chhead"><div class="chno">Appendix ${letter}</div><h1>${md(title)}</h1></header>`;
}

export const chapterClose = '</section>';

/** A front-matter entry (Abstract, Contents, ...) that is listed but not numbered. */
export function tocFront(id, title) {
  toc.push({ level: 0, id, number: '', title, kind: 'front' });
}

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Light inline markup: **bold**, `code`, *italic*. Keeps the prose readable in source. */
export function md(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');
}

export const p = (...paras) => paras.map((t) => `<p>${md(t)}</p>`).join('\n');

/** A numbered section heading. It registers itself in the table of contents. */
export function h2(t) {
  headingNo += 1;
  const number = `${chapter}.${headingNo}`;
  const id = `sec-${chapter}-${headingNo}`;
  toc.push({ level: 2, id, number, title: t, kind: 'section' });
  return `<h2 id="${id}"><span class="secno">${number}</span> ${md(t)}</h2>`;
}
export const h3 = (t) => `<h3>${md(t)}</h3>`;
export const ul = (items) => `<ul>${items.map((i) => `<li>${md(i)}</li>`).join('')}</ul>`;
export const ol = (items) => `<ol>${items.map((i) => `<li>${md(i)}</li>`).join('')}</ol>`;
export const note = (title, body) => `<div class="note"><strong>${md(title)}</strong> ${md(body)}</div>`;
export const warn = (title, body) => `<div class="warn"><strong>${md(title)}</strong> ${md(body)}</div>`;

/** A monospaced block, for formulas, payloads and directory trees. */
export const pre = (content, label) =>
  `<div class="prewrap">${label ? `<div class="prelabel">${esc(label)}</div>` : ''}<pre>${esc(content)}</pre></div>`;

/** A centred flow of boxes joined by arrows, for the small process chains in the prose. */
export const chain = (steps, { vertical = false } = {}) =>
  `<div class="chain${vertical ? ' vertical' : ''}">${steps.map((s) => `<span class="chip">${md(s)}</span>`).join(vertical ? '<span class="down">&darr;</span>' : '<span class="to">&rarr;</span>')}</div>`;

/**
 * A screenshot or diagram with a numbered caption and an explanation.
 * `size` controls how much page height it may take: full, half or wide.
 */
export function figure(file, caption, explanation, { size = 'full', diagram = false } = {}) {
  figureNo += 1;
  const id = `fig-${chapter}-${figureNo}`;
  const number = `${chapter}.${figureNo}`;
  const abs = path.join(diagram ? DIAGRAMS : SHOTS, file);
  if (!existsSync(abs)) missingAssets.push(abs);
  figures.push({ id, number, caption, file });
  const src = `file:///${abs.replace(/\\/g, '/')}`;
  return `<figure class="fig ${size} ${diagram ? 'diagram' : 'shot'}" id="${id}">
  <img src="${src}" alt="${esc(caption)}"/>
  <figcaption><span class="figno">Figure ${number}</span> ${md(caption)}</figcaption>
  ${explanation ? `<div class="figexp">${md(explanation)}</div>` : ''}
</figure>`;
}

/** Two figures side by side, for related screens that stay readable at half width. */
export function figurePair(a, b) {
  return `<div class="figpair">${a}${b}</div>`;
}

export function table(caption, headers, rows, { className = '', widths = null } = {}) {
  tableNo += 1;
  const id = `tbl-${chapter}-${tableNo}`;
  const number = `${chapter}.${tableNo}`;
  tables.push({ id, number, caption });
  const cols = widths ? `<colgroup>${widths.map((w) => `<col style="width:${w}"/>`).join('')}</colgroup>` : '';
  return `<div class="tablewrap" id="${id}">
  <div class="tblcap"><span class="tblno">Table ${number}</span> ${md(caption)}</div>
  <table class="${className}">${cols}
    <thead><tr>${headers.map((h) => `<th>${md(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${md(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</div>`;
}

/** Implementation-status pill, used consistently across the report. */
export function status(kind) {
  const map = {
    IMPLEMENTED: 'ok',
    'PARTIALLY IMPLEMENTED': 'partial',
    SIMULATED: 'sim',
    PLANNED: 'planned',
    'NOT VERIFIED': 'unverified',
  };
  return `<span class="pill ${map[kind] ?? 'planned'}">${esc(kind)}</span>`;
}

export const pageBreak = '<div class="pagebreak"></div>';
