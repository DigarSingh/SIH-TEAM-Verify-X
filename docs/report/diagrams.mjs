/**
 * Diagrams for the project report, generated as SVG.
 *
 * SVG rather than raster images because the report is printed: vectors stay
 * sharp at any zoom and the text is selectable. Every diagram here is drawn
 * from the actual implementation - the module names, endpoints, tables and call
 * order all correspond to code in this repository.
 *
 *   node docs/report/diagrams.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'diagrams');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Palette and primitives
// ---------------------------------------------------------------------------------------------

const C = {
  navy: '#0B1F3A',
  sky: '#2D8CFF',
  skyDeep: '#1B6FD1',
  teal: '#0EA5A8',
  amber: '#F59E0B',
  violet: '#7C3AED',
  coral: '#EA6A47',
  green: '#10B981',
  slate: '#64748B',
  line: '#CBD5E1',
  ink: '#102A43',
  paper: '#FFFFFF',
  tint: '#F1F5F9',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Greedy wrap by approximate character width. */
function wrap(text, width, size) {
  const perChar = size * 0.55;
  const max = Math.max(4, Math.floor(width / perChar));
  const out = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    if (!line.length) line = word;
    else if ((line + ' ' + word).length <= max) line += ' ' + word;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

function text(x, y, content, { size = 12, weight = 400, fill = C.ink, anchor = 'middle', family = 'Inter, Segoe UI, sans-serif' } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(content)}</text>`;
}

/** A labelled box. `sub` lines are smaller and sit under the title. */
function box(x, y, w, h, label, { sub = [], fill = C.paper, stroke = C.line, titleSize = 12.5, weight = 700, radius = 8, titleFill = C.ink } = {}) {
  const lines = wrap(label, w - 14, titleSize);
  const subLines = sub.flatMap((s) => wrap(s, w - 14, 10.5));
  const blockHeight = lines.length * (titleSize + 3) + (subLines.length ? subLines.length * 13 + 4 : 0);
  let cursor = y + h / 2 - blockHeight / 2 + titleSize;
  const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`];
  for (const line of lines) {
    parts.push(text(x + w / 2, cursor, line, { size: titleSize, weight, fill: titleFill }));
    cursor += titleSize + 3;
  }
  cursor += subLines.length ? 3 : 0;
  for (const line of subLines) {
    parts.push(text(x + w / 2, cursor, line, { size: 10.5, weight: 400, fill: C.slate }));
    cursor += 13;
  }
  return parts.join('');
}

const arrowDefs = `
<defs>
  <marker id="ah" markerWidth="9" markerHeight="9" refX="8" refY="3.2" orient="auto">
    <path d="M0,0 L8,3.2 L0,6.4 z" fill="${C.slate}"/>
  </marker>
  <marker id="ahs" markerWidth="9" markerHeight="9" refX="8" refY="3.2" orient="auto">
    <path d="M0,0 L8,3.2 L0,6.4 z" fill="${C.sky}"/>
  </marker>
  <marker id="ahOpen" markerWidth="10" markerHeight="10" refX="9" refY="3.5" orient="auto">
    <path d="M0,0 L9,3.5 L0,7" fill="none" stroke="${C.slate}" stroke-width="1.3"/>
  </marker>
</defs>`;

function line(x1, y1, x2, y2, { stroke = C.slate, dash = null, marker = 'ah', width = 1.3 } = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker ? ` marker-end="url(#${marker})"` : ''}/>`;
}

/** Orthogonal connector: down, across, down. */
function elbow(x1, y1, x2, y2, { stroke = C.slate, marker = 'ah' } = {}) {
  const mid = (y1 + y2) / 2;
  return `<path d="M${x1},${y1} L${x1},${mid} L${x2},${mid} L${x2},${y2}" fill="none" stroke="${stroke}" stroke-width="1.3" marker-end="url(#${marker})"/>`;
}

function svg(width, height, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
${arrowDefs}
<rect width="${width}" height="${height}" fill="${C.paper}"/>
${body}
</svg>`;
}

const save = (name, content) => {
  writeFileSync(path.join(OUT, `${name}.svg`), content);
  return name;
};

const made = [];
const emit = (name, width, height, body, title) => made.push(save(name, svg(width, height, body, title)));

// ---------------------------------------------------------------------------------------------
// 1. Traditional LMS vs Capacity Connect
// ---------------------------------------------------------------------------------------------
{
  const W = 900;
  const b = [];
  b.push(text(225, 26, 'Traditional LMS', { size: 14, weight: 700, fill: C.slate }));
  const trad = ['Course', 'Completion', 'Certificate'];
  trad.forEach((label, i) => {
    const y = 50 + i * 76;
    b.push(box(120, y, 210, 46, label, { fill: C.tint }));
    if (i < trad.length - 1) b.push(line(225, y + 46, 225, y + 74));
  });
  b.push(text(225, 300, 'Completion is the outcome.', { size: 11, fill: C.slate }));

  b.push(`<line x1="450" y1="16" x2="450" y2="560" stroke="${C.line}" stroke-dasharray="4 4"/>`);

  b.push(text(675, 26, 'Capacity Connect', { size: 14, weight: 700, fill: C.skyDeep }));
  const chain = [
    ['Employee', 'Role'],
    ['Required competency', 'Current competency'],
    ['Skill gap', 'Recommendation'],
    ['Learning', 'Assessment'],
    ['Competency update', 'Certification'],
    ['Monitoring (decay)', 'Refresher'],
    ['Readiness', null],
  ];
  chain.forEach(([left, right], i) => {
    const y = 46 + i * 72;
    b.push(box(500, y, 158, 42, left, { fill: i === 6 ? '#EAF4FF' : C.paper, stroke: i === 6 ? C.sky : C.line }));
    if (right) b.push(box(676, y, 158, 42, right, { fill: C.paper }));
    if (right) b.push(line(658, y + 21, 674, y + 21, { marker: 'ahs', stroke: C.sky }));
    if (i < chain.length - 1) b.push(line(579, y + 42, 579, y + 70, { stroke: C.sky, marker: 'ahs' }));
    if (right && i < chain.length - 1) b.push(`<path d="M755,${y + 42} L755,${y + 56} L579,${y + 56}" fill="none" stroke="${C.line}" stroke-width="1"/>`);
  });
  b.push(text(675, 562, 'Competence, kept current, is the outcome.', { size: 11, fill: C.slate }));
  emit('flow-comparison', W, 580, b.join('\n'), 'Traditional LMS compared with the Capacity Connect competency loop');
}

