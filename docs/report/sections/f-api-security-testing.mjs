/** Chapters 25-27: the API surface, security, testing and validation. */
import { chapterOpen, chapterClose, h2, h3, p, ul, ol, table, figure, note, warn, pre, chain, status } from '../kit.mjs';

export const ch25 = `${chapterOpen(25, 'API Documentation')}
${h2('Conventions')}
${p(
  `A JSON REST API under <code>/api</code>. **175 endpoints** are registered, and every one of them is documented in <code>docs/api.md</code>. The complete list, with the access rule of each, is reproduced in Appendix B.`,
)}
${table(
  'API conventions',
  ['Aspect', 'Convention'],
  [
    ['Success envelope', '<code>{ success: true, data, meta }</code>. <code>meta</code> carries pagination and, on any endpoint that accepts a date, the <code>asOf</code> that was used and whether the result is simulated.'],
    ['Error envelope', '<code>{ success: false, code, message }</code>, plus per-field details on a validation failure. The <code>code</code> is stable and machine-readable; the <code>message</code> is safe to display.'],
    ['Authentication', 'HttpOnly cookies. The access token is a JWT; the refresh token is opaque and its cookie path is restricted to <code>/api/auth</code>.'],
    ['CSRF', 'Every method other than GET, HEAD and OPTIONS must carry <code>X-Requested-With: CapacityConnect</code>.'],
    ['Validation', 'Zod on every body and query. Bodies are <code>strictObject</code>: an unknown field is rejected, not ignored. Identifiers must be UUIDs.'],
    ['Pagination', '<code>page</code> and <code>pageSize</code> query parameters; totals returned in <code>meta</code>.'],
    ['Caching', 'Every API response carries <code>Cache-Control: no-store</code>.'],
    ['Idempotency', 'Assessment and AR practical submissions accept an <code>idempotencyKey</code>, unique per user, and a replay returns the original result.'],
    ['Simulation', 'Read-only endpoints that report freshness accept <code>asOf</code> or <code>offsetDays</code> and never write.'],
  ],
  { widths: ['18%', '82%'] },
)}

${h2('Endpoints by group')}
${table(
  'The 175 endpoints, by route group',
  ['Group', 'Count', 'What it covers'],
  [
    ['<code>/api/courses</code>', '27', 'Catalogue, authoring, modules, materials, thumbnails, insights, feedback.'],
    ['<code>/api/users</code>', '25', 'Accounts, approval, profile, qualifications, experience, skills, competency adjustment.'],
    ['<code>/api/assessments</code>', '16', 'Authoring, the question bank, practical scenarios, attempts, submission, results.'],
    ['<code>/api/competencies</code>', '16', 'The framework, the passport, evidence, practice records, engine configuration and the simulator.'],
    ['<code>/api/admin</code>', '13', 'Heatmap, training needs, predictive needs, analytics, announcements, audit log, reminder jobs.'],
    ['<code>/api/readiness</code>', '11', 'Readiness events, requirements, departments, assignments, the overview and the index.'],
    ['<code>/api/ar</code>', '8', 'Modules, start, submit, attempts, analytics, refresher recommendation.'],
    ['<code>/api/certificates</code>', '8', 'Issue, list, PDF, revoke, reinstate, and public verification.'],
    ['<code>/api/roles</code>', '7', 'Job roles and their competency requirements.'],
    ['<code>/api/succession</code>', '6', 'Knowledge-continuity analysis and mentorships.'],
    ['<code>/api/auth</code>', '5', 'Register, sign in, refresh, sign out, change password.'],
    ['<code>/api/enrollments</code>', '5', 'Enrol, withdraw, progress, module completion.'],
    ['<code>/api/notifications</code>', '5', 'List, read, mark all read, delete.'],
    ['<code>/api/ai</code>', '5', 'The five optional generative features.'],
    ['<code>/api/departments</code>', '4', 'Departments.'],
    ['<code>/api/evaluations</code>', '4', 'The trainer rubric.'],
    ['<code>/api/dashboard</code>', '2', 'Per-role dashboard aggregates.'],
    ['<code>/api/skill-gaps</code>', '2', 'Own gaps and another user’s, both accepting a date.'],
    ['<code>/api/achievements</code>, <code>/api/announcements</code>, <code>/api/search</code>, <code>/api/recommendations</code>, <code>/api/meta</code>, <code>/api/health</code>', '6', 'One endpoint each.'],
  ],
  { widths: ['24%', '9%', '67%'] },
)}

${h2('The public surface')}
${p(`Without signing in, exactly these are reachable — and the list is deliberately short:`)}
${ul([
  `<code>GET /api/health</code>`,
  `<code>GET /api/meta/options</code> — department and job-role names, the registration policy and the feature flags the sign-in and registration screens need`,
  `<code>GET /api/courses/:id/thumbnail</code> — course images are not sensitive, and a plain <code>&lt;img&gt;</code> tag cannot send credentials across sites`,
  `sign-in, registration, refresh and sign-out`,
  `<code>GET /api/certificates/verify/:certificateId</code> — returning only what is printed on the certificate, and rate-limited against enumeration`,
])}

${h2('Representative endpoints')}
${table(
  'A selection, with the access rule of each',
  ['Method and path', 'Access', 'Behaviour'],
  [
    ['<code>POST /api/auth/login</code>', 'Public', 'Sets both cookies. Identical response for an unknown address and a wrong password. Rate-limited on failures.'],
    ['<code>GET /api/skill-gaps/me?offsetDays=90</code>', 'Signed in', 'Gaps, severities, priorities and freshness recomputed for a future date. Writes nothing; reports <code>asOf</code> and <code>simulated: true</code>.'],
    ['<code>POST /api/assessments/:id/submit</code>', 'Trainee', 'The central write. Claims the attempt, scores it, issues a certificate on a pass, applies evidence and writes history, all in one transaction. Idempotent.'],
    ['<code>POST /api/ar/modules/:idOrKey/submit</code>', 'Trainee', 'Marks the practical server-side, combines with theory, records practice and applies practical evidence. Idempotent.'],
    ['<code>GET /api/ar/refresher</code>', 'Signed in', 'The AR refresher the freshness engine recommends for this user, or nothing.'],
    ['<code>GET /api/certificates/verify/:certificateId</code>', 'Public', 'Recomputes the canonical payload and checks the Ed25519 signature. Returns valid, revoked, tampered, unsigned or unverifiable.'],
    ['<code>GET /api/admin/heatmap</code>', 'Administrator', 'Average level, required level and gap per department or job role × competency, with the freshness layer and change over time.'],
    ['<code>GET /api/admin/predictive-needs?horizon=6</code>', 'Administrator', 'The least-squares trend forecast. No AI is involved.'],
    ['<code>GET /api/readiness/events/:id</code>', 'Administrator', 'Readiness for one operational period, measured at its own start date.'],
    ['<code>PUT /api/competencies/engine/config</code>', 'Administrator', 'Replaces the engine configuration after validation. Audited. Never rewrites an existing level or history row.'],
    ['<code>POST /api/competencies/engine/simulate</code>', 'Administrator', 'Previews the effect of a configuration change on one gap and one update, without saving.'],
  ],
  { widths: ['30%', '13%', '57%'] },
)}

${h2('Documentation kept honest by tooling')}
${note(
  'The documentation cannot drift',
  '<code>npm run routes</code> prints every route Express has actually registered, with its access rule. <code>npm run routes -- --check</code> compares that list with <code>docs/api.md</code> and <strong>fails</strong> when they disagree. It runs in the continuous-integration workflow, so an endpoint added without documenting it, or documented without being added, breaks the build. The figure of 175 in this chapter is that command’s output, not a count maintained by hand.',
)}
${chapterClose}`;

