/** Chapters 7-12: architecture, technology, database, data flow, use cases, sequence diagrams. */
import { chapterOpen, chapterClose, h2, h3, p, ul, ol, table, figure, note, warn, pre, chain, status } from '../kit.mjs';

export const ch7 = `${chapterOpen(7, 'System Architecture')}
${h2('Overview')}
${p(
  `Capacity Connect is a three-tier web application. A React single-page application runs in the browser, a stateless Node.js API serves JSON over HTTP, and PostgreSQL holds all state. The web tier and the API deploy independently. The competency logic is a set of pure functions that neither the web framework nor the database reaches into, which is what makes it testable in isolation and reproducible by hand.`,
)}
${figure(
  'architecture.svg',
  'System architecture: clients, edge, API pipeline, domain services and data',
  'Four clients are supported by the same API: a desktop browser that falls back to interactive 3D, an Android phone that can enter AR through WebXR, the installed progressive web app with its service worker and IndexedDB, and an unauthenticated public verifier that needs nothing but a certificate number. Every request crosses the same security pipeline before it reaches a route, and every domain service reaches the database only through Prisma. The engine settings live in a database row, not in code, so an administrator can retune the system without a deployment.',
  { diagram: true, size: 'full' },
)}

${h2('The request pipeline')}
${p(
  `<code>backend/src/app.ts</code> builds the Express application without binding a socket, so the integration tests drive the real application in process. Every request passes through the same ordered pipeline.`,
)}
${table(
  'The middleware pipeline, in order',
  ['#', 'Stage', 'What it does'],
  [
    ['1', '<code>requestId</code>', 'Assigns a UUID, echoes it as <code>X-Request-Id</code> and attaches it to the log line, so a user-visible error can be traced to a log entry.'],
    ['2', '<code>pino-http</code>', 'Structured JSON access log. Health checks are not logged. Passwords, tokens and AI prompts never reach the log.'],
    ['3', '<code>helmet</code>', 'Security headers with <code>default-src \'none\'</code> — the API returns only JSON and files, so it needs nothing else.'],
    ['4', '<code>cors</code>', 'Only the origins named in <code>FRONTEND_URL</code>, with credentials.'],
    ['5', 'Body parsing', '<code>express.json</code> with a 1 MB limit, and <code>cookie-parser</code>.'],
    ['6', '<code>Cache-Control: no-store</code>', 'On <code>/api</code> only. API responses are never cached by an intermediary.'],
    ['7', 'Rate limiter', 'Global budget per client address, with tighter budgets on sign-in, registration, password change, public verification and AI.'],
    ['8', 'CSRF guard', 'Every method other than GET, HEAD and OPTIONS must carry <code>X-Requested-With: CapacityConnect</code>.'],
    ['9', 'Routers', 'One router per feature module, mounted by <code>routes.ts</code>.'],
    ['10', 'Error handling', '<code>notFoundHandler</code>, then <code>errorHandler</code>, which turns every failure into the standard envelope.'],
  ],
  { widths: ['5%', '22%', '73%'] },
)}

${h2('Module structure')}
${p(
  `The API has twenty-two feature modules. Each is a folder with the same three layers, so a change has one obvious home and a reviewer knows where to look.`,
)}
${table(
  'The three layers of every backend module',
  ['Layer', 'Responsibility', 'Rule it must obey'],
  [
    ['<code>*.routes.ts</code>', 'HTTP: validate input, authenticate, check the access role, call one service, wrap the result in the response envelope.', 'No business logic, and no database calls beyond a trivial read.'],
    ['<code>*.service.ts</code>', 'Business rules, record-level authorisation, transactions, audit entries.', 'Takes the acting user explicitly; throws <code>AppError</code> with a stable code; never touches the HTTP request or response.'],
    ['<code>*.schemas.ts</code>', 'Zod schemas for every request body and query string.', 'Bodies are <code>strictObject</code>: an unknown field is a rejection, not a silently ignored value.'],
  ],
  { widths: ['18%', '40%', '42%'] },
)}
${p(
  `The twenty-two modules are: <code>auth</code>, <code>users</code>, <code>departments</code>, <code>roles</code>, <code>competencies</code>, <code>recommendations</code>, <code>courses</code>, <code>enrollments</code>, <code>assessments</code>, <code>certificates</code>, <code>evaluations</code>, <code>dashboard</code>, <code>achievements</code>, <code>notifications</code>, <code>announcements</code>, <code>reminders</code>, <code>analytics</code>, <code>readiness</code>, <code>ar</code>, <code>search</code>, <code>meta</code> and <code>ai</code>.`,
)}

${h2('The competency engine')}
${p(
  `<code>backend/src/modules/competencies/engine/</code> holds only pure functions. They take plain data and an <code>EngineConfig</code> object and return plain data. They do not know about HTTP, Prisma, the clock or the file system; a date they need is passed in. This is why Chapter 27 can report several hundred unit tests that run in milliseconds without a database, and why the worked examples in this report can be checked with a calculator.`,
)}
${table(
  'The pure-function engine',
  ['File', 'What it computes'],
  [
    ['<code>config.ts</code>', 'Every tunable number, its default and its validation rules.'],
    ['<code>skill-gap.ts</code>', 'Gap, severity band, training priority, ranking and the per-employee summary.'],
    ['<code>update.ts</code>', 'The competency update rule: evidence blended with the previous level, under the guard-rails.'],
    ['<code>evaluation.ts</code>', 'The weighted score of the five-criterion trainer rubric.'],
    ['<code>decay.ts</code>', 'Effective level from a baseline and a date, freshness status and the sentence explaining it.'],
    ['<code>succession.ts</code>', 'Knowledge-continuity risk from holders, expert thresholds and recorded retirement dates.'],
    ['<code>bands.ts</code>', 'The descriptive proficiency bands (Foundation, Developing, Proficient, Expert).'],
    ['<code>recommendation.ts</code>', 'Course recommendations and the Beginner → Intermediate → Advanced learning path.'],
  ],
  { widths: ['24%', '76%'] },
)}
${note(
  'Configuration, not code',
  'Every threshold and weight is stored in a <code>SystemSetting</code> row under <code>engine.config</code> and merged over the defaults on read. An administrator retunes the system from a screen; a stored configuration written by an older release still works, because merging over defaults means a newly added option simply takes its default.',
)}

${h2('What is atomic')}
${p(
  `The submission of an assessment is the system's central write, because one request scores an attempt, may issue a certificate, and moves a competency. All of it happens in one database transaction.`,
)}
${ol([
  `The attempt is **claimed** with a conditional update (<code>WHERE status = 'IN_PROGRESS'</code>), so a double submit or a race cannot score the same attempt twice.`,
  `The answers are stored and scored on the server against the question bank and the practical scenarios. The client has never held a score.`,
  `On a pass the certificate is issued and the enrolment moves to <code>CERTIFIED</code> or <code>COMPLETED</code>.`,
  `The engine gathers every currently valid piece of evidence, blends it with the previous level, and writes both the new level and the history row.`,
])}
${p(
  `Only after the commit come the side effects that must not be able to undo a scored result: notifications (idempotent through a dedupe key), the audit entry and the achievement checks. Time limits are enforced by the server against <code>expiresAt</code>; a late submission is refused and still counts as an attempt.`,
)}