// ---------------------------------------------------------------------------------------------
// 2. System architecture
// ---------------------------------------------------------------------------------------------
{
  const W = 980;
  const b = [];
  const band = (y, h, label, fill) => {
    b.push(`<rect x="24" y="${y}" width="${W - 48}" height="${h}" rx="10" fill="${fill}" stroke="${C.line}"/>`);
    b.push(text(40, y + 18, label, { size: 11, weight: 700, fill: C.slate, anchor: 'start' }));
  };

  // Clients
  band(20, 116, 'CLIENTS', '#F8FAFC');
  b.push(box(48, 44, 210, 74, 'Desktop / laptop browser', { sub: ['React 19 - Vite 6 - Tailwind', 'Interactive 3D fallback'], fill: C.paper }));
  b.push(box(276, 44, 210, 74, 'Android phone (Chrome)', { sub: ['WebXR via <model-viewer>', 'AR placement on a surface'], fill: C.paper }));
  b.push(box(504, 44, 210, 74, 'Installed PWA', { sub: ['Service worker, app-shell cache', 'IndexedDB: saved courses, queue'], fill: C.paper }));
  b.push(box(732, 44, 200, 74, 'Public verifier', { sub: ['QR / verification link', 'No sign-in required'], fill: C.paper }));

  // Edge
  band(156, 78, 'EDGE', '#F8FAFC');
  b.push(box(48, 178, 420, 48, 'nginx', { sub: ['serves the built SPA, proxies /api, security headers + CSP'], fill: '#EAF4FF', stroke: C.sky }));
  b.push(box(504, 178, 428, 48, 'Static assets', { sub: ['hashed JS/CSS, icons, doppler-radar.glb (56 KB)'], fill: '#EAF4FF', stroke: C.sky }));

  // API
  band(248, 96, 'API - Express 5 (Node 20+, TypeScript)', '#F8FAFC');
  const mws = [
    ['helmet + CSP', 'security headers'],
    ['CORS + CSRF', 'X-Requested-With'],
    ['Rate limiting', 'per route group'],
    ['authenticate', 'JWT in HttpOnly cookie'],
    ['requireRole', 'RBAC per route'],
    ['Zod validation', 'every request body'],
  ];
  mws.forEach(([t, s], i) => b.push(box(48 + i * 148, 272, 136, 62, t, { sub: [s], titleSize: 11, fill: C.paper })));

  // Domain services
  band(360, 150, 'DOMAIN SERVICES', '#F8FAFC');
  const svcs = [
    ['Competency engine', 'skill gap, priority,\nupdate, decay, freshness', C.sky],
    ['Assessment engine', 'attempts, MCQ + practical\nscoring, idempotency', C.teal],
    ['Certificate engine', 'PDF, QR, Ed25519\nsigning + verification', C.violet],
    ['Readiness engine', 'events, sprints,\nindex, succession', C.amber],
    ['AR lab service', 'marking, theory/practical\nweighting, refresher', C.coral],
    ['Support services', 'recommendations, analytics,\nnotifications, audit, AI (optional)', C.slate],
  ];
  svcs.forEach(([t, s, colour], i) => {
    const x = 48 + (i % 3) * 296;
    const y = 384 + Math.floor(i / 3) * 62;
    b.push(box(x, y, 284, 54, t, { sub: s.split('\n'), fill: C.paper, stroke: colour, titleSize: 11.5 }));
  });

  // Data
  band(524, 96, 'DATA', '#F8FAFC');
  b.push(box(48, 548, 300, 58, 'PostgreSQL 17', { sub: ['48 models, 24 enums, 10 migrations', 'accessed only through Prisma 6'], fill: '#EAF4FF', stroke: C.navy }));
  b.push(box(364, 548, 280, 58, 'File storage', { sub: ['uploads/ on disk (local driver)', 's3 driver selectable by env'], fill: '#EAF4FF', stroke: C.navy }));
  b.push(box(660, 548, 272, 58, 'SystemSetting', { sub: ['engine.config: every threshold', 'and weight, editable by an admin'], fill: '#EAF4FF', stroke: C.navy }));

  // connectors
  b.push(line(490, 118, 490, 176, { marker: 'ahs', stroke: C.sky }));
  b.push(line(490, 226, 490, 270, { marker: 'ahs', stroke: C.sky }));
  b.push(line(490, 334, 490, 382, { marker: 'ahs', stroke: C.sky }));
  b.push(line(490, 500, 490, 546, { marker: 'ahs', stroke: C.sky }));
  b.push(text(700, 250, 'HTTPS - JSON envelope { success, data, meta }', { size: 10, fill: C.slate }));

  emit('architecture', W, 626, b.join('\n'), 'Capacity Connect system architecture');
}