export const ch26 = `${chapterOpen(26, 'Security Implementation')}
${h2('Approach')}
${p(
  `The system holds staff records, competency assessments and an audit trail, so it was treated as an internal application handling personal data rather than as a demonstration. Controls are enforced on the server; the web application is never the access control. This chapter states what protects the platform, where each control lives, and — at the end — what it does **not** do.`,
)}
${table(
  'Controls at a glance',
  ['Area', 'Control'],
  [
    ['Passwords', 'Argon2id, memory-hard; a policy of at least ten characters with lower, upper, digit and symbol; timing-equalised sign-in; account lock-out.'],
    ['Sessions', 'HttpOnly cookies; short-lived access token; rotating refresh token with reuse detection; server-side revocation.'],
    ['Authorisation', 'Role check per route <em>and</em> ownership check per record, on the server, with the role re-read from the database on every request.'],
    ['CSRF and CORS', 'A custom header required on every write; a strict origin allow-list; SameSite cookies.'],
    ['Input', 'Zod <code>strictObject</code> validation on every body and query; parameterised queries only.'],
    ['Files', 'Type detected from content; an allow-list; a size cap; safe names; storage keys the client cannot influence; downloads always authorised.'],
    ['Abuse', 'Rate limits — global, sign-in, registration, public verification, and AI per user — plus account lock-out.'],
    ['Data', 'No secrets in code or logs; personal data minimised in public and AI-bound responses; an append-only audit trail.'],
    ['Browser', 'A strict Content-Security-Policy and security headers on both the API and the web tier.'],
    ['AI (optional)', 'Advisory only; output treated as untrusted; minimal data; no prompt logging.'],
  ],
  { widths: ['16%', '84%'] },
)}

${h2('Authentication and sessions')}
${p(`Described in Chapter 13. The points that matter as security controls rather than as features:`)}
${ul([
  `Argon2id with configurable memory and time cost, so the work factor can be raised on production hardware without a code change.`,
  `A dummy hash is verified for unknown e-mail addresses, so response time does not disclose which addresses exist.`,
  `The access token's role claim is never trusted: session, account status and current role are re-read from the database on every request, so a revocation, suspension or demotion takes effect immediately.`,
  `Only the SHA-256 of a refresh token is stored, with the previous one retained for reuse detection. Presenting a rotated token outside a fifteen-second grace window revokes the whole session and writes a <code>SESSION_REUSE_DETECTED</code> audit entry.`,
  `Production start-up is **refused** unless secure cookies are enabled and the frontend origin is set, and unless the JWT secret is at least 32 characters. A cross-site cookie policy additionally requires secure cookies. Misconfiguration fails loudly at boot rather than quietly at runtime.`,
])}