${h2('Files, background work and errors')}
${ul([
  `**Files.** Uploads are validated by content — the magic bytes of the file itself, never the browser’s declared type or the extension — against an allow-list, and stored through a provider interface with a local-disk and an S3-compatible implementation. Downloads always pass through the API so it can check who may see the file; it then streams from disk with Range support for video seeking, or redirects to a short-lived pre-signed URL.`,
  `**Background work.** Reminders run in an in-process scheduler every six hours when <code>ENABLE_SCHEDULER=true</code>, inside a PostgreSQL advisory lock so only one instance runs them, and each notification carries a dedupe key so running twice never notifies twice. An administrator can also trigger a run.`,
  `**Errors.** Every expected failure is an <code>AppError</code> with a status, a stable machine-readable code and a message safe to show a user. Anything unexpected becomes a 500 with a generic message; the detail goes to the log with the request id.`,
  `**Audit.** Security- and governance-relevant actions append to <code>AuditLog</code> with the actor, the action, the record, the IP address and the user agent. A failure to write an audit row is logged but never breaks the operation it describes.`,
])}

${h2('Frontend architecture')}
${table(
  'How the single-page application is organised',
  ['Concern', 'Approach'],
  [
    ['Routing', 'Every page is code-split. Three workspaces (<code>/trainee</code>, <code>/trainer</code>, <code>/admin</code>) sit behind guards that mirror the server’s rules — the API remains the authority, and a role that opens a foreign URL gets a forbidden page rather than a broken one.'],
    ['Server state', 'TanStack Query with a central query-key factory, so a mutation invalidates exactly what it changed and nothing else. <code>useApiMutation</code> gives every write the same toast, invalidation and error display; <code>QueryBoundary</code> gives every read the same loading, error and retry states.'],
    ['Authentication', 'The session is a pair of HttpOnly cookies the application cannot read. It only knows who is signed in, from <code>GET /api/users/me</code>. An expired access token is refreshed once for all concurrent requests, and a failed refresh returns the user to sign-in.'],
    ['Forms', 'React Hook Form with Zod schemas that mirror the server’s; a server-side validation error is displayed against the field it belongs to.'],
    ['Design system', '<code>components/ui</code> holds the primitives so screens never restyle them; <code>components/domain</code> holds feature components such as the Competency Passport and the AR viewer.'],
    ['Offline', 'A hand-written service worker for GET requests and the app shell, plus an IndexedDB mutation queue owned by the application. Chapter 23 describes both.'],
    ['Resilience', 'An error boundary around every page and around the application, so a rendering failure never blanks the screen.'],
  ],
  { widths: ['16%', '84%'] },
)}
${p(
  `There are 58 page components: 19 administrator, 18 trainee, 10 trainer, 6 shared, 3 authentication and 2 public.`,
)}

${h2('Key architectural decisions')}
${table(
  'Decisions and the reasoning behind them',
  ['Decision', 'Why'],
  [
    ['A deterministic engine, with AI only around it', 'Government training records must be explainable and reproducible. A model may word a result; it may never produce one.'],
    ['Sessions in HttpOnly cookies with refresh-token rotation', 'Tokens are unreachable to injected script, and theft of a refresh token becomes detectable.'],
    ['Custom-header CSRF protection instead of a token store', 'A cross-site page cannot add a custom header without a CORS pre-flight, and the pre-flight is refused for every origin outside the allow-list. No server-side state is needed.'],
    ['Authorisation per route <em>and</em> per record', 'The user interface is never the access control. Knowing a URL must not be enough.'],
    ['Soft delete for users and courses', 'Certificates, attempts and the audit trail must keep their references when a person or a course goes away.'],
    ['Append-only history and audit tables', 'The passport timeline and the forecast are built from real events, not from overwritten state.'],
    ['One PostgreSQL; no queue, no cache tier', 'Fewer moving parts. The API is stateless, so capacity is added by running more instances.'],
    ['Prisma migrations plus SQL CHECK constraints', 'Schema changes are reviewed and repeatable, and the database itself refuses a competency level outside 0 to 100 whatever code calls it.'],
    ['Documentation checked by tooling', '<code>npm run routes -- --check</code> fails the build when the API reference and the registered routes diverge.'],
  ],
  { widths: ['34%', '66%'] },
)}
${chapterClose}`;

export const ch8 = `${chapterOpen(8, 'Technology Stack')}
${h2('Selection criteria')}
${p(
  `Four criteria decided every choice: one language across the whole stack so types can be shared and a small team can work everywhere; mature, widely deployed components with no licence cost; nothing that ties the system to a single cloud vendor; and the smallest set of moving parts that meets the requirements.`,
)}