// ---------------------------------------------------------------------------------------------
// 3. ER diagram - core
// ---------------------------------------------------------------------------------------------
function erDiagram(name, title, entities, relations, W, H) {
  const b = [];
  const at = {};
  for (const e of entities) {
    at[e.name] = e;
    const h = 30 + e.fields.length * 14;
    b.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${h}" rx="7" fill="${C.paper}" stroke="${e.colour ?? C.navy}" stroke-width="1.4"/>`);
    b.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="24" rx="7" fill="${e.colour ?? C.navy}"/>`);
    b.push(`<rect x="${e.x}" y="${e.y + 16}" width="${e.w}" height="8" fill="${e.colour ?? C.navy}"/>`);
    b.push(text(e.x + e.w / 2, e.y + 16.5, e.name, { size: 11.5, weight: 700, fill: '#fff' }));
    e.fields.forEach((f, i) => {
      const bold = f.startsWith('*');
      b.push(text(e.x + 8, e.y + 39 + i * 14, bold ? f.slice(1) : f, { size: 9.5, anchor: 'start', fill: bold ? C.ink : C.slate, weight: bold ? 700 : 400 }));
    });
    e.h = h;
  }
  for (const [from, to, label, style] of relations) {
    const a = at[from];
    const z = at[to];
    if (!a || !z) continue;
    const ax = a.x + a.w / 2;
    const zx = z.x + z.w / 2;
    const ay = a.y + a.h / 2;
    const zy = z.y + z.h / 2;
    const horizontal = Math.abs(ax - zx) > Math.abs(ay - zy);
    const x1 = horizontal ? (ax < zx ? a.x + a.w : a.x) : ax;
    const y1 = horizontal ? ay : ay < zy ? a.y + a.h : a.y;
    const x2 = horizontal ? (ax < zx ? z.x : z.x + z.w) : zx;
    const y2 = horizontal ? zy : ay < zy ? z.y : z.y + z.h;
    b.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.slate}" stroke-width="1.1"${style === 'dashed' ? ' stroke-dasharray="4 3"' : ''}/>`);
    b.push(`<rect x="${(x1 + x2) / 2 - 16}" y="${(y1 + y2) / 2 - 8}" width="32" height="15" rx="3" fill="${C.paper}" opacity="0.95"/>`);
    b.push(text((x1 + x2) / 2, (y1 + y2) / 2 + 3.5, label, { size: 9, fill: C.slate, weight: 700 }));
  }
  emit(name, W, H, b.join('\n'), title);
}

erDiagram(
  'er-core',
  'Entity relationships: identity, competency framework, learning and certification',
  [
    { name: 'User', x: 40, y: 40, w: 175, fields: ['*id', 'email (unique)', 'passwordHash', 'role', 'status', 'departmentId', 'jobRoleId', 'retirementDate', 'careerLevel', 'deletedAt'] },
    { name: 'Department', x: 40, y: 250, w: 150, fields: ['*id', 'code (unique)', 'name', 'isActive'], colour: C.teal },
    { name: 'JobRole', x: 40, y: 360, w: 150, fields: ['*id', 'code (unique)', 'name', 'criticality'], colour: C.teal },
    { name: 'RoleCompetency', x: 250, y: 360, w: 165, fields: ['*id', 'roleId', 'competencyId', 'requiredLevel', 'importance'], colour: C.teal },
    { name: 'Competency', x: 470, y: 350, w: 165, fields: ['*id', 'code (unique)', 'name', 'category', 'levelDescriptors', 'isActive'], colour: C.teal },
    { name: 'EmployeeCompetency', x: 250, y: 40, w: 180, fields: ['*id', 'userId', 'competencyId', 'currentLevel', 'lastEvidenceAt', 'lastPracticedAt'], colour: C.sky },
    { name: 'CompetencyHistory', x: 470, y: 40, w: 175, fields: ['*id', 'userId', 'competencyId', 'previousLevel', 'newLevel', 'source', 'details (json)', 'createdAt'], colour: C.sky },
    { name: 'Course', x: 700, y: 210, w: 165, fields: ['*id', 'title', 'status', 'difficulty', 'trainerId', 'passingScore', 'deletedAt'], colour: C.violet },
    { name: 'CourseCompetency', x: 700, y: 350, w: 165, fields: ['*id', 'courseId', 'competencyId', 'levelFrom', 'levelTo'], colour: C.violet },
    { name: 'Module', x: 700, y: 470, w: 165, fields: ['*id', 'courseId', 'title', 'position'], colour: C.violet },
    { name: 'LearningMaterial', x: 700, y: 570, w: 165, fields: ['*id', 'moduleId', 'type', 'url / content', 'extractedText'], colour: C.violet },
    { name: 'Enrollment', x: 470, y: 470, w: 165, fields: ['*id', 'userId', 'courseId', 'status', 'progress'], colour: C.violet },
    { name: 'Assessment', x: 250, y: 470, w: 165, fields: ['*id', 'courseId (unique)', 'passingScore', 'maxAttempts', 'mcqWeight', 'isPublished'], colour: C.amber },
    { name: 'Question', x: 40, y: 470, w: 165, fields: ['*id', 'assessmentId', 'text', 'type', 'marks'], colour: C.amber },
    { name: 'AssessmentAttempt', x: 40, y: 600, w: 180, fields: ['*id', 'assessmentId', 'userId', 'percentage', 'mcqPercentage', 'practicalPercentage', 'idempotencyKey', 'passed'], colour: C.amber },
    { name: 'Certificate', x: 470, y: 600, w: 180, fields: ['*id', 'certificateNumber', 'userId', 'courseId', 'signature', 'signatureKeyId', 'signedCompetencies', 'status'], colour: C.green },
  ],
  [
    ['User', 'EmployeeCompetency', '1:N'],
    ['EmployeeCompetency', 'CompetencyHistory', '1:N'],
    ['User', 'Department', 'N:1'],
    ['User', 'JobRole', 'N:1'],
    ['JobRole', 'RoleCompetency', '1:N'],
    ['RoleCompetency', 'Competency', 'N:1'],
    ['EmployeeCompetency', 'Competency', 'N:1'],
    ['Course', 'CourseCompetency', '1:N'],
    ['CourseCompetency', 'Competency', 'N:1'],
    ['Course', 'Module', '1:N'],
    ['Module', 'LearningMaterial', '1:N'],
    ['Course', 'Enrollment', '1:N'],
    ['Enrollment', 'Assessment', 'N:1', 'dashed'],
    ['Assessment', 'Question', '1:N'],
    ['Assessment', 'AssessmentAttempt', '1:N'],
    ['AssessmentAttempt', 'Certificate', '1:1'],
  ],
  900,
  790,
);