${h2('Authorisation')}
${p(
  `Two independent layers on every request: the route's role requirement, and the record-level rule inside the service. The rules and the tests that pin them are set out in Chapter 13. The principle behind them is that knowing a URL must never be sufficient, and that the user interface hiding a control is a convenience, not a control.`,
)}

${h2('Browser protections')}
${table(
  'Browser-side controls',
  ['Threat', 'Control'],
  [
    ['CSRF', 'Every state-changing request must carry <code>X-Requested-With: CapacityConnect</code>. A cross-site page cannot add a custom header without a CORS pre-flight, and the pre-flight is refused for every origin outside the allow-list. With the JSON-only body parser and SameSite cookies, this covers classic and login CSRF without a server-side token store.'],
    ['XSS', 'React escapes everything it renders, and the codebase contains no <code>dangerouslySetInnerHTML</code>. The web tier serves <code>Content-Security-Policy: default-src \'self\'; script-src \'self\'</code> with no inline script and no external script hosts; the API answers with <code>default-src \'none\'</code>. The policy was checked in a real browser against the production bundle — fonts, QR codes, PDF opening and charts all work with no violations.'],
    ['Clickjacking', '<code>X-Frame-Options: DENY</code>.'],
    ['MIME sniffing', '<code>X-Content-Type-Options: nosniff</code>.'],
    ['Referrer leakage', '<code>Referrer-Policy: no-referrer</code>, plus a restrictive <code>Permissions-Policy</code>.'],
    ['Open redirects', 'Every navigation target that comes from data — a notification link, a stored "where were you going" state — must be an in-app path. Absolute, protocol-relative, backslash and <code>javascript:</code> targets are ignored, and the check is unit-tested.'],
  ],
  { widths: ['18%', '82%'] },
)}