${h2('The stack')}
${table(
  'Technologies used, by layer',
  ['Layer', 'Technology', 'Version', 'Why this one'],
  [
    ['Language', 'TypeScript', '5.9', 'One language across browser, server and tests, with strict mode on everywhere.'],
    ['Runtime', 'Node.js', '22 (20.19+ allowed)', 'Long-term-support runtime with native fetch and a stable ESM story.'],
    ['Web framework', 'Express', '5', 'Small, familiar and unopinionated; the security pipeline is explicit rather than hidden in a framework.'],
    ['ORM', 'Prisma', '6.19', 'A typed schema that generates the client and the migrations, so the database and the code cannot disagree about shapes.'],
    ['Database', 'PostgreSQL', '17', 'Transactions, CHECK constraints, JSON columns for history detail, advisory locks for the scheduler, and a real query planner for the analytics.'],
    ['Validation', 'Zod', '4', 'One schema language for request bodies, query strings, environment variables and AI responses.'],
    ['Password hashing', '<code>@node-rs/argon2</code>', '—', 'Argon2id, memory-hard, with cost parameters exposed as configuration.'],
    ['Tokens', '<code>jsonwebtoken</code>', '—', 'HS256 access tokens; refresh tokens are opaque and stored only as SHA-256.'],
    ['PDF and QR', 'PDFKit, <code>qrcode</code>', '—', 'Certificates rendered on demand on the server, with no headless browser in the deployment.'],
    ['Logging', 'pino', '—', 'Structured JSON logs with a request id on every line.'],
    ['UI library', 'React', '19', 'The team’s strongest skill, and the component model suits a design system.'],
    ['Build tool', 'Vite', '6', 'Fast development server, and a production build with per-route code splitting.'],
    ['Routing', 'React Router', '6.30', 'Nested layouts per workspace, with lazy route elements.'],
    ['Server state', 'TanStack Query', '5', 'Caching, invalidation and request de-duplication that would otherwise be hand-written and wrong.'],
    ['Forms', 'React Hook Form + Zod', '—', 'The same schema shape as the server, so validation rules are written once in spirit and twice in fact.'],
    ['Styling', 'Tailwind CSS', '3', 'A constrained design token set; contrast-checked colours defined in the theme rather than per screen.'],
    ['Charts', 'Recharts', '2', 'Composable SVG charts that sit next to the same figures as text, which accessibility required.'],
    ['3D and AR', '<code>@google/model-viewer</code>', '4.3.1', 'A web component that renders glTF and enters WebXR on Android, with a declarative hotspot API and a graceful fallback — no game engine.'],
    ['Testing', 'Vitest, Supertest, React Testing Library', '3 / — / —', 'Unit tests for the engine with no database; integration tests that drive the real Express app over HTTP against real PostgreSQL.'],
    ['Delivery', 'npm workspaces, Docker, nginx, GitHub Actions', '—', 'A monorepo with two workspaces; containers and a CI workflow described in Chapter 28.'],
  ],
  { className: 'stack', widths: ['15%', '25%', '13%', '47%'] },
)}

${h2('Notable choices and what was rejected')}
${h3('Web AR rather than a native application')}
${p(
  `The obvious route to augmented reality is Unity or Unreal and a native build for Android and iOS. That was ruled out at the start: it means two additional codebases, an app-store release cycle, and a separate authentication story, for a feature that has to be one step inside a web workflow. <code>&lt;model-viewer&gt;</code> renders a glTF binary in an ordinary page, enters an AR session through WebXR on supported Android devices, and degrades to an orbit-controlled 3D view everywhere else. The same page, the same session, the same assessment.`,
)}

${h3('An original 3D model')}
${p(
  `No Doppler weather radar model was found with a licence that could be relied on for this use. Rather than download one and hope, the model is generated by <code>scripts/build-ar-models.mjs</code>, a script in this repository that writes the glTF binary directly — a JSON chunk and a binary chunk, with accessors, buffer views and one material per part so a single component can be tinted at runtime. The output is 55 KB, eight parts, 2,316 triangles, about 1.2 m tall, and the build is reproducible: regenerating it yields an identical file. Chapter 22 and <code>docs/AR_ASSETS.md</code> carry the detail.`,
)}

${h3('No queue, no cache, no search cluster')}
${p(
  `Each would have solved a problem the system does not yet have, and each would have added an operational component a department must then run. Scheduled work uses a PostgreSQL advisory lock instead of a queue; search uses PostgreSQL rather than a search engine; caching is the browser's, not a server tier's. If any of these becomes a real bottleneck, the stateless API makes it straightforward to add one later.`,
)}

${h3('Two AI providers behind one interface')}
${p(
  `The optional AI features talk to a single client module. <code>AI_PROVIDER</code> selects an OpenAI adapter (which also drives any OpenAI-compatible endpoint through <code>OPENAI_BASE_URL</code>) or an Anthropic adapter. Every feature asks for structured output and validates it against a Zod schema and then against the database. Without a key the generative endpoints answer 503 and the rest of the platform is unchanged.`,
)}

${h2('Repository layout')}
${pre(
  `backend/            Express API (TypeScript)
  src/app.ts          the middleware pipeline; server.ts binds it to a port
  src/routes.ts       mounts every module under /api
  src/modules/        22 feature folders: routes + services + schemas
  src/middleware/     authenticate, requireRole, CSRF, rate limits, uploads, errors
  src/services/       audit log, notifications, scheduler, file storage
  src/lib/            errors, response envelope, Prisma client, crypto
  src/cli/            operator commands (create the first administrator)
  scripts/            list-routes.ts: prints and checks every registered route
  tests/              unit (pure logic) and integration (HTTP + PostgreSQL)
frontend/           React single-page application
  src/pages/          58 screens across trainee, trainer, admin, shared, auth, public
  src/components/     ui/ design-system primitives, domain/ feature components
  src/services/       typed API calls; src/api/ client, query keys, query client
  src/offline/        the service-worker registration and the mutation queue
  src/charts/         Recharts wrappers; src/hooks/ auth and shared hooks
  public/             service worker, web app manifest, icons, the .glb model
  nginx/              production web server template
prisma/             schema.prisma, 10 migrations, the deterministic demo seed
docs/               architecture, database, api, engine, security, deployment
  report/             the generator for this document, and its diagrams
  screenshots/        the 40 screenshots reproduced in this report
scripts/            local PostgreSQL, .env setup, the AR model generator`,
  'repository layout',
)}
${chapterClose}`;

export const ch9 = `${chapterOpen(9, 'Database Design')}
${h2('Principles')}
${p(
  `PostgreSQL is the only datastore. The schema is defined in <code>prisma/schema.prisma</code> and evolved through ten reviewed migrations. It holds **48 tables and 24 enumerated types**, with UUID primary keys and every timestamp stored as UTC.`,
)}
${ul([
  `**The database enforces its own invariants.** Prisma's schema language cannot express CHECK constraints, so a dedicated migration adds them in SQL. A competency level outside 0 to 100, an importance outside 1 to 5, a course mapping whose upper bound is not above its lower bound, or an e-mail address that is not lower case are refused by the database whatever code is calling it.`,
  `**History is append-only.** <code>CompetencyHistory</code> and <code>AuditLog</code> are never updated or deleted. The passport timeline, the trend forecast and the audit screen are all built by reading them.`,
  `**Records that must outlive their owner are protected by soft delete.** A deleted user or course keeps its row — with the unique fields released — so certificates, attempts and audit entries keep their references.`,
  `**Derived state is not stored when it is a function of a date.** No table holds a decayed competency level. Chapter 19 explains why this single rule made several features possible.`,
  `**Idempotency is a database constraint, not a convention.** Both <code>AssessmentAttempt</code> and <code>ARPracticalAttempt</code> carry a unique <code>(userId, idempotencyKey)</code> index, so a replayed submission cannot create a second attempt even under a race.`,
])}