erDiagram(
  'er-readiness-ar',
  'Entity relationships: operational readiness, succession and the AR Instrument Lab',
  [
    { name: 'Competency', x: 350, y: 30, w: 170, fields: ['*id', 'code', 'name', 'category'], colour: C.teal },
    { name: 'CompetencyDecayPolicy', x: 40, y: 30, w: 190, fields: ['*id', 'competencyId (unique)', 'decayEnabled', 'halfLifeDays', 'minimumSafeLevel', 'recertificationIntervalDays', 'criticality', 'isSimulation'], colour: C.sky },
    { name: 'CompetencyPracticeRecord', x: 40, y: 200, w: 190, fields: ['*id', 'userId', 'competencyId', 'practicedAt', 'source', 'note'], colour: C.sky },
    { name: 'Mentorship', x: 40, y: 340, w: 190, fields: ['*id', 'mentorId', 'menteeId', 'competencyId', 'status'], colour: C.amber },
    { name: 'ReadinessEvent', x: 620, y: 30, w: 185, fields: ['*id', 'name', 'hazardType', 'startDate / endDate', 'priority', 'status', 'isSimulation'], colour: C.amber },
    { name: 'ReadinessRequirement', x: 620, y: 185, w: 185, fields: ['*id', 'eventId', 'competencyId', 'requiredLevel', 'importance'], colour: C.amber },
    { name: 'ReadinessAssignment', x: 620, y: 320, w: 185, fields: ['*id', 'eventId', 'userId', 'competencyId', 'status', 'assignedAt'], colour: C.amber },
    { name: 'ARModule', x: 330, y: 200, w: 200, fields: ['*id', 'key (unique)', 'title', 'modelUrl', 'competencyId', 'courseId', 'kind', 'theoryWeight', 'passingScore', 'isSimulation'], colour: C.coral },
    { name: 'ARComponent', x: 330, y: 400, w: 200, fields: ['*id', 'arModuleId', 'key', 'name', 'hotspotPosition (json)', 'isInteractive'], colour: C.coral },
    { name: 'ARTask', x: 330, y: 545, w: 200, fields: ['*id', 'arModuleId', 'phase', 'type', 'instruction', 'correctComponentId', 'points'], colour: C.coral },
    { name: 'ARPracticalAttempt', x: 610, y: 470, w: 200, fields: ['*id', 'arModuleId', 'userId', 'practicalPercentage', 'theoryPercentage', 'combinedPercentage', 'competencyBefore / After', 'idempotencyKey'], colour: C.coral },
    { name: 'ARTaskResponse', x: 610, y: 650, w: 200, fields: ['*id', 'attemptId', 'taskId', 'selectedComponentId', 'correct', 'pointsAwarded'], colour: C.coral },
    { name: 'User', x: 40, y: 480, w: 170, fields: ['*id', 'email', 'role', 'retirementDate'] },
  ],
  [
    ['CompetencyDecayPolicy', 'Competency', '1:1'],
    ['CompetencyPracticeRecord', 'Competency', 'N:1'],
    ['ReadinessEvent', 'ReadinessRequirement', '1:N'],
    ['ReadinessRequirement', 'Competency', 'N:1'],
    ['ReadinessEvent', 'ReadinessAssignment', '1:N'],
    ['ARModule', 'Competency', 'N:1'],
    ['ARModule', 'ARComponent', '1:N'],
    ['ARModule', 'ARTask', '1:N'],
    ['ARTask', 'ARComponent', 'N:1'],
    ['ARModule', 'ARPracticalAttempt', '1:N'],
    ['ARPracticalAttempt', 'ARTaskResponse', '1:N'],
    ['User', 'CompetencyPracticeRecord', '1:N'],
    ['User', 'Mentorship', '1:N'],
    ['User', 'ARPracticalAttempt', '1:N'],
  ],
  860,
  760,
);