${h2('Input, data access and files')}
${ul([
  `Every body and query is validated by a Zod schema. Bodies are <code>strictObject</code>, so an unknown field is rejected rather than silently stored. Identifiers must be UUIDs, text has length limits, enumerations are closed.`,
  `All database access goes through Prisma, which parameterises. The few raw queries the query builder cannot express — the heatmap, the history replay, the forecast — use tagged SQL templates that bind every value. There is no string-built SQL and no unsafe raw query anywhere in the application.`,
  `Mass assignment is impossible by construction: services pick fields explicitly and responses pass through explicit mappers, so a password hash or a lock-out counter cannot leak through a response shape.`,
  `Uploads are validated by **content** — the file's magic bytes — never by the browser's declared type or the extension. The allow-list covers PDF, PNG, JPEG, GIF, WebP, Office documents, plain text, MP4 and WebM. **SVG and HTML are excluded**, because both can carry script. Display names are sanitised, storage keys are generated by the server with a traversal guard, and every download passes the API's access check. Inline display is limited to types that cannot execute script.`,
])}

${h2('Abuse controls')}
${table(
  'Rate limits',
  ['Scope', 'Limit'],
  [
    ['Overall, per client address', '1000 requests per 15 minutes'],
    ['Sign-in', '30 per 15 minutes, counting <strong>failures only</strong>, so colleagues behind one address do not lock each other out'],
    ['Registration and password change', '30 per 15 minutes'],
    ['Public certificate verification', '60 per minute'],
    ['AI features', '30 per hour per signed-in user; failed requests do not count'],
  ],
  { className: 'narrow', widths: ['52%', '48%'] },
)}
${p(
  `A proxy-hop count is configurable so that limits and audit entries record the real client address. The limiter keeps its counters in memory, which is a known limitation with several API instances — each has its own budget — and is listed as such below.`,
)}

${h2('Data protection')}
${ul([
  `**No secrets in code.** Configuration comes from environment variables validated at start-up; the environment file is excluded from version control and from container images, and the example file documents every variable **without values**. Logs are structured JSON and never contain passwords, tokens or AI prompts.`,
  `**Personal data is enumerated.** The tables holding it are named in Chapter 9 and in the database documentation. Passwords are stored only as Argon2id hashes and refresh tokens only as SHA-256 hashes.`,
  `**Public disclosure is minimal.** Certificate verification returns only what is printed on the certificate. Certificate numbers are eight characters from a 31-symbol alphabet after a prefix and a year — roughly 8.5 × 10¹¹ possibilities — and the endpoint is rate-limited against guessing.`,
  `**Soft delete preserves the record.** A deleted user keeps their row, with the e-mail address and employee identifier released, so certificates and the audit trail stay intact. An organisation that must erase personal data entirely should anonymise the row rather than remove it.`,
])}

${h2('Data on the device')}
${p(`Covered in Chapter 23. In summary: an allow-list of cached GET responses, scoped to the origin, with no cached authority, and everything erased on sign-out.`)}

