# Security

This page describes what protects the platform, where each control lives in the code, and what it does **not** do. The
controls are enforced on the server; the web app never acts as the access control. Automated tests cover the important ones
(`backend/tests/integration/auth.test.ts`, `rbac.test.ts`, `certificates.test.ts`, `ai.test.ts`, `create-admin.test.ts`,
`backend/tests/unit/infrastructure.test.ts`).

## At a glance

| Area | Control |
|---|---|
| Passwords | Argon2id (memory-hard), policy of at least 10 characters with lower, upper, digit and symbol; timing-equalised login; account lock-out |
| Sessions | HttpOnly cookies; short-lived access token; rotating refresh token with reuse detection; server-side revocation |
| Authorisation | Role check per route **and** ownership check per record, on the server; a role is re-read from the database on every request |
| CSRF / CORS | Custom-header requirement on every write, strict origin allow-list, SameSite cookies |
| Input | Zod `strictObject` validation on every body and query; parameterised queries only |
| Files | Type detected from content, allow-list, size cap, safe names, keys the client cannot influence, authorised downloads only |
| Abuse | Rate limits (global, sign-in, public verification, AI per user), account lock-out |
| Data | No secrets in code or logs; personal data minimised in public and AI-bound responses; audit trail |
| Browser | Strict CSP and security headers on both the API and the web app |
| AI (optional) | Advisory only, output treated as untrusted, minimal data, no prompt logging |

## Authentication

* **Passwords** are hashed with Argon2id (`@node-rs/argon2`; `ARGON2_MEMORY_KIB` default 19 MiB, `ARGON2_TIME_COST` default
  2; raise both on production hardware). The policy is shared by registration, password change and administrator-created
  accounts (`modules/auth/password.ts`). Only the hash is stored.
* **Sign-in** answers *"Incorrect email or password"* for both an unknown address and a wrong password, and burns a dummy hash
  for unknown addresses so the response time does not reveal which e-mails exist. After `MAX_FAILED_LOGINS` (5) wrong passwords
  the account is locked for `LOCKOUT_MINUTES` (15). Suspended, pending and rejected accounts cannot sign in and are told why.
* **Registration** creates a `TRAINEE` in `PENDING` state; an administrator approves or rejects it
  (`REGISTRATION_REQUIRES_APPROVAL`, default on). `ALLOWED_EMAIL_DOMAINS` can restrict self-registration to organisation domains.
* **Temporary passwords.** Administrator-created accounts and password resets get a generated password shown once; the
  account is held on the change-password screen (every other endpoint answers `403 PASSWORD_CHANGE_REQUIRED`) until the user
  chooses their own. A reset also revokes the account's sessions and clears any lock.
* **The first administrator** is created with `npm run admin:create` (see [deployment.md](deployment.md)): production never runs
  the demo seed, and the seed itself refuses `NODE_ENV=production`.

## Sessions and tokens

* Sign-in sets two cookies, `HttpOnly` (unreadable to script), `Secure` when `COOKIE_SECURE=true`, `SameSite` as configured:
  the **access token** (JWT, HS256, issuer-checked, `ACCESS_TOKEN_TTL_MINUTES` default 15, path `/`) and an opaque
  **refresh token** (`REFRESH_TOKEN_TTL_DAYS` default 7, path `/api/auth` only, so it never travels with ordinary API calls).
* The access token carries the user id, the session id and the role, but authorisation never trusts the role in it: on every
  request the session, the user's status and current role are re-read from the database, so a revoked session, a suspended
  account or a demotion takes effect immediately, not when the token expires.
* Only the SHA-256 of a refresh token is stored. **Rotation and reuse detection:** every refresh issues a new refresh token and
  remembers the previous one; presenting an already-rotated token outside a 15-second grace window (a double click or two tabs)
  revokes the whole session and writes a `SESSION_REUSE_DETECTED` audit entry, because it indicates a stolen token.
* Changing a password signs out every other session. Logout revokes the session and clears both cookies.
* Production start-up is refused unless `COOKIE_SECURE=true` and `FRONTEND_URL` is set, and `JWT_SECRET` must be at least 32
  characters; `SameSite=None` (web app and API on different sites) additionally requires `COOKIE_SECURE=true`.

## Authorisation