// ---------------------------------------------------------------------------------------------
// 4. Use case diagram
// ---------------------------------------------------------------------------------------------
{
  const W = 900;
  const H = 700;
  const b = [];
  const actor = (x, y, label) => {
    const g = [];
    g.push(`<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="${C.navy}" stroke-width="1.6"/>`);
    g.push(`<line x1="${x}" y1="${y + 11}" x2="${x}" y2="${y + 34}" stroke="${C.navy}" stroke-width="1.6"/>`);
    g.push(`<line x1="${x - 14}" y1="${y + 20}" x2="${x + 14}" y2="${y + 20}" stroke="${C.navy}" stroke-width="1.6"/>`);
    g.push(`<line x1="${x}" y1="${y + 34}" x2="${x - 12}" y2="${y + 52}" stroke="${C.navy}" stroke-width="1.6"/>`);
    g.push(`<line x1="${x}" y1="${y + 34}" x2="${x + 12}" y2="${y + 52}" stroke="${C.navy}" stroke-width="1.6"/>`);
    g.push(text(x, y + 70, label, { size: 11, weight: 700 }));
    return g.join('');
  };
  const useCase = (x, y, label, colour = C.sky) => {
    const lines = wrap(label, 130, 10.5);
    const g = [`<ellipse cx="${x}" cy="${y}" rx="78" ry="23" fill="${C.paper}" stroke="${colour}" stroke-width="1.3"/>`];
    lines.forEach((l, i) => g.push(text(x, y + 4 - (lines.length - 1) * 6 + i * 12, l, { size: 10.5 })));
    return g.join('');
  };

  b.push(`<rect x="240" y="24" width="420" height="654" rx="12" fill="#FBFDFF" stroke="${C.line}" stroke-dasharray="5 4"/>`);
  b.push(text(450, 44, 'Capacity Connect', { size: 12, weight: 700, fill: C.slate }));

  const cases = [
    [450, 80, 'Sign in / manage session', C.navy],
    [450, 138, 'View competency passport'],
    [450, 196, 'View skill gaps and priority'],
    [450, 254, 'Follow recommended learning path'],
    [450, 312, 'Enrol and study a course'],
    [450, 370, 'Take theory assessment'],
    [450, 428, 'Take AR / practical assessment', C.coral],
    [450, 486, 'Earn and download certificate', C.green],
    [450, 544, 'Work offline and sync', C.teal],
    [450, 602, 'Complete AR refresher', C.coral],
  ];
  const trainerCases = [
    [450, 650, 'Author courses and assessments', C.violet],
  ];
  for (const [x, y, l, c] of [...cases, ...trainerCases]) b.push(useCase(x, y, l, c));

  b.push(actor(80, 260, 'Trainee'));
  b.push(actor(80, 480, 'Trainer / SME'));
  b.push(actor(820, 170, 'Administrator'));
  b.push(actor(820, 420, 'Public verifier'));
  b.push(actor(820, 600, 'Scheduler (system)'));

  // trainee links
  for (const y of [80, 138, 196, 254, 312, 370, 428, 486, 544, 602]) b.push(`<line x1="100" y1="290" x2="372" y2="${y}" stroke="${C.line}" stroke-width="1"/>`);
  // trainer links
  for (const y of [650, 370, 486]) b.push(`<line x1="100" y1="510" x2="372" y2="${y}" stroke="${C.line}" stroke-width="1"/>`);

  // admin-only cases on the right
  const adminCases = [
    [700, 96, 'Manage users and approvals'],
    [700, 152, 'Manage competency framework'],
    [700, 208, 'Tune engine settings'],
    [700, 264, 'View heatmap and training needs'],
    [700, 320, 'Run readiness simulation', C.amber],
    [700, 376, 'Review knowledge continuity', C.amber],
  ];
  // Drawn inside the boundary; shift left so they stay in the system box.
  for (const [x, y, l, c] of adminCases) b.push(useCase(x - 110, y, l, c));
  for (const [, y] of adminCases) b.push(`<line x1="800" y1="200" x2="668" y2="${y}" stroke="${C.line}" stroke-width="1"/>`);

  b.push(`<line x1="800" y1="450" x2="528" y2="486" stroke="${C.line}" stroke-width="1"/>`);
  b.push(useCase(590, 486, 'Verify certificate by QR', C.green));
  b.push(`<line x1="800" y1="630" x2="528" y2="602" stroke="${C.line}" stroke-width="1"/>`);
  b.push(useCase(590, 602, 'Send scheduled reminders', C.slate));

  emit('use-case', W, H, b.join('\n'), 'Use case diagram');
}

// ---------------------------------------------------------------------------------------------
// 5. Context diagram and DFDs
// ---------------------------------------------------------------------------------------------
{
  const b = [];
  b.push(box(360, 250, 240, 90, 'Capacity Connect', { sub: ['Competency-driven', 'capacity building portal'], fill: '#EAF4FF', stroke: C.sky, titleSize: 14, radius: 12 }));
  const ext = [
    [60, 60, 'Trainee', ['competency profile, learning,', 'assessments, AR practicals']],
    [660, 60, 'Trainer / SME', ['course and assessment authoring,', 'evaluations']],
    [60, 470, 'Administrator', ['framework, users, engine settings,', 'readiness planning']],
    [660, 470, 'Public verifier', ['certificate number or QR link']],
    [360, 500, 'AI provider (optional)', ['only when an API key is configured']],
  ];
  for (const [x, y, label, sub] of ext) b.push(box(x, y, 230, 76, label, { sub, fill: C.paper, stroke: C.navy }));
  b.push(elbow(175, 136, 420, 248));
  b.push(elbow(775, 136, 540, 248));
  b.push(elbow(175, 470, 420, 342, { marker: 'ah' }));
  b.push(elbow(775, 470, 540, 342, { marker: 'ah' }));
  b.push(line(480, 500, 480, 342, { dash: '4 3' }));
  emit('dfd-context', 950, 600, b.join('\n'), 'Context diagram (DFD level 0 context)');
}