${h2('The optional AI features')}
${table(
  'What leaves the server, and only when a user uses the feature',
  ['Feature', 'Sent to the AI service', 'Never sent'],
  [
    ['Course assistant', 'The user’s question and the text of that course’s own materials', 'Name, e-mail, employee identifier, anything about other users'],
    ['Quiz generator', 'The course’s material text, the wording of its existing questions, the trainer’s options', 'Any learner data'],
    ['Study plan', 'Job-role name, skill gaps, recommended course titles and the engine’s reasons', 'Name, e-mail, employee identifier, user id'],
    ['Plain-language search', 'The typed request and the names of active competencies and course categories', 'Any user data; the catalogue itself'],
    ['Forecast briefing', 'Aggregated, already-calculated figures per competency', 'Employee names or any individual’s data'],
  ],
  { widths: ['16%', '48%', '36%'] },
)}
${p(
  `Users see a plain notice of exactly what is sent next to every AI feature, naming the service that will receive it — taken from the server's configuration, so it cannot drift from what is really used. Use is audited with sizes and token counts, never with prompts or answers. The provider's own data-handling terms apply to what is sent, and the documentation says so and says to review them before enabling the features for real staff data. The key travels only in the <code>Authorization</code> header, over HTTPS; production refuses a non-HTTPS provider address unless it is on the same machine.`,
)}

${h2('Audit trail')}
${p(
  `<code>AuditLog</code> is append-only and records the actor, the action, the affected record, the IP address and the user agent for: sign-ins and failures, lock-outs, refresh-token reuse, account creation, approval, role and status changes, password resets, framework changes, competency adjustments, course and assessment authoring and publication, submissions, certificate issue, revocation and reinstatement, engine settings, announcements, reminder runs and AI use. A failure to write an audit row is logged but never blocks the operation it describes.`,
)}

${h2('Dependency review')}
${p(`A dependency audit was run for this release. After upgrading the router to 6.30.6 — which fixed an open-redirect advisory — and PostCSS to 8.5.28, the remaining findings are:`)}
${ul([
  `A transitive package inside the Prisma **command-line tool**, which is a development-time loader and is not part of the running API. The only offered fix is a Prisma downgrade.`,
  `Two moderate advisories in the 6.x router: an open redirect through a backslash in a link or navigation target, and deserialisation during server-side rendering. The first requires an attacker-controlled navigation target, which this application never uses — every data-derived target goes through the in-app path check described above. The second concerns server-side rendering hydration, which a single-page application does not perform. The fix exists only in the 7.x line; it should be taken when the router is next migrated.`,
])}

${h2('Known limitations')}
${warn(
  'Stated plainly, because a security chapter that lists only strengths is not a security chapter',
  '',
)}
${ul([
  `**No multi-factor authentication**, and no password reset by e-mail — an administrator issues a temporary password. There is no e-mail delivery at all; notifications are in-app only.`,
  `**No malware scanning of uploads.** A deployment that needs it should scan on upload.`,
  `**No per-user data export or erasure tooling** beyond soft delete.`,
  `**Rate limiting is per API instance**, so several instances each have their own budget. A shared store or a gateway limit is needed for a global one.`,
  `**Offline copies stay on the device until sign-out.** There is no remote wipe, and no encryption of the browser's storage beyond what the operating system and browser profile provide.`,
  `**No background synchronisation**, so a learner who works offline and never reopens the application never syncs.`,
  `**The demonstration seed creates well-known accounts.** It refuses to run in production, and the production flag that would override that must never be set on a real system.`,
  `**The container images have never been built or run**, because no Docker was available in the development environment. The first deployment must be treated as a test. This is repeated in Chapter 28.`,
])}