${h2('The core schema')}
${figure(
  'er-core.svg',
  'Entity-relationship diagram: organisation, competency framework, learning, assessment and certification',
  'The organisational spine runs from Department and JobRole through User. RoleCompetency carries what a job role requires (a level and an importance); EmployeeCompetency carries what a person holds, and its currentLevel is the verified baseline, never a decayed value. CompetencyHistory records every change with a details column holding the formula inputs. On the learning side, a Course maps to competencies with a level band through CourseCompetency, contains Modules and LearningMaterials, and has at most one Assessment. AssessmentAttempt carries both halves of a mark (questions and practical scenarios) and the idempotency key. Certificate snapshots the holder, course, issuer and competencies so it stays stable if a record is edited later.',
  { diagram: true, size: 'full' },
)}

${h2('The readiness and AR schema')}
${figure(
  'er-readiness-ar.svg',
  'Entity-relationship diagram: competency freshness, readiness events, succession and the AR Instrument Lab',
  'Nothing in this group stores a decayed level. CompetencyDecayPolicy is opt-in per competency — with no row, a competency does not decay, does not expire and has no minimum safe level, so an installation that ignores the feature behaves exactly as it did before. CompetencyPracticeRecord is evidence that a competency was used, which resets decay without changing the verified level. ReadinessEvent and its requirements describe an operational period, measured at its own start date. On the AR side, ARComponent.key matches both the node and the material name inside the .glb, which is how the viewer highlights exactly one part, and ARTask.correctComponentId is the answer that never leaves the server while an attempt is open.',
  { diagram: true, size: 'full' },
)}

${h2('Tables by group')}
${h3('Organisation and accounts')}
${table(
  'Organisation and account tables',
  ['Table', 'Purpose', 'Notes'],
  [
    ['<code>Department</code>', 'Organisational unit (Forecasting, Radar Operations, ...)', 'Unique name and code; <code>isActive</code> hides one without destroying history.'],
    ['<code>Role</code>', 'Job role or designation', '<code>criticality</code> 1 to 5 multiplies into the training priority.'],
    ['<code>User</code>', 'Every account', 'Unique lower-case e-mail; access role; status (pending, active, rejected, suspended); <code>mustChangePassword</code>; failed-login counter and lock-out; <code>retirementDate</code> and <code>careerLevel</code> for continuity analysis; soft-deleted through <code>deletedAt</code>.'],
    ['<code>Session</code>', 'One row per signed-in device', 'Stores only the SHA-256 of the refresh token and of the previous one, which is what makes reuse detection possible; plus user agent, IP, expiry and revocation.'],
    ['<code>ProfessionalProfile</code>, <code>Qualification</code>, <code>WorkExperience</code>, <code>ProfileSkill</code>', 'The self-maintained profile', 'Self-declared skills are informational and never move a competency level.'],
  ],
  { widths: ['22%', '22%', '56%'] },
)}

${h3('Competency framework')}
${table(
  'Competency framework tables',
  ['Table', 'Purpose', 'Notes'],
  [
    ['<code>Competency</code>', 'A skill area', 'Unique code and name; optional level descriptors.'],
    ['<code>RoleCompetency</code>', 'What a job role requires', '<code>requiredLevel</code> 0 to 100 and <code>importance</code> 1 to 5, unique per role and competency.'],
    ['<code>EmployeeCompetency</code>', 'The verified level an employee holds', 'Unique per user and competency. <code>currentLevel</code> is the verified baseline; <code>lastPracticedAt</code> resets decay and <code>lastEvidenceAt</code> resets recertification.'],
    ['<code>CompetencyHistory</code>', 'Append-only timeline of every change', 'Previous and new level, the source, the course, attempt or evaluation that caused it, and a JSON <code>details</code> column holding the evidence components, the blend, the limiting rule and the explanation sentence.'],
  ],
  { widths: ['22%', '22%', '56%'] },
)}

${h3('Courses and learning')}
${table(
  'Course and learning tables',
  ['Table', 'Purpose', 'Notes'],
  [
    ['<code>Course</code>', 'A course', 'Draft, published or archived; difficulty; pass mark; owning trainer; soft delete.'],
    ['<code>CourseCompetency</code>', 'The band a course develops', '<code>levelFrom</code> to <code>levelTo</code>; the engine uses <code>levelTo</code> as the ceiling a course can certify.'],
    ['<code>CoursePrerequisite</code>', 'Course-to-course prerequisites', 'Composite key; cycles are guarded in the path builder.'],
    ['<code>Module</code>, <code>LearningMaterial</code>', 'Course content', 'Video, document, link or text. <code>extractedText</code> holds the readable text of an uploaded document — searchable, and the only thing the optional AI assistant ever reads.'],
    ['<code>Enrollment</code>', 'A learner in a course', 'Unique per user and course; status from enrolled through to certified; <code>progress</code> is a denormalised percentage.'],
    ['<code>ModuleProgress</code>', 'Which modules a learner finished', 'Unique per enrolment and module.'],
  ],
  { widths: ['22%', '22%', '56%'] },
)}