Three access roles (`TRAINEE`, `TRAINER`, `ADMIN`; not to be confused with the organisational *job role*). Two layers decide
every request: the route's `requireRole(...)`, and the record-level rule inside the service. [api.md](api.md) lists the
role requirement of every endpoint (generated from the code).

| | Trainee | Trainer | Administrator |
|---|---|---|---|
| Own competencies, skill gaps, recommendations, passport | yes | | |
| Browse published courses, enrol, learn, take assessments, receive certificates | yes | | |
| Create and edit courses, modules, materials, assessments | | **own courses only** | any |
| See results and passports | own | **only trainees enrolled in their courses** | all |
| Record trainer evaluations | | for their trainees | for anyone |
| Manage users, departments, job roles, competencies, engine settings | | | yes |
| Revoke certificates, read the audit log, run organisation analytics | | | yes |

Rules worth naming, each covered by a test in `rbac.test.ts`:

* a trainee cannot use an admin endpoint by knowing its URL (`403`), and cannot promote themselves (role is not an editable
  profile field);
* a trainer cannot change another trainer's course, assessment or modules, and can only view or evaluate trainees enrolled in
  their own courses;
* a trainee cannot read another learner's attempt, certificate or notifications, and cannot see draft courses or unpublished
  assessments;
* course materials can be downloaded only by enrolled trainees, the course trainer and administrators;
* an inactive or suspended user loses access on the very next request;
* the last active administrator cannot be deleted, demoted or suspended.

## Web-browser protections

* **CSRF.** Every request other than `GET`, `HEAD` or `OPTIONS` must carry `X-Requested-With: CapacityConnect`. A cross-site page
  cannot add a custom header without a CORS pre-flight, and the pre-flight is refused for every origin outside `FRONTEND_URL`.
  Together with the JSON-only body parser and SameSite cookies this covers classic CSRF and login CSRF without a token store.