{
  const W = 980;
  const b = [];
  const proc = (x, y, n, label, sub, colour) => box(x, y, 190, 72, `${n}. ${label}`, { sub, fill: C.paper, stroke: colour, titleSize: 11.5 });
  const store = (x, y, label, sub) => {
    const g = [`<rect x="${x}" y="${y}" width="210" height="40" fill="${C.tint}" stroke="${C.navy}" stroke-width="1.2"/>`];
    g.push(`<rect x="${x}" y="${y}" width="26" height="40" fill="${C.navy}"/>`);
    g.push(text(x + 13, y + 24, 'D', { size: 12, weight: 700, fill: '#fff' }));
    g.push(text(x + 118, y + 17, label, { size: 10.5, weight: 700 }));
    g.push(text(x + 118, y + 30, sub, { size: 9, fill: C.slate }));
    return g.join('');
  };

  b.push(box(24, 40, 150, 56, 'Trainee', { fill: C.paper, stroke: C.navy }));
  b.push(box(24, 300, 150, 56, 'Trainer / SME', { fill: C.paper, stroke: C.navy }));
  b.push(box(24, 470, 150, 56, 'Administrator', { fill: C.paper, stroke: C.navy }));
  b.push(box(806, 40, 150, 56, 'Public verifier', { fill: C.paper, stroke: C.navy }));

  b.push(proc(230, 32, '1', 'Authentication & access', ['sessions, RBAC'], C.navy));
  b.push(proc(230, 140, '2', 'Learning delivery', ['courses, modules, progress'], C.violet));
  b.push(proc(230, 248, '3', 'Assessment & scoring', ['MCQ, scenarios, AR tasks'], C.amber));
  b.push(proc(230, 356, '4', 'Competency engine', ['gap, priority, update, decay'], C.sky));
  b.push(proc(230, 464, '5', 'Certification', ['issue, sign, verify'], C.green));
  b.push(proc(230, 572, '6', 'Readiness & analytics', ['events, succession, reports'], C.teal));

  b.push(store(560, 40, 'D1 Users & framework', 'User, Department, JobRole, Competency'));
  b.push(store(560, 140, 'D2 Learning', 'Course, Module, Material, Enrollment'));
  b.push(store(560, 248, 'D3 Assessment', 'Assessment, Question, Attempt, Answer'));
  b.push(store(560, 356, 'D4 Competency state', 'EmployeeCompetency, CompetencyHistory'));
  b.push(store(560, 464, 'D5 Certificates', 'Certificate (+ Ed25519 signature)'));
  b.push(store(560, 572, 'D6 Readiness & AR', 'DecayPolicy, ReadinessEvent, ARModule, ARAttempt'));
  b.push(store(560, 660, 'D7 Governance', 'AuditLog, Notification, SystemSetting'));

  for (let i = 0; i < 6; i += 1) {
    const y = 68 + i * 108;
    b.push(line(420, y, 558, y, { marker: 'ah' }));
    b.push(line(558, y + 16, 420, y + 16, { marker: 'ah' }));
  }
  b.push(line(174, 68, 228, 68));
  b.push(line(174, 328, 228, 328));
  b.push(line(174, 498, 228, 498));
  b.push(line(806, 500, 806, 96, { marker: null }));
  b.push(line(420, 500, 804, 500, { marker: 'ah' }));
  b.push(line(420, 392, 420, 320, { marker: 'ah', dash: '4 3' }));
  b.push(text(470, 316, 'evidence', { size: 9, fill: C.slate }));
  b.push(line(325, 320, 325, 248, { marker: 'ah', dash: '4 3' }));

  emit('dfd-level0', W, 720, b.join('\n'), 'Data flow diagram, level 0');
}

{
  const W = 960;
  const b = [];
  const proc = (x, y, n, label, sub) => box(x, y, 200, 70, `${n} ${label}`, { sub, fill: C.paper, stroke: C.sky, titleSize: 11.5 });
  b.push(text(W / 2, 26, 'Process 4 - Competency engine, expanded', { size: 13, weight: 700, fill: C.slate }));
  b.push(proc(40, 60, '4.1', 'Resolve requirement', ['RoleCompetency for the', "person's job role"]));
  b.push(proc(40, 180, '4.2', 'Read current level', ['EmployeeCompetency', '(verified baseline)']));
  b.push(proc(40, 300, '4.3', 'Apply decay', ['baseline x 0.5^(days/halfLife)', 'never stored']));
  b.push(proc(380, 60, '4.4', 'Compute skill gap', ['required - effective,', 'severity band']));
  b.push(proc(380, 180, '4.5', 'Compute priority', ['gap x importance x', 'role criticality, normalised']));
  b.push(proc(380, 300, '4.6', 'Classify freshness', ['Current / Watch / At risk /', 'Critical / Expired']));
  b.push(proc(720, 60, '4.7', 'Gather evidence', ['assessment, evaluation,', 'practical (incl. AR)']));
  b.push(proc(720, 180, '4.8', 'Blend and update', ['weighted blend with the', 'previous level, capped']));
  b.push(proc(720, 300, '4.9', 'Write history', ['append-only row with the', 'inputs and explanation']));

  const store = (x, y, label) => `<rect x="${x}" y="${y}" width="196" height="30" fill="${C.tint}" stroke="${C.navy}"/>` + text(x + 98, y + 19, label, { size: 10, weight: 700 });
  b.push(store(40, 420, 'D1 Users & framework'));
  b.push(store(380, 420, 'D6 Decay policies'));
  b.push(store(720, 420, 'D4 Competency state'));

  b.push(line(240, 95, 378, 95));
  b.push(line(240, 215, 378, 215));
  b.push(line(240, 335, 378, 335));
  b.push(line(580, 95, 718, 95));
  b.push(line(580, 215, 718, 215));
  b.push(line(820, 130, 820, 178));
  b.push(line(820, 250, 820, 298));
  b.push(line(140, 130, 140, 178));
  b.push(line(140, 250, 140, 298));
  b.push(line(140, 370, 140, 418, { dash: '4 3' }));
  b.push(line(480, 370, 480, 418, { dash: '4 3' }));
  b.push(line(820, 370, 820, 418, { dash: '4 3' }));
  emit('dfd-level1', W, 470, b.join('\n'), 'Data flow diagram, level 1: the competency engine');
}