${h3('Assessment and certification')}
${table(
  'Assessment and certification tables',
  ['Table', 'Purpose', 'Notes'],
  [
    ['<code>Assessment</code>', 'At most one per course', 'Pass mark, time limit, attempt cap, deadline, questions drawn per attempt, shuffle and review switches; <code>mcqWeight</code> splits the final mark between questions and the practical component.'],
    ['<code>Question</code>, <code>QuestionOption</code>', 'The question bank', 'Single or multiple answer; marks of at least 1.'],
    ['<code>PracticalScenario</code>', 'A situation the trainee works through', 'A briefing, an optional image, and marks that are the sum of its steps.'],
    ['<code>PracticalScenarioStep</code>', 'One decision inside a scenario', 'Identify, interpret or act; carries an explanation shown after submission whatever was chosen.'],
    ['<code>PracticalScenarioOption</code>', 'A choice for a step', '<code>credit</code> between 0 and 1 — unlike a quiz option, a choice can be <em>partly</em> right, so a defensible but slower decision earns part of the marks.'],
    ['<code>PracticalResponse</code>', 'What one trainee chose', 'Stores the credit and marks awarded, so a past result stays explainable even if the scenario is later rewritten.'],
    ['<code>AssessmentAttempt</code>', 'One try', 'Fixed question order, a server-side <code>expiresAt</code>, the overall percentage and both halves separately, and a per-user unique <code>idempotencyKey</code>.'],
    ['<code>AssessmentAnswer</code>', 'Selected options and marks awarded', 'Unique per attempt and question.'],
    ['<code>Certificate</code>', 'An issued certificate', 'Public certificate number; snapshots of holder, course, issuer and signed competencies; valid or revoked; Ed25519 <code>signature</code>, <code>signatureKeyId</code> and <code>signedAt</code>.'],
    ['<code>Feedback</code>', 'Course and trainer rating', 'Unique per user and course.'],
    ['<code>TrainerEvaluation</code>', 'The weighted rubric', 'Five ratings from 1 to 5, the resulting weighted score, and the weights that were in force at the time.'],
  ],
  { widths: ['22%', '22%', '56%'] },
)}

${h3('Operational readiness')}
${table(
  'Operational readiness tables',
  ['Table', 'Purpose', 'Notes'],
  [
    ['<code>CompetencyDecayPolicy</code>', 'How one competency fades', 'Half-life, minimum safe level, recertification interval, criticality, and an enable switch. <strong>Opt-in</strong>: no row means no decay at all. <code>isSimulation</code> marks the demonstration values, which the interface labels as such.'],
    ['<code>CompetencyPracticeRecord</code>', 'Evidence a competency was used', 'Duty, exercise, course, assessment, mentoring or manual, with a date. Recording practice resets decay but never changes the verified level.'],
    ['<code>Mentorship</code>', 'An expert paired with somebody developing a competency', 'A record of intent, not an automated transfer of expertise.'],
    ['<code>ReadinessEvent</code>', 'An operational period to be ready for', 'Hazard type, start and end dates, priority, status; <code>isSimulation</code> marks demonstration events.'],
    ['<code>ReadinessRequirement</code>', 'What an event needs', 'Competency, required level and importance. Readiness is the weighted share of these met <strong>at the event’s start date</strong>.'],
    ['<code>ReadinessEventDepartment</code>', 'Who the event applies to', 'No rows means the whole active workforce.'],
    ['<code>ReadinessAssignment</code>', 'Preparation given to a person', 'Unique per event, user and competency, so assigning again is idempotent.'],
  ],
  { widths: ['22%', '22%', '56%'] },
)}

${h3('The AR Instrument Lab')}
${table(
  'AR Instrument Lab tables',
  ['Table', 'Purpose', 'Notes'],
  [
    ['<code>ARModule</code>', 'One instrument lab', 'A <code>key</code> used by the seed and by deep links; the <code>.glb</code> URL; full lab or refresher, a refresher pointing at its parent; <code>theoryWeight</code>; <code>isSimulation</code>.'],
    ['<code>ARComponent</code>', 'A part of the instrument', 'Its <code>key</code> matches the node <em>and material</em> name inside the <code>.glb</code>, which is how the viewer highlights exactly one part. <code>hotspotPosition</code> places the tappable marker in model space; scenery is marked non-interactive.'],
    ['<code>ARTask</code>', 'One thing the trainee is asked to do', 'Training phase (hints shown, nothing scored) or assessment phase (no hints, scored). <code>correctComponentId</code> is the answer, and it never leaves the server while an attempt is open.'],
    ['<code>ARPracticalAttempt</code>', 'One run of a practical', 'The practical percentage from the points, the theory percentage snapshotted at submission, the combined percentage, and the competency before and after so a trainer can see what it changed. Per-user unique idempotency key.'],
    ['<code>ARTaskResponse</code>', 'What was selected for one task', 'Unique per attempt and task; stores the marks awarded so a past result stays explainable.'],
  ],
  { widths: ['22%', '22%', '56%'] },
)}

${h3('Engagement and governance')}
${table(
  'Engagement and governance tables',
  ['Table', 'Purpose', 'Notes'],
  [
    ['<code>Notification</code>', 'In-app notifications', 'A per-user unique <code>dedupeKey</code> is what makes the scheduled jobs idempotent.'],
    ['<code>Announcement</code>', 'Broadcasts', 'Audience of all, trainees, trainers or administrators, optionally one department, with an optional expiry.'],
    ['<code>Achievement</code>', 'Badges earned', 'Unique per user and badge code.'],
    ['<code>AuditLog</code>', 'Who did what, when', 'Append-only: actor, action, entity, metadata, IP address, user agent.'],
    ['<code>SystemSetting</code>', 'Runtime configuration', 'Key and JSON value; holds <code>engine.config</code>, the entire tunable surface of the competency engine.'],
  ],
  { widths: ['22%', '22%', '56%'] },
)}

${h2('Indexes')}
${p(
  `Indexes follow the queries the screens actually run, not a general rule: <code>(userId, competencyId, createdAt)</code> on <code>CompetencyHistory</code> for timelines and the forecast; <code>(competencyId, currentLevel)</code> on <code>EmployeeCompetency</code> for the heatmap; <code>(courseId, status)</code> and <code>(userId, status)</code> on <code>Enrollment</code>; <code>(assessmentId, status)</code> and <code>(userId, submittedAt)</code> on <code>AssessmentAttempt</code>; <code>(userId, isRead, createdAt)</code> on <code>Notification</code>; and <code>createdAt</code>, <code>userId</code>, <code>(entityType, entityId)</code> and <code>action</code> on <code>AuditLog</code>, which are precisely the audit screen's filters.`,
)}