${h2('Production hardening checklist')}
${ol([
  `Set production mode and secure cookies, terminate TLS in front of the web tier, and set the proxy-hop count to the real value.`,
  `Generate a strong, unique JWT secret.`,
  `Set the frontend origin to exactly the public web origin; require registration approval; restrict the permitted e-mail domains.`,
  `Create the first administrator with the command-line tool and change its temporary password. Create no demonstration accounts.`,
  `Make the database and upload storage private, encrypted at rest, backed up and **restore-tested**; use a least-privilege database user.`,
  `Raise the Argon2 cost for the hardware; review the rate limits; add an external limit if there are several instances.`,
  `Ship logs and alert on refresh-token reuse, repeated lock-outs and 5xx rates.`,
  `Review the dependency audit in continuous integration; rebuild images regularly for base-image fixes.`,
  `Decide deliberately whether to enable the AI features and with which provider, and review the table above with the data-protection officer.`,
])}
${chapterClose}`;

export const ch27 = `${chapterOpen(27, 'Testing and Validation')}
${h2('Strategy')}
${p(
  `The engine is pure functions, so it is tested exhaustively without a database. Everything that touches HTTP, authorisation or the database is tested through the **real Express application against a real PostgreSQL**, not against mocks — because the bugs that matter in this system are transaction bugs, authorisation bugs and ordering bugs, and a mocked database cannot express any of them.`,
)}
${table(
  'The test suites',
  ['Suite', 'Runner', 'Target', 'What it proves'],
  [
    ['Backend unit', 'Vitest', 'Pure functions; no database, no clock', 'Every engine rule, reproduced against worked examples.'],
    ['Backend integration', 'Vitest + Supertest', 'The real app over HTTP against real PostgreSQL', 'Authorisation, transactions, idempotency, scoring and the end-to-end flows.'],
    ['Frontend', 'Vitest + React Testing Library', 'Components against a scripted API', 'The API client, route guards, the offline queue, and accessibility contracts.'],
  ],
  { widths: ['18%', '22%', '30%', '30%'] },
)}

${h2('What the backend unit tests cover')}
${ul([
  `The skill-gap rules: gap, severity bands, training priority and ranking, including both worked examples from the problem brief.`,
  `The update rule: single-source and multi-source blending, renormalisation of the evidence weights over the sources actually present, the no-decrease guard-rail and the course ceiling.`,
  `The trainer rubric: weighted scoring, and the requirement that the weights sum to 1.`,
  `Decay: the effective level for a date, every freshness status and the order they are evaluated in, criticality tightening the critical threshold, and the inertness of a competency with no policy.`,
  `Succession: expert and developing thresholds, the retirement window, the minimum-expert rule and every risk classification.`,
  `The readiness index: each component, the critical-gap penalty and the bands.`,
  `Recommendation and learning-path construction, including prerequisite ordering, locking and cycle detection.`,
  `The forecast arithmetic: monthly averages over a fixed population, the least-squares pace, the projection, the outlook categories and the confidence rule.`,
  `Infrastructure: configuration validation, rate limits, upload validation, and the AI client against a local stand-in for the providers' HTTP protocols.`,
])}

${h2('What the integration tests cover')}
${ul([
  `Authentication and sessions: lock-out, the forced password change, refresh rotation and reuse detection.`,
  `Role-based access control and record ownership — every rule listed in Chapter 13 has a test that tries to break it.`,
  `Courses, authoring, publication and materials.`,
  `Assessments: server-side scoring, the time limit, the attempt cap, partial credit on practical scenarios, and idempotent submission.`,
  `The AR Instrument Lab end to end: server-side marking, the theory and practical weighting, the competency update, and the decay-driven refresher recommendation.`,
  `Certificates: signing, public verification, tamper detection, revocation and reinstatement.`,
  `Competency decay and the readiness simulation, including the guarantee that a simulation writes nothing.`,
  `Readiness events and assignment; knowledge continuity.`,
  `Organisation analytics: the heatmap and its freshness layer, training needs, and the forecast.`,
  `The complete demonstration scenario, replayed through the HTTP API from a 35% baseline to a verified certificate.`,
  `The AI features against a scripted fake model, and the administrator command-line tool.`,
])}

${h2('What the frontend tests cover')}
${ul([
  `The API client: the CSRF header on every write, the response envelope, and single-flight session refresh under concurrent requests.`,
  `Sign-in, including a regression test for the forced-password-change path.`,
  `Route guards for all three workspaces.`,
  `The offline mutation queue: ordering, idempotency, retry and give-up behaviour, and the status indicator.`,
  `The AI screens and the quiz generator.`,
  `Link safety — the in-app path check that blocks open redirects.`,
  `Accessibility contracts: tab semantics, keyboard-reachable table scroll areas, heading structure, landmarks, and the heatmap's text contrast, which is tested for every value it can render.`,
])}