// ---------------------------------------------------------------------------------------------
// 6. Sequence diagrams
// ---------------------------------------------------------------------------------------------
function sequence(name, title, actors, messages, { note = null } = {}) {
  const laneW = Math.max(150, Math.min(210, Math.floor(980 / actors.length)));
  const W = laneW * actors.length + 40;
  const top = 74;
  const step = 40;
  const H = top + messages.length * step + (note ? 70 : 40);
  const b = [];
  const cx = (i) => 20 + laneW * i + laneW / 2;

  actors.forEach((a, i) => {
    const x = cx(i);
    b.push(`<rect x="${x - laneW / 2 + 10}" y="18" width="${laneW - 20}" height="40" rx="7" fill="${i === 0 ? '#EAF4FF' : C.paper}" stroke="${i === 0 ? C.sky : C.navy}" stroke-width="1.3"/>`);
    wrap(a, laneW - 30, 10.5).forEach((l, j, arr) => b.push(text(x, 38 + j * 12 - (arr.length - 1) * 6 + 3, l, { size: 10.5, weight: 700 })));
    b.push(`<line x1="${x}" y1="58" x2="${x}" y2="${top + messages.length * step + 6}" stroke="${C.line}" stroke-width="1.1" stroke-dasharray="4 4"/>`);
  });

  messages.forEach(([from, to, label, style], i) => {
    const y = top + i * step;
    const x1 = cx(from);
    const x2 = cx(to);
    if (from === to) {
      b.push(`<path d="M${x1},${y - 8} q40,0 40,12 q0,12 -40,12" fill="none" stroke="${style === 'return' ? C.slate : C.sky}" stroke-width="1.3" stroke-dasharray="${style === 'return' ? '4 3' : '0'}" marker-end="url(#${style === 'return' ? 'ah' : 'ahs'})"/>`);
      b.push(text(x1 + 50, y + 4, label, { size: 9.5, anchor: 'start', fill: C.ink }));
    } else {
      const dir = x2 > x1 ? 1 : -1;
      b.push(`<line x1="${x1 + dir * 4}" y1="${y}" x2="${x2 - dir * 6}" y2="${y}" stroke="${style === 'return' ? C.slate : C.sky}" stroke-width="1.3"${style === 'return' ? ' stroke-dasharray="4 3"' : ''} marker-end="url(#${style === 'return' ? 'ah' : 'ahs'})"/>`);
      b.push(text((x1 + x2) / 2, y - 6, label, { size: 9.5, fill: C.ink }));
    }
  });

  if (note) {
    const y = top + messages.length * step + 10;
    b.push(`<rect x="24" y="${y}" width="${W - 48}" height="44" rx="6" fill="#FFFBEB" stroke="${C.amber}"/>`);
    wrap(note, W - 80, 10).forEach((l, i) => b.push(text(W / 2, y + 18 + i * 13, l, { size: 10, fill: '#92400E' })));
  }
  emit(name, W, H, b.join('\n'), title);
}

sequence(
  'seq-login',
  'Sequence: sign-in and session establishment',
  ['Browser', 'Express API', 'authenticate / auth.service', 'PostgreSQL'],
  [
    [0, 1, 'POST /api/auth/login  { email, password }'],
    [1, 2, 'validate body (Zod), check lock-out'],
    [2, 3, 'SELECT user by email'],
    [3, 2, 'user row (passwordHash)', 'return'],
    [2, 2, 'argon2.verify(hash, password)'],
    [2, 3, 'create Session (refresh token hash), AuditLog'],
    [2, 1, 'access + refresh JWT', 'return'],
    [1, 0, '200 Set-Cookie (HttpOnly, SameSite)', 'return'],
    [0, 1, 'GET /api/users/me  (cookie)'],
    [1, 0, '200 { user }', 'return'],
  ],
  { note: 'Tokens are never readable by JavaScript. A refresh reuses the rotating token and detects replay; the CSRF header X-Requested-With is required on every state-changing call.' },
);

sequence(
  'seq-skillgap',
  'Sequence: skill-gap analysis with freshness',
  ['Browser', 'skill-gaps.routes', 'profile.service', 'engine: skill-gap + decay', 'PostgreSQL'],
  [
    [0, 1, 'GET /api/skill-gaps/me?offsetDays=n'],
    [1, 2, 'loadEmployeeAnalysis(userId, asOf)'],
    [2, 4, 'role requirements, held levels, decay policies'],
    [4, 2, 'rows', 'return'],
    [2, 3, 'analyzeFreshness(baseline, dates, policy, asOf)'],
    [3, 2, 'effectiveLevel, status, reason', 'return'],
    [2, 3, 'analyzeSkillGap(effectiveLevel, required, importance)'],
    [3, 2, 'gap, severity, priority, explanation', 'return'],
    [2, 1, 'records + summary + refreshers + asOf', 'return'],
    [1, 0, '200 { data }', 'return'],
  ],
  { note: 'Nothing is written. The simulated date only changes the input to the pure decay function, which is why "readiness time travel" cannot corrupt data.' },
);