${h2('Migrations')}
${p(
  `Ten migrations, applied in order. They are forward-only: a bad release is recovered by restoring a backup, never by reversing a migration.`,
)}
${table(
  'The migration history',
  ['#', 'Migration', 'What it adds'],
  [
    ['1', '<code>20260920171757_init</code>', 'All initial tables, enums, unique constraints, foreign keys and indexes.'],
    ['2', '<code>20260920172500_data_integrity_constraints</code>', 'The SQL CHECK constraints.'],
    ['3', '<code>20260920174201_notification_achievement_and_material_text</code>', 'Notification dedupe key, achievements, and extracted text of uploaded materials.'],
    ['4', '<code>20260921142104_competency_decay_and_practice</code>', '<code>CompetencyDecayPolicy</code>, <code>CompetencyPracticeRecord</code>, and the two dates on <code>EmployeeCompetency</code>.'],
    ['5', '<code>20260921151528_succession_and_mentorship</code>', '<code>Mentorship</code>, and retirement date and career level on <code>User</code>.'],
    ['6', '<code>20260921152540_signed_certificates</code>', 'Ed25519 signature, key id and signing timestamp on <code>Certificate</code>.'],
    ['7', '<code>20260921154038_readiness_events</code>', 'The four readiness-event tables.'],
    ['8', '<code>20260921155220_practical_assessment</code>', 'Practical scenarios, steps, options and responses, and the practical half of an attempt.'],
    ['9', '<code>20260921212557_submission_idempotency</code>', 'The per-user unique idempotency key on <code>AssessmentAttempt</code>.'],
    ['10', '<code>20260922053021_ar_instrument_lab</code>', 'The five AR Instrument Lab tables.'],
  ],
  { widths: ['5%', '42%', '53%'] },
)}

${h2('Demonstration data')}
${p(
  `The seed does not simply insert rows. It **replays a year of learning activity in chronological order through the real competency engine**, so every level, history entry and timeline in the demonstration is exactly what the platform would have produced itself. The seed refuses to run when <code>NODE_ENV</code> is production.`,
)}
${table(
  'What the demonstration seed creates',
  ['Group', 'Content'],
  [
    ['Framework', '7 departments, 9 job roles, 8 competencies, 41 role requirements.'],
    ['People', 'About 50 accounts: 4 trainers, 2 administrators and about 45 trainees, including 3 awaiting approval and 1 suspended so the approval workflow can be demonstrated, with profiles, qualifications and skills.'],
    ['Learning', '15 published courses plus a draft and an archived one, about 60 modules and 90 materials, 15 assessments with about 130 questions, and prerequisite chains such as Radar Fundamentals → Doppler Radar Analysis → Advanced Radar Analysis.'],
    ['Activity', 'About 100 enrolments and attempts across the past year, with certificates, feedback, trainer evaluations, notifications, achievements and announcements.'],
    ['Readiness and AR', 'Decay policies, readiness events and two AR modules (a full Doppler radar lab and a five-minute refresher) with 8 components and 13 tasks — all flagged <code>isSimulation</code>.'],
  ],
  { widths: ['18%', '82%'] },
)}
${warn(
  'Demonstration content is not policy',
  'Every decay half-life, readiness event, hazard calendar and practical scenario in the seed is plausible training content written for this project. None of it is approved IMD policy. Each is stored with an <code>isSimulation</code> flag, and the interface says so wherever the values appear.',
)}
${chapterClose}`;

export const ch10 = `${chapterOpen(10, 'Data Flow Diagrams')}
${p(
  `The diagrams in this chapter were drawn from the implementation: the external entities are the actual client types, the processes correspond to the backend modules, and the data stores correspond to groups of tables in the schema of Chapter 9.`,
)}

${h2('Context diagram (Level 0)')}
${figure(
  'dfd-context.svg',
  'Context diagram: the system and the five external entities it exchanges data with',
  'Three signed-in entities and two unauthenticated ones. The public verifier is an external entity with no account at all — it presents a certificate number or follows a QR link and receives a verification result, which is why public verification appears as its own flow rather than as part of certification. The AI provider is drawn dashed because it exists only when an operator has configured a key; with no key, that flow does not exist and the generative endpoints answer 503.',
  { diagram: true, size: 'full' },
)}

${h2('Level 1 diagram')}
${figure(
  'dfd-level0.svg',
  'Level 1 data flow: six processes and seven data stores',
  'Process 4, the competency engine, is the hub: assessment, AR practical and trainer evaluation all reach it as evidence, and readiness, analytics and certification all read from what it maintains. Note that no process writes a decayed level into D4 — decay is applied on the way out, when a value is read for a particular date. D7 collects governance data (audit log, notifications, engine settings), which every process writes to and only the administrator reads.',
  { diagram: true, size: 'full' },
)}

${h2('Level 2: inside the competency engine')}
${figure(
  'dfd-level1.svg',
  'Level 2 data flow: process 4 (the competency engine) expanded into nine sub-processes',
  'Reading left to right, this is the whole of what the platform means by a competency figure. Sub-processes 4.1 to 4.6 are the read path and write nothing: the requirement is resolved from the job role, the verified baseline is read, decay is applied for the date being asked about, and the gap, priority and freshness status follow. Sub-processes 4.7 to 4.9 are the write path, which runs only when new evidence arrives: evidence is gathered across all sources, blended with the previous level under the guard-rails, and an append-only history row records the inputs and the explanation. The separation is exactly why a readiness simulation for a future date is safe — it exercises only the left half.',
  { diagram: true, size: 'full' },
)}

${h2('Data stores')}
${table(
  'The data stores and the tables behind them',
  ['Store', 'Name', 'Principal tables'],
  [
    ['D1', 'Users and framework', '<code>User</code>, <code>Department</code>, <code>Role</code>, <code>Competency</code>, <code>RoleCompetency</code>, <code>Session</code>, the profile tables'],
    ['D2', 'Learning', '<code>Course</code>, <code>CourseCompetency</code>, <code>CoursePrerequisite</code>, <code>Module</code>, <code>LearningMaterial</code>, <code>Enrollment</code>, <code>ModuleProgress</code>'],
    ['D3', 'Assessment', '<code>Assessment</code>, <code>Question</code>, <code>QuestionOption</code>, <code>PracticalScenario</code> and its steps and options, <code>AssessmentAttempt</code>, <code>AssessmentAnswer</code>, <code>PracticalResponse</code>'],
    ['D4', 'Competency state', '<code>EmployeeCompetency</code>, <code>CompetencyHistory</code>, <code>TrainerEvaluation</code>'],
    ['D5', 'Certificates', '<code>Certificate</code>'],
    ['D6', 'Readiness and AR', '<code>CompetencyDecayPolicy</code>, <code>CompetencyPracticeRecord</code>, <code>Mentorship</code>, the four readiness tables, the five AR tables'],
    ['D7', 'Governance', '<code>AuditLog</code>, <code>Notification</code>, <code>Announcement</code>, <code>Achievement</code>, <code>SystemSetting</code>'],
  ],
  { widths: ['7%', '22%', '71%'] },
)}