${h2('A test that was wrong, and what it taught')}
${note(
  'Expected 86 to be greater than 86',
  'A test asserted that repeated evidence would keep raising a competency. It failed, and the first instinct was to look for a bug in the engine. The engine was right: the update rule <em>converges</em> — blending an unchanged evidence value with a level that is approaching it produces smaller and smaller movements — and the course ceiling capped the result at the level that course certifies. The test was rewritten with its own fresh learner to assert convergence and the ceiling, which is what the engine is actually specified to do. The episode is recorded here because "the test is wrong" is the correct conclusion often enough that it should be considered before changing behaviour to satisfy an assertion.',
)}

${h2('Defects found by testing and by rehearsal')}
${table(
  'Real defects found, and their fixes',
  ['Defect', 'How it was found', 'Fix'],
  [
    ['An AR practical credited a competency the lab never tested, because evidence targets were resolved by <em>union</em> of the course’s competencies and any named ones.', 'Driving the AR lab end to end against the demonstration database and reading the resulting history rows.', 'Resolution narrowed: naming competencies alongside a course now <strong>restricts</strong> the set. The same defect affected trainer evaluations. A regression test pins it.'],
    ['An empty file-size string produced the text "· in saved files" in the offline library.', 'Reading a captured screenshot.', 'Fixed at the two call sites rather than in the shared formatting helper, whose behaviour other callers depend on.'],
    ['Hotspot labels overlapped on the 3D model, and the model sat too small in its frame.', 'Reading captured screenshots.', 'The radome marker moved to the crown of the dome, the receiver marker clear of the pedestal, and the camera framing adjusted.'],
    ['The event readiness endpoint returned every person’s full requirement breakdown regardless of what the screen rendered.', 'Inspecting the response payload during rehearsal.', 'Payload trimmed to what the view uses — about 61% smaller, with no change to any figure.'],
  ],
  { widths: ['34%', '26%', '40%'] },
)}

${h2('Manual and browser validation')}
${p(
  `**Automated browser end-to-end tests are not in the repository.** The flows — the guided demonstration, trainer authoring, every administrator workflow, the AI screens and the security headers — were exercised in a real browser with throw-away Playwright scripts during development, and the screenshots reproduced throughout this report were captured that way. Those scripts were not kept as a maintained suite, and this report does not claim otherwise.`,
  `The same scripts ran an axe-core accessibility and layout scan of 31 screens at desktop and phone width, which came back clean. An automated scan is not a substitute for testing with assistive technology, and no such testing has been done.`,
)}

${h2('The AR caveat')}
${p(
  `**AR placement was confirmed on a real Android phone in Chrome**: the camera starts, a surface is detected and the radar is placed. The viewer itself needs WebGL, which the test environment does not provide, so the automated AR tests cover the screens around the viewer — the lab list, the refresher recommendation, the scoring and the result — rather than the rendering. The desktop 3D fallback has not been clicked through by hand. Both are labelled ${status('NOT VERIFIED')} in Chapter 22 and in the register in Appendix A.`,
)}

${h2('Static checks and build validation')}
${table(
  'Checks run against the codebase',
  ['Check', 'Command', 'Scope'],
  [
    ['Type checking', '<code>npm run typecheck</code>', 'Strict TypeScript across both workspaces.'],
    ['Linting', '<code>npm run lint</code>', 'ESLint across both workspaces.'],
    ['Tests', '<code>npm test</code>', 'Backend unit and integration, and the frontend suite.'],
    ['API documentation', '<code>npm run routes -- --check</code>', 'Fails when the registered routes and the API reference disagree.'],
    ['Production build', '<code>npm run build</code>', 'Both workspaces.'],
  ],
  { widths: ['22%', '34%', '44%'] },
)}
${chapterClose}`;