* **CORS** allows only the configured origins, with credentials, and only the headers the app uses.
* **XSS.** React escapes everything it renders and the code base has no `dangerouslySetInnerHTML`. The web app is served with
  `Content-Security-Policy: default-src 'self'; script-src 'self'; ...` (no inline script, no external hosts), `X-Frame-Options:
  DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a restrictive `Permissions-Policy`
  (`frontend/nginx/default.conf.template`). The policy was checked in a real browser against the production bundle: fonts, QR
  codes, PDF opening and charts all work with no violations. The API answers with `default-src 'none'` and helmet's defaults.
* **Open redirects.** Every navigation target that comes from data (notification links, the "where were you going" state) must
  be an in-app path; absolute, protocol-relative, backslash and `javascript:` targets are ignored (`utils/links.ts`, tested).
* **Caching.** API responses are `Cache-Control: no-store`.

## Input and data access

* Every request body and query is validated by a Zod schema on the server; body schemas are `strictObject`, so unknown fields
  are rejected rather than silently stored. Identifiers must be UUIDs (`INVALID_ID`), text has length limits, enums are closed.
* All database access is through Prisma (parameterised). The few raw queries (heatmap, history replay, forecast) use tagged
  `Prisma.sql` templates that bind every value; there is no string-built SQL and no `queryRawUnsafe` in the application.
* Mass assignment is impossible by construction: services pick fields explicitly, and responses go through explicit mappers
  (for example `toUserDto`), so a password hash or a lock-out counter can never leak.
* Assessment answers are scored **on the server** from the stored question bank; the client never sends or receives a score
  before submission, correct answers are only revealed when the assessment allows it, and time limits are enforced by the
  server clock.

## Files

`middleware/upload.ts` and `services/storage/` enforce: a size cap (`MAX_UPLOAD_MB`), a single file per request, an allow-list of
types (PDF, PNG, JPEG, GIF, WebP, Office documents, plain text, MP4, WebM) **detected from the file's content** rather than
its name or the browser's MIME type, no SVG or HTML (both can carry script), sanitised display names, storage keys generated by
the server (never derived from user input) with a traversal guard, and downloads that always pass through the API's
access check. Inline display is limited to types that cannot execute script. Extracted text from uploaded documents is used for
search and, if enabled, as AI context. **Not done:** malware scanning; deployments that need it should scan on upload.

## Abuse controls

Rate limits are per client IP (`RateLimit` headers, `429` when exceeded): 1000 requests per 15 minutes overall, 30 for sign-in
(failed attempts only, so colleagues behind one address do not lock each other out), registration and password change, and 60 per minute
for public certificate verification. AI requests are limited per
signed-in user (default 30 an hour, failed requests do not count). Set `TRUST_PROXY` to the number of proxy hops so limits and
audit entries see the real client address. The limiter keeps its counters in memory, so with several API instances each has its
own budget; put a shared store or a gateway limit in front if you need a global one.

## Public surface

Without signing in: `GET /api/health`, `GET /api/meta/options` (department and job-role names, registration policy, feature
flags), `GET /api/courses/:id/thumbnail` (course images are not sensitive and plain `<img>` tags cannot send credentials across
sites), sign-in, registration, refresh and logout, and `GET /api/certificates/verify/:certificateId`. The verification answer
contains only what is printed on the certificate (holder, course, score, date, issuer); numbers are 8 characters from a
31-symbol alphabet after a prefix and a year (about 8.5 × 10¹¹ possibilities), and the endpoint is rate limited against guessing.

## Data protection

* No secrets in code. Configuration comes from environment variables, validated at start-up; `.env` is git-ignored and
  excluded from Docker images; `.env.example` documents every variable without values. Logs (pino, JSON) never contain
  passwords, tokens or AI prompts.
* Personal data (name, e-mail, phone, employee id, IP address and user agent in sessions and the audit log) is listed in
  [database.md](database.md#personal-data). Users and courses are soft-deleted so that certificates and the audit trail stay intact.
* Terminate TLS in front of the web tier and keep `COOKIE_SECURE=true`; the API also sets HSTS in production. Encrypt the
  database volume and the upload bucket at rest and back both up together.

## Data on the device (offline mode)

Offline support means learner data is written to the device, so it is treated as a security surface rather than a convenience.

* **What is stored.** The cached app shell and build assets; a narrow allow-list of GET API responses (the signed-in user,
  their enrolments, their assessments and the courses they open - never workforce-wide or administrative data); courses the
  learner explicitly saves, including the bytes of their documents and videos; and any writes queued while offline.
* **Where.** The browser's Cache Storage and IndexedDB, both scoped to the web origin and readable only by this app on this
  device. Nothing is written anywhere else and nothing is sent to a third party.
* **Shared machines.** Signing out flushes the queue, then deletes every cache and every IndexedDB store, and tells the service
  worker to do the same. A session that simply expires, or a browser closed without signing out, leaves the saved copies in
  place until the next sign-out - offline access would be pointless otherwise. On a shared workstation, sign out.
* **Writes are never replayed by the worker.** The service worker handles GET requests only. Queued writes are sent by the
  application, in order, each with an idempotency key generated when the learner acted, so a replay after a dropped connection
  returns the original result instead of performing the action twice. A 4xx stops the retry and surfaces the entry to the
  learner rather than discarding it silently.
* **No authority is cached.** Every cached response is data the server already authorised for that session; the worker never
  caches a decision. Permissions are re-checked on the server when the queue drains.
* **Scenario images.** A practical scenario can reference an image URL. The Content-Security-Policy allows images only from the
  app's own origin (plus anything in `CSP_EXTRA_ORIGINS`), so an external URL will simply not load - deliberate, so authored
  content cannot pull in a third-party tracker.

## Audit trail

`AuditLog` is append-only and records who did what to which record, with the IP address and user agent: sign-ins and failures,
lock-outs, refresh-token reuse, account creation, approval, role and status changes, password resets, framework changes,
competency adjustments, course and assessment authoring, publication, submissions, certificate issue, revocation and
reinstatement, engine settings, announcements, reminder runs and AI use. Administrators can filter and search it. A failure to
write an audit row is logged but never blocks the operation it describes.

## Optional AI features

The AI features (see [api.md](api.md#ai-features)) add convenience and are off unless an AI key is set (`OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` with `AI_PROVIDER=anthropic`). **They cannot
change a decision the framework made.** What leaves the server, and only when a user uses the feature:

| Feature | Sent to the AI service | Never sent |
|---|---|---|
| Course assistant | the user's question and the text of that course's own materials | name, e-mail, employee id, anything about other users |
| Quiz generator | the course's material text, the wording of its existing questions, the trainer's options | learner data |
| Study plan | job role name, skill gaps, recommended course titles and the engine's reasons | name, e-mail, employee id, user id |
| Plain-language search | the typed request and the names of the active competencies and course categories | any user data, the catalogue itself |
| Forecast briefing | aggregated, calculated figures per competency | employee names or any individual's data |

Controls: the model's output is **untrusted input**. It is requested as structured output and validated again on the server;
cited sources, course ids, competency ids and categories are checked against the database and dropped when not real; quiz drafts
are re-validated with the same rules as hand-written questions, deduplicated, shuffled and *never saved automatically*; the
study plan is built from the engine's own recommendation list, so the model can neither add nor reorder a course. Course
text is escaped and delimited as data and the instructions say to ignore instructions found inside it (prompt injection
through course content) but the design does not *depend* on the model obeying: the model has no tools, no database access and
no way to act, and the worst a poisoned reading can do is produce a bad answer that the checks above and the user's review
catch. Per-user hourly limits cap cost and abuse; use of a feature is audited with sizes and token counts, never with prompts or
answers. Learners and trainers see a plain notice of what is sent next to every AI feature, and it names the service that
receives it (taken from the server's configuration, so it cannot drift from what is really used). The data-handling terms of
that provider apply to what is sent (OpenAI by default; the operator of `OPENAI_BASE_URL` if you set one); review them before
enabling the features for real staff data. The key and the text travel over HTTPS (production refuses a non-HTTPS
`OPENAI_BASE_URL`, except an address on the same machine), and the key is only ever sent in the `Authorization` header to
that address.

## Dependencies

`npm audit` was run for this release. After upgrading `react-router-dom` to 6.30.6 (it fixed an open-redirect advisory in the
router that shipped with 6.30.1) and `postcss` to 8.5.28, the remaining findings are:

* `deepmerge-ts` inside the Prisma **command-line tool** (a development-time loader of our own `prisma.config.ts`; not part of
  the running API; the only fix offered is a Prisma downgrade);
* two moderate advisories in `react-router` 6.x (an open redirect through a backslash in `<Link>`/`useNavigate`, and
  deserialisation during server-side rendering). The first needs an attacker-controlled navigation target, which the app
  never uses (all data-derived targets go through the in-app path check above); the second concerns SSR hydration, which the
  single-page app does not use. The fix is only in the 7.x line; upgrade when the router is next migrated.

Review `npm audit` in CI and update deliberately: pin, test, then upgrade.

## Known limitations

* No multi-factor authentication and no password reset by e-mail (an administrator issues a temporary password); there is no
  e-mail delivery at all, notifications are in-app.
* No malware scanning of uploads and no per-user data-export or erasure tooling beyond soft delete.
* Rate limiting is per API instance (see above).
* Offline copies stay on the device until sign-out (see above); there is no remote wipe, and no encryption of the browser's own
  storage beyond what the operating system and browser profile provide.
* Queued offline work is sent when the device reconnects *while the app is open*. There is no background synchronisation, so a
  learner who never reopens the app never syncs.
* The demo seed creates well-known accounts. It refuses production; never enable `ALLOW_PRODUCTION_SEED` on a real system and
  never set `VITE_DEMO_PASSWORD` in a real build.
* The container images and `docker-compose.yml` were written but could not be built or run where this was developed
  (no Docker); the CI workflow builds them on the first push, and the first deployment should be treated as a test.

## Production hardening checklist

- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`, TLS in front of the web tier, `TRUST_PROXY` set to the real hop count
- [ ] a strong, unique `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)
- [ ] `FRONTEND_URL` set to exactly the public web origin(s); `REGISTRATION_REQUIRES_APPROVAL=true`; `ALLOWED_EMAIL_DOMAINS` set
- [ ] the first administrator created with `npm run admin:create` (temporary password changed); no demo accounts
- [ ] database and upload storage private, encrypted at rest, backed up and restore-tested; least-privilege database user
- [ ] Argon2 cost raised for your hardware; rate limits reviewed; an external limit if there are several instances
- [ ] log shipping and alerting on `SESSION_REUSE_DETECTED`, repeated `USER_LOCKED` and 5xx rates
- [ ] `npm audit` reviewed in CI; images rebuilt regularly for base-image fixes
- [ ] AI: decide deliberately whether to set an AI key and with which provider; review the data listed above with your data-protection officer