${h2('The rule that shapes every flow')}
${note(
  'Evidence in, derived values out',
  'No flow in any of these diagrams carries a score, a competency level or a completion <em>into</em> the system from a client. A client sends what the user did — which options were selected, which component was tapped, which module was opened. Everything else is computed on the server from data the client has never held. This is the integrity property that Chapter 26 treats as a security control, and it is visible here as the absence of an arrow.',
)}
${chapterClose}`;

export const ch11 = `${chapterOpen(11, 'Use Case Model')}
${h2('Actors')}
${table(
  'Actors',
  ['Actor', 'Description', 'Authenticated'],
  [
    ['Trainee', 'An employee developing competencies: the default access role for a new account.', 'Yes'],
    ['Trainer / SME', 'A subject-matter expert who authors courses and assessments and evaluates their own trainees.', 'Yes'],
    ['Administrator', 'The training office: people, framework, engine settings, analytics, readiness planning, governance.', 'Yes'],
    ['Public verifier', 'Anybody holding a certificate number or a QR link. Has no account and needs none.', 'No'],
    ['Scheduler', 'The system itself, acting on a timer: reminders for deadlines, stalled learners and unaddressed high-priority gaps.', 'System'],
  ],
  { widths: ['16%', '68%', '16%'] },
)}

${h2('Use case diagram')}
${figure(
  'use-case.svg',
  'Use case diagram: five actors and the principal use cases',
  'Two things in this diagram are worth noting. The public verifier reaches exactly one use case and needs no account, which keeps the verification surface as small as it can be. The scheduler is drawn as an actor because scheduled reminders are initiated by the system rather than by a person, and they are audited as such.',
  { diagram: true, size: 'full' },
)}

${h2('Principal use cases in detail')}
${h3('UC-1 Take a theory assessment')}
${table(
  'UC-1 Take a theory assessment',
  ['Field', 'Detail'],
  [
    ['Actor', 'Trainee'],
    ['Precondition', 'Enrolled in the course; the assessment is published; the attempt cap is not exhausted; any deadline has not passed.'],
    ['Main flow', '1. The trainee starts the assessment. 2. The server creates an attempt, fixes the question draw and order, and sets <code>expiresAt</code>. 3. The trainee answers; the client autosaves. 4. The trainee submits with an idempotency key. 5. The server claims the attempt, scores the questions and any practical scenarios, combines them by <code>mcqWeight</code>, issues a certificate on a pass, applies the result to the competency engine and writes history — all in one transaction. 6. The result page shows the score and the competency movement with its arithmetic.'],
    ['Alternative flows', 'The time limit expires: a late submission is refused and still counts as an attempt. A duplicate submission with the same idempotency key returns the original result. A failed attempt does not move the competency unless the administrator has switched that on.'],
    ['Postcondition', 'The attempt is scored and stored; where the result was evidence, the competency level and one history row exist.'],
  ],
  { widths: ['18%', '82%'] },
)}

${h3('UC-2 Take an AR practical')}
${table(
  'UC-2 Take an AR practical',
  ['Field', 'Detail'],
  [
    ['Actor', 'Trainee'],
    ['Precondition', 'The AR module is published. No device capability is required: AR is used where available, interactive 3D otherwise.'],
    ['Main flow', '1. The trainee opens the lab and starts it. 2. The server creates an attempt and returns the tasks and components <em>without</em> the answers. 3. Guided training tasks run first, with hints and no score. 4. Assessment tasks run with neither. 5. The trainee submits the components they selected. 6. The server marks against <code>correctComponentId</code>, combines with the latest passed theory result at the module’s weighting, records practice, applies practical evidence to the engine and writes history.'],
    ['Alternative flows', 'No AR support: the same tasks run on the orbit-controlled 3D model. No theory result yet: the practical stands alone. A replayed submission returns the original result.'],
    ['Postcondition', 'A scored attempt; the competency updated as practical evidence; that competency’s freshness reset.'],
  ],
  { widths: ['18%', '82%'] },
)}

${h3('UC-3 Run a readiness simulation')}
${table(
  'UC-3 Run a readiness simulation',
  ['Field', 'Detail'],
  [
    ['Actors', 'Administrator (workforce), Trainee (own record)'],
    ['Precondition', 'At least one competency has a decay policy.'],
    ['Main flow', '1. The actor chooses a future date or an offset in days. 2. The request carries <code>asOf</code> or <code>offsetDays</code>. 3. The server recomputes effective levels, freshness, gaps, priorities and the readiness index for that date. 4. The response is returned with <code>asOf</code> and <code>simulated: true</code>, and the interface labels it.'],
    ['Alternative flows', 'A date beyond the configured maximum horizon is refused. A competency with no decay policy is unaffected and reported as such.'],
    ['Postcondition', '<strong>None.</strong> No stored timestamp or level is modified. This is the defining property of the use case.'],
  ],
  { widths: ['18%', '82%'] },
)}

${h3('UC-4 Verify a certificate')}
${table(
  'UC-4 Verify a certificate',
  ['Field', 'Detail'],
  [
    ['Actor', 'Public verifier (unauthenticated)'],
    ['Precondition', 'None. A certificate number or the QR link is enough.'],
    ['Main flow', '1. The verifier scans the QR code or enters the number. 2. The server looks up the certificate, recomputes the canonical payload and checks the Ed25519 signature. 3. It returns valid, revoked, tampered, unsigned or unverifiable, with only the fields printed on the certificate.'],
    ['Alternative flows', 'The certificate was issued while no signing key was configured: it is reported as unsigned rather than as valid, and the page says what that means. The endpoint is rate-limited against enumeration.'],
    ['Postcondition', 'Nothing is written except the rate-limit counter. No personal data beyond what is printed on the certificate is disclosed.'],
  ],
  { widths: ['18%', '82%'] },
)}

