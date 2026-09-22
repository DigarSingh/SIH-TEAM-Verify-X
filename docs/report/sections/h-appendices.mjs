/** Appendices A-H. The reference appendices are generated from the repository, not typed by hand. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appendixOpen, chapterClose, h2, h3, p, ul, ol, table, note, warn, pre, status, ROOT, figures } from '../kit.mjs';

const DATA = path.join(ROOT, 'docs/report/data');
const readData = (file) => readFileSync(path.join(DATA, file), 'utf8');

// ---------------------------------------------------------------- Appendix A

const REGISTER = [
  ['Accounts and access', 'Self-registration with administrator approval and optional domain restriction', 'IMPLEMENTED', 'Ch 13; integration tests'],
  ['Accounts and access', 'Argon2id passwords, shared policy, timing-equalised sign-in, account lock-out', 'IMPLEMENTED', 'Ch 13, 26; auth tests'],
  ['Accounts and access', 'HttpOnly cookie sessions, refresh rotation, reuse detection, server-side revocation', 'IMPLEMENTED', 'Ch 13, 26; auth tests'],
  ['Accounts and access', 'Forced password change on an administrator-created or reset account', 'IMPLEMENTED', 'Ch 13; regression test'],
  ['Accounts and access', 'Role check per route and ownership check per record', 'IMPLEMENTED', 'Ch 13, 26; RBAC tests'],
  ['Accounts and access', 'Append-only audit trail, filterable by an administrator', 'IMPLEMENTED', 'Ch 13, 26; screenshot 39'],
  ['Accounts and access', 'Multi-factor authentication', 'PLANNED', 'Ch 28, L-4'],
  ['Accounts and access', 'Single sign-on with a departmental identity provider', 'PLANNED', 'Ch 28, future work 1'],
  ['Accounts and access', 'Password reset by e-mail', 'PLANNED', 'Ch 28, L-4; no e-mail delivery exists'],
  ['Framework', 'Departments, job roles with criticality, competencies', 'IMPLEMENTED', 'Ch 14; screenshot 40'],
  ['Framework', 'Per-role required level and importance', 'IMPLEMENTED', 'Ch 14'],
  ['Framework', 'Verified employee competency level with append-only history', 'IMPLEMENTED', 'Ch 14, 17'],
  ['Framework', 'Administrator adjustment, audited and written to history', 'IMPLEMENTED', 'Ch 17'],
  ['Framework', 'Competencies inferred automatically from course content', 'PLANNED', 'Ch 28, L-10 — deliberately not attempted'],
  ['Engine', 'Gap, severity band, training priority, ranking, per-record explanation', 'IMPLEMENTED', 'Ch 14; unit tests'],
  ['Engine', 'Blended competency update with no-decrease and course-ceiling guard-rails', 'IMPLEMENTED', 'Ch 17; unit tests'],
  ['Engine', 'Evidence gathering across assessment, trainer evaluation and practical', 'IMPLEMENTED', 'Ch 17'],
  ['Engine', 'Weighted five-criterion trainer rubric, weights stored with each evaluation', 'IMPLEMENTED', 'Ch 17; screenshot 37'],
  ['Engine', 'Every threshold and weight editable, with a simulator and validation', 'IMPLEMENTED', 'Ch 17; screenshot 14'],
  ['Engine', 'Rule-based recommendations and prerequisite-ordered learning paths', 'IMPLEMENTED', 'Ch 14; screenshot 4'],
  ['Learning', 'Course, module and material authoring with a publication checklist', 'IMPLEMENTED', 'Ch 15; screenshot 10'],
  ['Learning', 'Catalogue with filters and plain-language search', 'IMPLEMENTED', 'Ch 15; screenshot 5'],
  ['Learning', 'Enrolment, module progress, course feedback', 'IMPLEMENTED', 'Ch 15; screenshot 28'],
  ['Learning', 'Uploads validated by file content, authorised downloads, video range requests', 'IMPLEMENTED', 'Ch 26'],
  ['Learning', 'SCORM / xAPI import', 'PLANNED', 'Ch 28, future work 9'],
  ['Learning', 'Scheduled instructor-led sessions with attendance', 'PLANNED', 'Ch 28, future work 10'],
  ['Assessment', 'Timed assessments drawn from a question bank, autosaved, server-scored', 'IMPLEMENTED', 'Ch 16; screenshots 31, 7'],
  ['Assessment', 'Scenario-based practical questions with partial credit', 'IMPLEMENTED', 'Ch 16; integration tests'],
  ['Assessment', 'Idempotent submission, conditional attempt claim, server-enforced time limit', 'IMPLEMENTED', 'Ch 16; integration tests'],
  ['Assessment', 'Proctoring and question-bank analytics', 'PLANNED', 'Ch 28, L-14'],
  ['Certification', 'PDF certificate with QR code, issued inside the submission transaction', 'IMPLEMENTED', 'Ch 18'],
  ['Certification', 'Ed25519 signing, with unsigned reported honestly when no key is configured', 'IMPLEMENTED', 'Ch 18'],
  ['Certification', 'Public verification without sign-in, rate-limited, minimal disclosure', 'IMPLEMENTED', 'Ch 18; screenshot 8'],
  ['Certification', 'Revocation and reinstatement, reflected publicly and audited', 'IMPLEMENTED', 'Ch 18'],
  ['Freshness', 'Half-life decay as a pure function of a date; nothing stored', 'IMPLEMENTED', 'Ch 19; unit tests'],
  ['Freshness', 'Separate practice and evidence dates; recertification tracked independently', 'IMPLEMENTED', 'Ch 19'],
  ['Freshness', 'Five freshness statuses with thresholds applied to decay cost, not total gap', 'IMPLEMENTED', 'Ch 19; unit tests'],
  ['Freshness', 'Opt-in per competency; a competency with no policy is fully inert', 'IMPLEMENTED', 'Ch 19; unit tests'],
  ['Freshness', 'Readiness simulation at any future date, writing nothing', 'IMPLEMENTED', 'Ch 19; integration test asserts no write'],
  ['Freshness', 'The seeded half-lives, intervals and minimum safe levels', 'SIMULATED', 'Ch 19; flagged isSimulation, labelled in the interface'],
  ['Readiness', 'Readiness events with requirements, department scope and dates', 'IMPLEMENTED', 'Ch 20; screenshot 18'],
  ['Readiness', 'Readiness measured at each event’s own start date', 'IMPLEMENTED', 'Ch 20; integration tests'],
  ['Readiness', 'Idempotent assignment of preparation, with a waived state', 'IMPLEMENTED', 'Ch 20; screenshot 19'],
  ['Readiness', 'Organisation-wide readiness index with its arithmetic shown', 'IMPLEMENTED', 'Ch 20; screenshot 17'],
  ['Readiness', 'The readiness index as an official operational measure', 'SIMULATED', 'Ch 20 — a demonstration metric, labelled wherever it appears'],
  ['Readiness', 'The seeded readiness events and hazard calendar', 'SIMULATED', 'Ch 20; flagged isSimulation'],
  ['Continuity', 'Knowledge-continuity risk from effective levels and recorded retirement dates', 'IMPLEMENTED', 'Ch 21; screenshot 20'],
  ['Continuity', 'Mentor pairing with a status', 'PARTIALLY IMPLEMENTED', 'Ch 21 — records intent only; no sessions, no evidence'],
  ['Continuity', 'Prediction of who will leave', 'PLANNED', 'Ch 21 — deliberately not attempted; recorded dates only'],
  ['AR lab', 'Original, reproducible 3D model generated by a repository script', 'IMPLEMENTED', 'Ch 22; docs/AR_ASSETS.md'],
  ['AR lab', 'Guided training phase with hints, assessment phase without', 'IMPLEMENTED', 'Ch 22; screenshots 24, 34'],
  ['AR lab', 'Server-side marking; answers never sent to the browser during an attempt', 'IMPLEMENTED', 'Ch 22; integration tests'],
  ['AR lab', 'Theory and practical combined at a per-module weighting', 'IMPLEMENTED', 'Ch 22; screenshot 35'],
  ['AR lab', 'Practical applied to the competency engine as practical evidence', 'IMPLEMENTED', 'Ch 22; integration tests'],
  ['AR lab', 'Completing a lab resets that competency’s freshness', 'IMPLEMENTED', 'Ch 22; integration tests'],
  ['AR lab', 'Automatic refresher recommendation when a competency has faded', 'IMPLEMENTED', 'Ch 22; integration tests'],
  ['AR lab', 'AR placement on a real Android phone in Chrome', 'IMPLEMENTED', 'Ch 22 — confirmed by hand'],
  ['AR lab', 'The 3D viewer rendering exercised under automated test', 'NOT VERIFIED', 'Ch 22, 27 — the test environment has no WebGL'],
  ['AR lab', 'The desktop 3D fallback clicked through by a person', 'NOT VERIFIED', 'Ch 22, 27; L-3'],
  ['AR lab', 'Labs for instruments other than the Doppler radar', 'PLANNED', 'Ch 28, future work 6'],
  ['Offline', 'Installable progressive web app with a hand-written service worker', 'IMPLEMENTED', 'Ch 23'],
  ['Offline', 'Allow-listed GET caching; the worker never handles a write', 'IMPLEMENTED', 'Ch 23'],
  ['Offline', 'Saved courses including document and video bytes', 'IMPLEMENTED', 'Ch 23; screenshot 25'],
  ['Offline', 'IndexedDB mutation queue: ordering, retry, give-up, idempotency', 'IMPLEMENTED', 'Ch 23; frontend tests'],
  ['Offline', 'Connection and synchronisation indicator listing pending work', 'IMPLEMENTED', 'Ch 23; screenshots 32, 33'],
  ['Offline', 'Sign-out erases every device-held copy', 'IMPLEMENTED', 'Ch 23'],
  ['Offline', 'Background synchronisation with the application closed', 'PLANNED', 'Ch 28, L-6'],
  ['Analytics', 'Competency heatmap by department or job role, with a freshness layer', 'IMPLEMENTED', 'Ch 24; screenshot 12'],
  ['Analytics', 'Training needs ranked by aggregate demand; competencies with no course flagged', 'IMPLEMENTED', 'Ch 24; screenshot 13'],
  ['Analytics', 'Least-squares trend forecast with outlook and confidence', 'IMPLEMENTED', 'Ch 24; unit tests'],
  ['Analytics', 'AR practical analytics including the competency gain produced', 'IMPLEMENTED', 'Ch 22; screenshot 21'],
  ['Analytics', 'Exportable reports and cohort analytics', 'PLANNED', 'Ch 28, future work 12'],
  ['Engagement', 'In-app notifications with a dedupe key', 'IMPLEMENTED', 'Ch 24; screenshot 29'],
  ['Engagement', 'Scheduled reminders under a PostgreSQL advisory lock', 'IMPLEMENTED', 'Ch 24'],
  ['Engagement', 'Achievements and announcements', 'IMPLEMENTED', 'Ch 24; screenshot 30'],
  ['Engagement', 'E-mail or SMS delivery', 'PLANNED', 'Ch 28, L-5'],
  ['AI (optional)', 'Course assistant, quiz drafter, study-plan wording, plain-language search, forecast briefing', 'IMPLEMENTED', 'Ch 24; off unless a key is configured'],
  ['AI (optional)', 'Model output validated against a schema and then against the database', 'IMPLEMENTED', 'Ch 24, 26'],
  ['AI (optional)', 'AI influencing any competency, score or recommendation ordering', 'PLANNED', 'Ch 4 — deliberately impossible by design'],
  ['Delivery', 'Production builds of both workspaces', 'IMPLEMENTED', 'Ch 27, 28 — run repeatedly'],
  ['Delivery', 'Continuous-integration workflow: typecheck, lint, tests, docs check, builds', 'IMPLEMENTED', 'Ch 27'],
  ['Delivery', 'Docker images and compose stack', 'NOT VERIFIED', 'Ch 28, L-1 — written, never built or run'],
  ['Delivery', 'Separate hosting of the API, web app, database and object storage', 'PARTIALLY IMPLEMENTED', 'Ch 28 — documented and built, never stood up end to end'],
  ['Quality', 'Automated accessibility scan of 31 screens (axe-core), clean', 'IMPLEMENTED', 'Ch 27'],
  ['Quality', 'Testing with assistive technology; formal WCAG audit', 'PLANNED', 'Ch 28, L-12'],
  ['Quality', 'Automated browser end-to-end suite kept in the repository', 'PLANNED', 'Ch 28, L-2'],
  ['Quality', 'Hindi and regional-language interface', 'PLANNED', 'Ch 28, L-13'],
];

export const appA = (() => {
  const counts = REGISTER.reduce((acc, [, , kind]) => ({ ...acc, [kind]: (acc[kind] ?? 0) + 1 }), {});
  return `${appendixOpen('A', 'Implementation Status Register')}
${p(
  `Every capability discussed in this report, with its status and where the evidence for that status is. This is the register the report was written against: no feature is described as implemented in a chapter unless it appears as implemented here.`,
)}
${table(
  'Summary',
  ['Status', 'Count', 'Meaning'],
  [
    [status('IMPLEMENTED'), String(counts.IMPLEMENTED ?? 0), 'Built, wired end to end, and exercised by tests or by hand.'],
    [status('PARTIALLY IMPLEMENTED'), String(counts['PARTIALLY IMPLEMENTED'] ?? 0), 'The core works; a named part is missing or narrower than the name suggests.'],
    [status('SIMULATED'), String(counts.SIMULATED ?? 0), 'The mechanism is real; the values are demonstration content, not policy.'],
    [status('NOT VERIFIED'), String(counts['NOT VERIFIED'] ?? 0), 'Written, but never executed in the environment it targets.'],
    [status('PLANNED'), String(counts.PLANNED ?? 0), 'Not built. Listed so that its absence is explicit.'],
  ],
  { widths: ['26%', '10%', '64%'] },
)}
${table(
  'The full register',
  ['Area', 'Capability', 'Status', 'Evidence'],
  REGISTER.map(([area, capability, kind, evidence]) => [area, capability, status(kind), evidence]),
  { className: 'register', widths: ['12%', '44%', '18%', '26%'] },
)}
${chapterClose}`;
})();

// ---------------------------------------------------------------- Appendix B

export const appB = (() => {
  const lines = readData('routes.txt')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => /^(GET|POST|PUT|PATCH|DELETE)\s+\/api/.test(line));
  const rows = lines.map((line) => {
    const method = line.slice(0, 6).trim();
    const rest = line.slice(6).trim();
    const split = rest.search(/\s{2,}/);
    return [method, rest.slice(0, split).trim(), rest.slice(split).trim()];
  });
  const groups = new Map();
  for (const row of rows) {
    const key = row[1].split('/')[2] ?? 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const sections = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([key, items]) =>
        `${h3(`/api/${key} — ${items.length} endpoint${items.length === 1 ? '' : 's'}`)}
${table(
  `Endpoints under /api/${key}`,
  ['Method', 'Path', 'Access'],
  items.map(([method, path_, access]) => [`<code>${method}</code>`, `<code>${path_}</code>`, access]),
  { className: 'routes', widths: ['11%', '61%', '28%'] },
)}`,
    )
    .join('\n');
  return `${appendixOpen('B', 'Complete API Endpoint Reference')}
${p(
  `All **${rows.length}** registered endpoints, grouped by route prefix. This listing is the output of <code>npm run routes</code>, which reads the routes Express has actually registered — it is not maintained by hand, and <code>npm run routes -- --check</code> fails the build if it and <code>docs/api.md</code> disagree. "Any signed-in user" means authentication is required but no particular access role.`,
)}
${sections}
${chapterClose}`;
})();

// ---------------------------------------------------------------- Appendix C

export const appC = (() => {
  const schema = JSON.parse(readData('schema.json'));
  return `${appendixOpen('C', 'Database Schema Reference')}
${p(`Generated from <code>prisma/schema.prisma</code>: **${schema.models.length} models** and **${schema.enums.length} enumerated types**. Chapter 9 groups these by purpose and describes what each holds.`)}
${h2('Models')}
${table(
  'Every model, with its declared field and relation count',
  ['Model', 'Fields', 'Model', 'Fields', 'Model', 'Fields'],
  (() => {
    const sorted = [...schema.models].sort((a, b) => a.name.localeCompare(b.name));
    const rows = [];
    for (let i = 0; i < sorted.length; i += 3) {
      const cell = (m) => (m ? [`<code>${m.name}</code>`, String(m.fields)] : ['', '']);
      rows.push([...cell(sorted[i]), ...cell(sorted[i + 1]), ...cell(sorted[i + 2])]);
    }
    return rows;
  })(),
  { className: 'schema', widths: ['22%', '11%', '22%', '11%', '23%', '11%'] },
)}
${h2('Enumerated types')}
${table(
  'Every enumerated type and its values',
  ['Type', 'Values'],
  [...schema.enums]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => [`<code>${e.name}</code>`, e.values.map((v) => `<code>${v}</code>`).join(' · ')]),
  { widths: ['24%', '76%'] },
)}
${h2('Integrity constraints enforced by the database')}
${p(`Added in SQL by the <code>data_integrity_constraints</code> migration, because Prisma's schema language cannot express them. The database refuses these whatever code is calling it:`)}
${ul([
  `Competency levels outside 0 to 100 — on role requirements, employee competencies and both levels of every history row — and course mappings whose upper bound is not above the lower bound.`,
  `Importance, criticality, proficiency, feedback and rubric ratings outside their 1 to 5 scales, and a weighted evaluation score outside 0 to 100.`,
  `Pass marks outside 1 to 100, negative durations, positions or attempt counts, non-positive time limits, question marks below 1, and progress outside 0 to 100.`,
  `An e-mail address that is not lower case, so the unique index really is case-insensitive.`,
])}
${p(
  `Further guarantees come from unique constraints (one enrolment, certificate and feedback per person and course; one achievement per badge; one attempt number per person and assessment; one idempotency key per user), from foreign keys (children of a deleted course, module, assessment or user cascade, while references from historical records such as certificates do not — which is why users and courses are soft-deleted), and from transactions.`,
)}
${chapterClose}`;
})();

// ---------------------------------------------------------------- Appendix D

export const appD = `${appendixOpen('D', 'Environment Variables')}
${warn(
  'No value of any secret appears in this report',
  'This appendix lists variable <em>names</em> and their purpose. Secrets are marked, and their values are neither printed here nor stored in the repository. <code>.env.example</code> documents every variable with its secrets left empty; the real <code>.env</code> is excluded from version control and from container images.',
)}
${table(
  'Runtime',
  ['Variable', 'Default', 'Purpose'],
  [
    ['<code>NODE_ENV</code>', '<code>development</code>', 'development, test or production. Production enables additional start-up checks.'],
    ['<code>PORT</code>', '<code>4000</code>', 'The port the API listens on.'],
    ['<code>LOG_LEVEL</code>', '<code>info</code>', 'pino log level.'],
    ['<code>TRUST_PROXY</code>', '<code>false</code>', 'Number of reverse-proxy hops, so rate limits and audit entries see the real client address.'],
  ],
  { widths: ['28%', '16%', '56%'] },
)}
${table(
  'Database',
  ['Variable', 'Default', 'Purpose'],
  [
    ['<code>DATABASE_URL</code>', '— (required)', 'PostgreSQL connection string.'],
    ['<code>TEST_DATABASE_URL</code>', '—', 'Used only by the backend tests. Must end in <code>_test</code>: they truncate every table in it.'],
  ],
  { widths: ['28%', '16%', '56%'] },
)}
${table(
  'Authentication and sessions',
  ['Variable', 'Default', 'Purpose'],
  [
    ['<code>JWT_SECRET</code> <strong>(secret)</strong>', '— (required)', 'Signs access tokens. At least 32 characters; production refuses to start with less.'],
    ['<code>ACCESS_TOKEN_TTL_MINUTES</code>', '<code>15</code>', 'Access-token lifetime.'],
    ['<code>REFRESH_TOKEN_TTL_DAYS</code>', '<code>7</code>', 'Refresh-token lifetime.'],
    ['<code>COOKIE_SECURE</code>', '<code>false</code>', 'Mandatory <code>true</code> in production; the API refuses to start otherwise.'],
    ['<code>COOKIE_SAMESITE</code>', '<code>lax</code>', 'lax, strict or none. <code>none</code> additionally requires secure cookies.'],
    ['<code>COOKIE_DOMAIN</code>', 'unset', 'Cookie domain, when the web app and API share a parent domain.'],
    ['<code>REGISTRATION_REQUIRES_APPROVAL</code>', '<code>true</code>', 'New self-registered accounts stay pending until approved.'],
    ['<code>ALLOWED_EMAIL_DOMAINS</code>', 'unset', 'Comma-separated allow-list restricting self-registration.'],
    ['<code>MAX_FAILED_LOGINS</code>', '<code>5</code>', 'Failed attempts before lock-out.'],
    ['<code>LOCKOUT_MINUTES</code>', '<code>15</code>', 'Lock-out duration.'],
    ['<code>ARGON2_MEMORY_KIB</code>', '<code>19456</code>', 'Argon2id memory cost. Raise on production hardware.'],
    ['<code>ARGON2_TIME_COST</code>', '<code>2</code>', 'Argon2id time cost.'],
  ],
  { widths: ['28%', '16%', '56%'] },
)}
${table(
  'Web, storage and certificates',
  ['Variable', 'Default', 'Purpose'],
  [
    ['<code>FRONTEND_URL</code>', '— (required in production)', 'Comma-separated CORS allow-list. The first entry builds certificate verification links and QR codes.'],
    ['<code>STORAGE_DRIVER</code>', '<code>local</code>', '<code>local</code> or <code>s3</code>.'],
    ['<code>STORAGE_LOCAL_DIR</code>', '<code>./uploads</code>', 'Upload directory for the local driver, resolved against the environment file.'],
    ['<code>STORAGE_ENDPOINT</code>, <code>STORAGE_REGION</code>, <code>STORAGE_BUCKET</code>', 'various', 'S3-compatible endpoint, region and bucket.'],
    ['<code>STORAGE_ACCESS_KEY</code>, <code>STORAGE_SECRET_KEY</code> <strong>(secret)</strong>', 'unset', 'Required when the driver is <code>s3</code>.'],
    ['<code>STORAGE_FORCE_PATH_STYLE</code>', '<code>true</code>', 'True for MinIO and most self-hosted stores, false for AWS S3.'],
    ['<code>MAX_UPLOAD_MB</code>', '<code>25</code>', 'Per-file upload cap.'],
    ['<code>CERTIFICATE_ISSUER</code>', 'IMD, MoES', 'Printed on the certificate and included in the signed payload.'],
    ['<code>CERTIFICATE_ID_PREFIX</code>', '<code>CC</code>', 'Two to eight upper-case letters or digits, prefixing every certificate number.'],
    ['<code>CERTIFICATE_SIGNING_KEY</code> <strong>(secret)</strong>', 'unset', 'Ed25519 private key. Without it, certificates are issued unsigned and verification says so.'],
  ],
  { widths: ['28%', '16%', '56%'] },
)}
${table(
  'Limits, jobs and the demonstration seed',
  ['Variable', 'Default', 'Purpose'],
  [
    ['<code>RATE_LIMIT_WINDOW_MS</code>, <code>RATE_LIMIT_MAX</code>', '<code>900000</code>, <code>1000</code>', 'The global rate limit.'],
    ['<code>AUTH_RATE_LIMIT_MAX</code>', '<code>30</code>', 'Sign-in, registration and password-change limit.'],
    ['<code>ENABLE_SCHEDULER</code>', '<code>false</code>', 'The in-process reminder scheduler, guarded by an advisory lock.'],
    ['<code>SEED_DEMO_PASSWORD</code> <strong>(secret)</strong>', 'unset', 'Password for every seeded account. Left empty, the seed generates a random one and prints it once.'],
    ['<code>ALLOW_PRODUCTION_SEED</code>', '<code>false</code>', 'Must never be enabled on a real system: the seed creates well-known accounts.'],
  ],
  { widths: ['28%', '16%', '56%'] },
)}
${table(
  'Optional AI features',
  ['Variable', 'Default', 'Purpose'],
  [
    ['<code>AI_PROVIDER</code>', '<code>openai</code>', '<code>openai</code> or <code>anthropic</code>. Only that provider’s key is used.'],
    ['<code>OPENAI_API_KEY</code> <strong>(secret)</strong>', 'unset', 'Leave empty to keep the generative features off entirely.'],
    ['<code>OPENAI_BASE_URL</code>', 'unset', 'Only for an OpenAI-compatible service. Must be HTTPS in production, except on the same machine.'],
    ['<code>ANTHROPIC_API_KEY</code> <strong>(secret)</strong>', 'unset', 'Used only when the provider is Anthropic.'],
    ['<code>AI_MODEL</code>', 'per provider', 'The model used for every AI call.'],
    ['<code>AI_REFUSAL_FALLBACKS</code>', '<code>true</code>', 'Anthropic only: retry a declined request on the recommended fallback model.'],
    ['<code>AI_RATE_LIMIT_PER_HOUR</code>', '<code>30</code>', 'Per-user cap, because these requests cost money.'],
    ['<code>AI_MAX_CONTEXT_CHARS</code>', '<code>120000</code>', 'Upper bound on the course text sent with one request.'],
  ],
  { widths: ['28%', '16%', '56%'] },
)}
${table(
  'Build-time and Docker Compose',
  ['Variable', 'Default', 'Purpose'],
  [
    ['<code>VITE_API_URL</code>', 'empty', 'Absolute API base URL when the web app is hosted on another origin.'],
    ['<code>VITE_DEV_API_TARGET</code>', '<code>http://localhost:4000</code>', 'Where the development server proxies <code>/api</code>.'],
    ['<code>VITE_SHOW_DEMO_ACCOUNTS</code>', '<code>false</code>', 'Shows the demonstration shortcuts on the sign-in page. Never enable for a real deployment.'],
    ['<code>VITE_DEMO_PASSWORD</code> <strong>(secret)</strong>', 'empty', 'Never set a real password: every <code>VITE_*</code> value is compiled into the public bundle.'],
    ['<code>VITE_ENABLE_SW</code>', '<code>false</code>', 'Registers the service worker in a development build. Production always registers it.'],
    ['<code>POSTGRES_USER</code>, <code>POSTGRES_DB</code>', '<code>capacity</code>, <code>capacity_connect</code>', 'Compose only.'],
    ['<code>POSTGRES_PASSWORD</code> <strong>(secret)</strong>', '— (required for Compose)', 'Compose only.'],
    ['<code>PUBLIC_URL</code>, <code>WEB_PORT</code>', '<code>http://localhost:8080</code>, <code>8080</code>', 'Compose only: the public address and published port.'],
    ['<code>CSP_EXTRA_ORIGINS</code>', 'empty', 'Extra origins for the web app’s Content-Security-Policy, such as an S3 bucket serving uploads.'],
  ],
  { widths: ['28%', '16%', '56%'] },
)}
${chapterClose}`;

// ---------------------------------------------------------------- Appendix E

export const appE = `${appendixOpen('E', 'Demonstration Accounts and Seeded Data')}
${warn(
  'These accounts exist only in a development database',
  'The seed refuses to run when <code>NODE_ENV</code> is production unless an override flag is deliberately set, and that flag must never be set on a real system. No password value appears in this report: the seed reads it from an environment variable, and generates and prints a random one when the variable is empty.',
)}
${table(
  'The three headline accounts',
  ['Access role', 'E-mail', 'Who they are in the demonstration'],
  [
    ['Trainee', '<code>trainee@imd.gov.in</code>', 'Dr. Ananya Rao, Severe Weather Forecaster in Forecasting. Holds Radar Meteorology at 35% against a required 80% — the starting point of the guided demonstration.'],
    ['Trainer', '<code>trainer@imd.gov.in</code>', 'Dr. Arjun Mehta, who owns the radar course path.'],
    ['Administrator', '<code>admin@imd.gov.in</code>', 'Meera Iyer, Learning and Development.'],
  ],
  { widths: ['14%', '24%', '62%'] },
)}
${p(
  `The seed also leaves three self-registered accounts awaiting approval and one suspended account, so the approval and suspension workflows can be exercised rather than only described.`,
)}
${h2('The guided demonstration')}
${ol([
  `Sign in as the **trainee**. The Competency Passport shows Radar Meteorology at **35%** against a required **80%**: a gap of **45**, **High** priority at 28.8 out of 100, with the reason written out.`,
  `**Learning path** and the ranked recommendations propose *Radar Fundamentals* first, then *Doppler Radar Analysis* (locked until the first is done), then *Advanced Radar Analysis*, each with its reason.`,
  `**Enrol** in Radar Fundamentals, open it in the player and complete its five modules.`,
  `Start the **assessment**. About **84%** passes, and the result page shows **Radar Meteorology: 35% → 72%** with the calculation.`,
  `The passport now shows 72% and a timeline; **Certificates** holds a new PDF with a QR code. Opening the **verification link** in a private window, with no sign-in, shows it as valid.`,
  `Sign in as the **trainer**: the trainee appears under Trainees with the attempt, the passport, and the option to record a weighted evaluation that the engine blends in.`,
  `Sign in as the **administrator**: the heatmap and training needs rank organisational demand, the forecast shows where it is heading, a certificate can be revoked (the public page then says revoked), and the audit log shows everything above.`,
])}
${p(`The same scenario is replayed end to end by an automated integration test.`)}
${h2('The readiness and AR demonstration')}
${p(`This one begins where the first ends, and the figures below are the ones that actually appeared when it was rehearsed against a seeded database.`)}
${ol([
  `As the trainee, *Skill Gaps* shows Radar Meteorology at **35%** of the required **80%** — High severity, freshness **Watch**. No refresher is offered: the competency is current, simply under-trained.`,
  `Open the **AR Instrument Lab** → *Doppler Radar Lab*. Four guided training steps with hints, then five assessment tasks with none. On an Android phone, **View in AR** places the radar on the floor.`,
  `Submit. Four of five correct scores **practical 80%**. With no theory result yet the practical stands alone, and the engine moves Radar Meteorology from **35% to 69%**.`,
  `Take the Radar Fundamentals theory assessment. About **84%** passes, and the engine re-blends to roughly **73%**. Run the lab again and the result shows the weighting in full: **theory 84% × 40% + practical 80% × 60% = 81.6%**.`,
  `The passport records the practical alongside the assessment and the evaluation, with its date.`,
  `As the administrator, *AR Practicals* shows every attempt with the competency movement it caused; *Operational Readiness* shows the index with its arithmetic.`,
  `**Travel forward.** At **+90 days** the radar competency has decayed to **24%** and is **Critical**; at **+180 days** it is **Expired**. Nothing is written — the engine recomputes from the dates.`,
  `The dashboard now offers a **five-minute AR refresher**. Completing it records fresh practical evidence and resets freshness. The loop closes.`,
])}
${h2('What the seed creates')}
${table(
  'Seeded data',
  ['Group', 'Content'],
  [
    ['Framework', '7 departments, 9 job roles, 8 competencies, 41 role requirements.'],
    ['People', 'About 50 accounts: 4 trainers, 2 administrators, about 45 trainees.'],
    ['Learning', '15 published courses plus a draft and an archived one, about 60 modules, 90 materials, 15 assessments, about 130 questions.'],
    ['Activity', 'About 100 enrolments and attempts across a year, replayed in chronological order <em>through the real competency engine</em>, so every level and timeline is what the platform itself would have produced.'],
    ['AR', 'Two modules: the Doppler Radar Lab (8 components, 4 training and 5 assessment tasks, theory weight 0.4) and the Radar Refresher (4 tasks, practical only).'],
  ],
  { widths: ['16%', '84%'] },
)}
${chapterClose}`;

// ---------------------------------------------------------------- Appendix F

export const appF = (() => {
  const tests = JSON.parse(readData('tests.json'));
  const backend = tests.filter((t) => t.file.startsWith('backend/'));
  const frontend = tests.filter((t) => t.file.startsWith('frontend/'));
  const unit = backend.filter((t) => t.file.includes('/unit/'));
  const integration = backend.filter((t) => t.file.includes('/integration/'));
  const rows = (list) => list.map((t) => [`<code>${t.file}</code>`, String(t.its)]);
  return `${appendixOpen('F', 'Test Inventory')}
${table(
  'Results of the run this report cites',
  ['Suite', 'Files', 'Tests', 'Result'],
  [
    ['Backend (unit and integration)', '29', '614', '<strong>all passed</strong>'],
    ['Frontend', '15', '139', '<strong>all passed</strong>'],
    ['Total', '<strong>44</strong>', '<strong>753</strong>', '<strong>all passed</strong>'],
  ],
  { className: 'narrow', widths: ['46%', '14%', '14%', '26%'] },
)}
${note(
  'Why the declared counts below are lower',
  `The tables that follow count <code>it()</code> blocks as written in the source — ${tests.reduce((s, t) => s + t.its, 0)} of them. The runner reports 753, because parameterised blocks expand into one test per case at run time. Both figures are correct; the runner's is the number of assertions actually executed.`,
)}
${h2(`Backend unit tests — ${unit.length} files`)}
${table('Backend unit test files', ['File', 'Declared <code>it()</code> blocks'], rows(unit), { className: 'routes', widths: ['76%', '24%'] })}
${h2(`Backend integration tests — ${integration.length} files`)}
${table('Backend integration test files', ['File', 'Declared <code>it()</code> blocks'], rows(integration), { className: 'routes', widths: ['76%', '24%'] })}
${h2(`Frontend tests — ${frontend.length} files`)}
${table('Frontend test files', ['File', 'Declared <code>it()</code> blocks'], rows(frontend), { className: 'routes', widths: ['76%', '24%'] })}
${h2('What is not tested')}
${ul([
  `**No browser end-to-end suite is kept.** Flows were driven with throw-away scripts during development; the screenshots in this report came from those runs.`,
  `**The 3D viewer's rendering** cannot be exercised: the test environment has no WebGL. The tests cover the screens around it.`,
  `**No testing with assistive technology.** An automated axe-core scan of 31 screens came back clean, which is a different and weaker claim.`,
  `**The container images** have never been built or run.`,
])}
${chapterClose}`;
})();

// ---------------------------------------------------------------- Appendix G

export const appG = `${appendixOpen('G', 'Index of Figures by Source File')}
${p(
  `Every figure in this report, mapped to the file it came from. Screenshots live in <code>docs/screenshots/</code> and were captured in a real browser at 1440 × 900 against the seeded demonstration database. Diagrams live in <code>docs/report/diagrams/</code> and are generated by <code>docs/report/diagrams.mjs</code> from the implementation.`,
)}
${table(
  'Figures by source file',
  ['Figure', 'Source file', 'Caption'],
  figures.map((f) => [`<strong>${f.number}</strong>`, `<code>${f.file}</code>`, f.caption]),
  { className: 'routes', widths: ['9%', '30%', '61%'] },
)}
${note(
  'On authenticity',
  'No screenshot in this report was mocked, composited or retouched. Two of them — the course assistant and the quiz generator — were captured with a <em>scripted stand-in</em> for the language model, because no provider key was available; their captions say so. The AR lab screenshots taken on a desktop show the interactive 3D fallback, and their captions say that too rather than implying AR.',
)}
${chapterClose}`;

// ---------------------------------------------------------------- Appendix H

export const appH = `${appendixOpen('H', 'Glossary')}
${table(
  'Terms as this report uses them',
  ['Term', 'Meaning'],
  [
    ['Access role', 'Trainee, trainer or administrator. Decides permissions. <strong>Not</strong> the same as a job role.'],
    ['Job role', 'An organisational designation such as Severe Weather Forecaster. Carries competency requirements and a criticality rating.'],
    ['Competency', 'A named skill area, held by a person at a level from 0 to 100.'],
    ['Required level', 'What a job role needs of a competency, 0 to 100.'],
    ['Importance', 'How important a competency is <em>for that job role</em>, 1 to 5.'],
    ['Criticality', 'How mission-critical a job role is (1 to 5), or how operationally critical a competency is in its freshness policy.'],
    ['Skill gap', '<code>max(0, required − current)</code>. Never negative.'],
    ['Training priority', '<code>gap × (importance ÷ 5) × (criticality ÷ 5)</code>, on a 0 to 100 scale.'],
    ['Evidence', 'An assessment result, a trainer evaluation or a practical assessment. Self-declared profile skills are never evidence.'],
    ['Verified baseline', 'The level stored in <code>EmployeeCompetency.currentLevel</code>, recorded by the engine from evidence.'],
    ['Effective level', 'The baseline after decay is applied for a particular date. Derived on read; never stored.'],
    ['Half-life', 'The number of days over which an unpractised competency loses half its level.'],
    ['Freshness', 'Whether a competency is still current: Current, Watch, At risk, Critical or Expired.'],
    ['Recertification', 'Re-verification by fresh evidence, tracked separately from practice. An expired competency is not demonstrated, whatever its level.'],
    ['Readiness simulation', 'Recomputing gaps, freshness and readiness for a future date. Writes nothing.'],
    ['<code>asOf</code>', 'The date a read-only query is answered for. Reported back with every simulated response.'],
    ['Readiness event', 'A named operational period with its own competency requirements, measured at its start date.'],
    ['Readiness index', 'A single 0 to 100 organisational figure combining coverage, freshness and continuity, less a critical-gap penalty. A <strong>demonstration metric</strong>.'],
    ['Knowledge continuity', 'Whether enough people hold a competency, allowing for recorded retirement dates.'],
    ['Practical evidence', 'A trainer evaluation recorded as practical, or a completed AR practical — whichever is more recent.'],
    ['Idempotency key', 'A value generated when the user acted, making a replayed write return the original result instead of repeating the action.'],
    ['Mutation queue', 'The IndexedDB queue that holds writes made offline and sends them in order on reconnection.'],
    ['glTF / <code>.glb</code>', 'The open 3D transmission format, and its single-file binary form. The radar model is a 55 KB <code>.glb</code>.'],
    ['WebXR', 'The browser API for augmented and virtual reality. It is what places the radar in the room on a supported Android phone.'],
    ['Hotspot', 'A tappable marker on the 3D model. Here a real HTML button positioned in model space, so it is keyboard- and screen-reader-accessible.'],
    ['Simulated content', 'Demonstration data — decay policies, readiness events, practical scenarios — written for this project and flagged in the database. Not IMD policy.'],
    ['IMD / MoES', 'India Meteorological Department; Ministry of Earth Sciences.'],
    ['SIH26075', 'The Smart India Hackathon problem statement this project answers.'],
  ],
  { widths: ['22%', '78%'] },
)}
${chapterClose}`;