sequence(
  'seq-assessment',
  'Sequence: assessment submission and competency update',
  ['Browser', 'assessments.routes', 'attempts.service', 'scoring + evidence', 'PostgreSQL'],
  [
    [0, 1, 'POST /api/assessments/:id/submit'],
    [1, 2, 'submitSchema.parse(body)'],
    [2, 4, 'find attempt by idempotencyKey'],
    [4, 2, 'none - proceed', 'return'],
    [2, 4, 'load questions, options, scenarios'],
    [2, 3, 'scoreAnswers() and scoreScenarios()'],
    [3, 2, 'perQuestion, perStep, percentages', 'return'],
    [2, 3, 'combineScores(mcq, practical, mcqWeight)'],
    [2, 4, 'BEGIN TRANSACTION'],
    [2, 4, 'update attempt, insert answers/responses'],
    [2, 3, 'applyCompetencyEvidence(kind: ASSESSMENT)'],
    [3, 4, 'upsert EmployeeCompetency + CompetencyHistory'],
    [2, 4, 'issue Certificate if passed, notify, audit'],
    [2, 4, 'COMMIT'],
    [2, 1, 'result + competencyImpacts', 'return'],
    [1, 0, '200 { attempt, impacts, review }', 'return'],
  ],
  { note: 'Scoring, the competency update and the certificate all commit in one transaction, so a competency can never move without the attempt that moved it.' },
);

sequence(
  'seq-certificate',
  'Sequence: certificate issue and public verification',
  ['Browser / verifier', 'certificates.routes', 'certificate.service', 'certificate-signing', 'PostgreSQL'],
  [
    [1, 2, 'issueCertificate(attempt) - called on a pass'],
    [2, 4, 'snapshot holder, course, issuer, competencies'],
    [2, 3, 'canonicalPayload() then sign (Ed25519)'],
    [3, 2, 'signature + keyId', 'return'],
    [2, 4, 'INSERT Certificate (number, signature, signedAt)'],
    [0, 1, 'GET /api/certificates/verify/:number  (public)'],
    [1, 2, 'verifyCertificate(number)'],
    [2, 4, 'SELECT certificate'],
    [2, 3, 'recompute canonical payload, verify signature'],
    [3, 2, 'VALID / TAMPERED / UNSIGNED / UNVERIFIABLE', 'return'],
    [2, 1, 'status + safe public fields', 'return'],
    [1, 0, '200 { valid, holder, course, signature }', 'return'],
  ],
  { note: 'The public response carries only the fields a verifier needs. With no signing key configured, certificates are issued UNSIGNED and verification says so rather than implying a signature.' },
);

sequence(
  'seq-ar-practical',
  'Sequence: AR practical - marking, weighting and competency update',
  ['Phone / browser', 'ar.routes', 'ar.service', 'evidence + decay services', 'PostgreSQL'],
  [
    [0, 1, 'POST /api/ar/modules/:key/start'],
    [1, 2, 'startAttempt() - resume if one is open'],
    [2, 4, 'INSERT ARPracticalAttempt (IN_PROGRESS)'],
    [2, 0, 'tasks + components (no answers, no hints)', 'return'],
    [0, 0, 'trainee taps markers on the 3D / AR model'],
    [0, 1, 'POST .../submit { responses, idempotencyKey }'],
    [2, 4, 'replay check on (userId, idempotencyKey)'],
    [2, 4, 'load ARTask.correctComponentId'],
    [2, 2, 'mark server-side -> practicalPercentage'],
    [2, 4, 'latest passed theory attempt for the course'],
    [2, 2, 'theory x weight + practical x (1 - weight)'],
    [2, 4, 'BEGIN TRANSACTION'],
    [2, 3, 'recordPractice() - resets lastPracticedAt'],
    [2, 3, 'applyCompetencyEvidence(kind: PRACTICAL)'],
    [3, 4, 'blend with previous level, write history'],
    [2, 4, 'COMMIT'],
    [2, 0, 'scores, review, competencyImpacts', 'return'],
  ],
  { note: 'No endpoint accepts a score. The browser reports which component was selected; everything that decides an outcome is computed on the server from the database.' },
);

sequence(
  'seq-offline-sync',
  'Sequence: working offline and synchronising',
  ['Learner (app)', 'Service worker', 'IndexedDB queue', 'Express API', 'PostgreSQL'],
  [
    [0, 1, 'GET course content (online)'],
    [1, 3, 'network first'],
    [3, 1, '200 JSON', 'return'],
    [1, 1, 'cache response (allow-listed GETs only)'],
    [0, 2, 'savePack(): store modules + file blobs'],
    [0, 0, 'network lost'],
    [0, 1, 'GET course content'],
    [1, 0, 'cached copy, marked X-CC-Offline', 'return'],
    [0, 2, 'runOrQueue(): persist mutation + idempotency key'],
    [0, 0, 'network returns - "online" event'],
    [2, 3, 'flushQueue(): send oldest first'],
    [3, 4, 'apply write (replay returns original result)'],
    [3, 2, '200', 'return'],
    [2, 0, 'SYNC COMPLETE', 'return'],
  ],
  { note: 'The service worker handles GET requests only. Writes are queued by the application so retry, ordering, the idempotency key and the message the learner sees all live in one place.' },
);

console.log(`${made.length} diagrams written to docs/report/diagrams:`);
console.log('  ' + made.join(', '));