${h3('UC-5 Work offline and synchronise')}
${table(
  'UC-5 Work offline and synchronise',
  ['Field', 'Detail'],
  [
    ['Actor', 'Trainee'],
    ['Precondition', 'The application is installed or has been opened once in a production build, and the course was saved for offline use while online.'],
    ['Main flow', '1. Connectivity is lost. 2. The service worker serves the cached app shell and the allow-listed GET responses. 3. The learner marks modules complete, leaves feedback, or submits an assessment already in progress. 4. Each write is persisted to the IndexedDB queue with an idempotency key generated at the moment of the action. 5. Connectivity returns; the application sends the queue oldest-first. 6. The indicator moves from OFFLINE to SYNCING to SYNC COMPLETE.'],
    ['Alternative flows', 'A server rejection in the 4xx range stops the retry and surfaces the entry to the learner rather than discarding it. A replayed write returns the original result. Signing out flushes the queue and then erases every device-held copy.'],
    ['Postcondition', 'Queued work is applied exactly once. Nothing is applied twice, and nothing is lost silently.'],
  ],
  { widths: ['18%', '82%'] },
)}

${h3('UC-6 Tune the engine')}
${table(
  'UC-6 Tune the engine',
  ['Field', 'Detail'],
  [
    ['Actor', 'Administrator'],
    ['Precondition', 'None.'],
    ['Main flow', '1. The administrator opens engine settings. 2. They change a threshold or weight. 3. The simulator shows the effect on one worked gap and one worked update before anything is saved. 4. They save; the configuration is validated (thresholds must strictly increase, rubric weights must sum to 1) and stored in <code>SystemSetting</code>. 5. The change is audited.'],
    ['Alternative flows', 'Invalid input is rejected with the specific rule that failed. <em>Restore defaults</em> removes the stored override entirely.'],
    ['Postcondition', 'Gaps and priorities are computed on read, so the change applies everywhere at once. <strong>Existing competency levels and history rows are never rewritten.</strong>'],
  ],
  { widths: ['18%', '82%'] },
)}
${chapterClose}`;

export const ch12 = `${chapterOpen(12, 'Sequence Diagrams')}
${p(
  `Each diagram in this chapter was traced through the actual code path: the participant names are real modules and services, and the messages correspond to real function calls and SQL operations.`,
)}

${h2('Sign-in and session establishment')}
${figure(
  'seq-login.svg',
  'Sequence: sign-in, session creation and the first authenticated request',
  'Two details matter for security. The Argon2id verification runs even for an unknown e-mail address — against a dummy hash — so the response time does not reveal which addresses exist, and the answer is the same "Incorrect email or password" either way. And the refresh token is never stored: only its SHA-256, which is what allows reuse detection without the server ever holding the token itself. The subsequent GET carries the HttpOnly cookie, which the application’s own JavaScript cannot read.',
  { diagram: true, size: 'full' },
)}

${h2('Skill-gap analysis, with and without simulation')}
${figure(
  'seq-skillgap.svg',
  'Sequence: computing skill gaps, freshness and priorities for a date',
  'The <code>offsetDays</code> parameter is the whole of the readiness-simulation feature on this path. It changes the date handed to <code>analyzeFreshness</code> and nothing else: the same query, the same pure functions, the same response shape. There is no write anywhere in this sequence, which is what makes asking about a date five years away as safe as asking about today.',
  { diagram: true, size: 'full' },
)}

${h2('Assessment submission')}
${figure(
  'seq-assessment.svg',
  'Sequence: submitting an assessment, scoring it and updating the competency',
  'This is the system’s central write. The idempotency check comes first, before any work is done, so a replay costs nothing. Scoring is entirely server-side, against questions and options the client was never sent in a form it could exploit. The transaction spans the attempt update, the answers, the competency change, the history row and the certificate, so a partially applied submission is not a state the database can be in. Everything that could safely happen afterwards — notifications, the audit entry, achievement checks — happens after the commit, so a failure there can never roll back a scored result.',
  { diagram: true, size: 'full' },
)}

${h2('Certificate issue and public verification')}
${figure(
  'seq-certificate.svg',
  'Sequence: issuing a signed certificate, and verifying one without signing in',
  'Issue and verification are shown together because verification only makes sense against what issue recorded. The canonical payload is recomputed at verification time from the certificate’s own snapshotted fields and checked against the stored signature, so an edit to the underlying user or course record cannot silently change what a certificate claims. Four outcomes are distinguished: valid, tampered, unsigned (issued while no key was configured) and unverifiable. Reporting "unsigned" honestly, rather than reporting it as valid, is the reason the fourth state exists.',
  { diagram: true, size: 'full' },
)}

${h2('AR practical')}
${figure(
  'seq-ar-practical.svg',
  'Sequence: an AR practical from start to competency update',
  'The tasks and components are returned to the phone <em>without</em> <code>correctComponentId</code> and without hints during the assessment phase, so the answers are not present in the browser at any point during a scored attempt. On submission the server marks, finds the most recent passed theory attempt for the linked course, and combines the two at the module’s configured weighting. The transaction then does two distinct things: <code>recordPractice()</code> resets the competency’s freshness clock, and <code>applyCompetencyEvidence()</code> blends the practical into the level. They are separate because practising a skill and proving it are separate claims.',
  { diagram: true, size: 'full' },
)}

${h2('Offline work and synchronisation')}
${figure(
  'seq-offline-sync.svg',
  'Sequence: saving a course, working offline and draining the queue on reconnection',
  'The service worker appears only in the read half of this diagram. It never replays a write — that is the application’s job, through the IndexedDB queue, because only the application knows the correct order, what to tell the learner and when to stop retrying. The idempotency key is generated at the moment the learner acts, not at the moment the request is sent, which is what makes a replay after a dropped connection return the original result rather than consume a second attempt.',
  { diagram: true, size: 'full' },
)}

${h2('What the six have in common')}
${p(
  `Read them together and one pattern is visible in all six: the browser is a source of *intent* and never a source of *fact*. It says which options were selected, which component was tapped, which module was opened and when the learner acted. Every fact — the score, the level, the pass, the signature, the ordering of the queue on the server side — is established by the API against data the browser has never held.`,
)}
${chapterClose}`;
