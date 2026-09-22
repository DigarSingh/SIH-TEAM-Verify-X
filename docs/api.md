# API reference

The API is a JSON REST API served under `/api`. This page lists every endpoint (each one is checked against the running
code by `npm run routes -- --check`, so it cannot silently drift) and the conventions they share.
For what the numbers mean, see [competency-engine.md](competency-engine.md); for the threat model, [security.md](security.md).

## Conventions

**Base URL.** `/api` on the same origin as the web app (a reverse proxy forwards it to the API), or the absolute URL in
`VITE_API_URL` when the web app is hosted separately. Bodies are JSON (`Content-Type: application/json`); uploads are
`multipart/form-data` with the file in the field `file`.

**Authentication.** `POST /api/auth/login` sets two cookies, both `HttpOnly` (JavaScript can never read them):

| Cookie | Holds | Lifetime | Sent to |
|---|---|---|---|
| `cc_at` | short-lived access token (JWT, HS256) | `ACCESS_TOKEN_TTL_MINUTES`, default 15 | every `/api` call |
| `cc_rt` | opaque refresh token (only its SHA-256 is stored) | `REFRESH_TOKEN_TTL_DAYS`, default 7 | `/api/auth/*` only |

When an access token has expired the server answers `401 TOKEN_EXPIRED`; the web app then calls `POST /api/auth/refresh`
once (all concurrent requests share that call) and repeats the original request. Refreshing rotates the refresh token.
The user's role and status are re-read from the database on every request, so a demoted or suspended user loses access
immediately rather than when the token expires.

**Forced password change.** While an account carries a temporary password (`mustChangePassword`), every endpoint except
`POST /api/auth/change-password`, `POST /api/auth/logout` and `GET /api/users/me` answers `403 PASSWORD_CHANGE_REQUIRED`.

**CSRF.** Every request that is not `GET`, `HEAD` or `OPTIONS` must carry `X-Requested-With: CapacityConnect`, otherwise
the server answers `403 CSRF_REJECTED`. Browsers cannot add that header to a cross-site request without a CORS
pre-flight, and the pre-flight is refused for any origin outside `FRONTEND_URL`.

**Authorization** is decided on the server in two steps: the route's role check (the *Access* column below) and, inside
the service, the record-level rule (a trainer only sees trainees enrolled in their courses; a learner only sees their own
attempts, and so on). Hiding a menu item in the web app is never treated as access control.

**Responses.** Success is `{ "success": true, "data": ..., "meta": ... }` (`meta` only when there is something to add,
such as pagination). Errors are always:

```json
{ "success": false, "code": "FORBIDDEN", "message": "This action requires one of the following roles: ADMIN" }
```

Validation failures are `400 VALIDATION_ERROR` with one entry per field:

```json
{
  "success": false, "code": "VALIDATION_ERROR", "message": "Validation failed",
  "details": [
    { "field": "email", "message": "Enter a valid email address" },
    { "field": "password", "message": "Password is required" }
  ]
}
```

Unexpected failures are `500 INTERNAL_ERROR` with a generic message: details go to the server log, never to the client.
Every response carries `X-Request-Id`, which also appears in the server log line for that request.

| Status | Typical `code` values |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_ID` (malformed UUID), `FILE_TYPE_NOT_ALLOWED`, `FILE_REQUIRED` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `SESSION_INVALID`, `ACCOUNT_INACTIVE`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (wrong role), `CSRF_REJECTED`, `PASSWORD_CHANGE_REQUIRED`, `ACCOUNT_PENDING`, `ACCOUNT_REJECTED`, `ACCOUNT_SUSPENDED` (at sign-in), plus record-level codes such as `NOT_ENROLLED`, `NOT_COURSE_OWNER` |
| 404 | `ROUTE_NOT_FOUND`, `RECORD_NOT_FOUND`, and specific codes such as `COURSE_NOT_FOUND` |
| 409 | `DUPLICATE_ENTRY`, `REFERENCE_CONSTRAINT`, `WRITE_CONFLICT`, and rule violations such as `ASSESSMENT_HAS_ATTEMPTS` |
| 413 | `FILE_TOO_LARGE` |
| 422 | a request that is well-formed but cannot be done, for example `NO_READABLE_MATERIALS` |
| 423 | `ACCOUNT_LOCKED` (too many failed sign-ins; the message says for how long) |
| 429 | `RATE_LIMITED`, `AI_RATE_LIMITED` |
| 5xx | `INTERNAL_ERROR`, and the `AI_*` codes listed under [AI features](#ai-features) |

**Pagination.** List endpoints take `?page=1&pageSize=20` (`pageSize` at most 100) and answer
`meta: { page, pageSize, total, totalPages, ... }` (some add extra fields, for example the list of categories):

```json
"meta": { "page": 1, "pageSize": 1, "total": 15, "totalPages": 15, "categories": ["Climate & Research", "Forecasting"] }
```

**Rate limits** (per client IP, `RateLimit` headers in the IETF draft-7 format, `429` when exceeded):
`RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS` for the whole API (default 1000 per 15 minutes), a stricter
`AUTH_RATE_LIMIT_MAX` (default 30) on sign-in (failed attempts only), registration and password change, 60 per minute on public
certificate verification, and `AI_RATE_LIMIT_PER_HOUR` AI requests per signed-in *user* per hour (default 30).

**Identifiers** are UUIDs (certificates additionally have a public number such as `CC-2026-SZ4Q794M`). Timestamps are
ISO 8601 in UTC. Competency levels are integers from 0 to 100.

**Caching.** Every API response is `Cache-Control: no-store`: it contains private, per-user data.

## Endpoints

### Health and public metadata

Reachable without signing in.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/health` | Public | Liveness probe only (`{ status, uptimeSeconds }`) - proves the process is running and routes are registered, independent of the database. |
| `GET /api/health/db` | Public | Liveness and database readiness probe (`{ status, uptimeSeconds }`). Used by container health checks (see `backend/Dockerfile`). |
| `GET /api/meta/options` | Public | PUBLIC. Everything the registration form needs: active departments and job roles, the approval policy and the password rules. It also tells the web app the upload size limit so file pickers can warn early. |

### Authentication

Sign-in sets two HttpOnly cookies; see [Conventions](#conventions).

| Endpoint | Access | What it does |
|---|---|---|
| `POST /api/auth/change-password` | Any signed-in user | Change your own password (`currentPassword`, `newPassword`). Clears a forced-change flag and signs out every other session. |
| `POST /api/auth/login` | Public | Verifies credentials and sets HttpOnly session cookies. |
| `POST /api/auth/logout` | Public | Revokes the session and clears cookies. Idempotent. |
| `POST /api/auth/refresh` | Public | Rotates the refresh token and issues a new access token. |
| `POST /api/auth/register` | Public | Self-service registration (creates a TRAINEE). |

### Users and profile

Administrators manage accounts; everyone manages their own profile under `/api/users/me`.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/users` | Admin | Admin: search and filter all accounts. Query: `q`, `role`, `status`, `departmentId`, `jobRoleId`, `page`, `pageSize`. |
| `POST /api/users` | Admin | Admin: create an account (temporary password is generated unless supplied). |
| `GET /api/users/:id` | Admin | One account with its department, job role and status. |
| `PATCH /api/users/:id` | Admin | Edit an account (name, employee id, department, job role and so on). |
| `DELETE /api/users/:id` | Admin | Soft-delete an account. The row is kept so history (attempts, certificates, audit log) stays intact, and the e-mail address and employee id are released. |
| `POST /api/users/:id/approve` | Admin | Admin: approve a pending registration (optionally assigning department / role). |
| `PUT /api/users/:id/competencies/:competencyId` | Admin | Admin: record a baseline or correct a competency level. |
| `GET /api/users/:id/passport` | Admin, Trainer | Admin, or a trainer for trainees enrolled in their courses. |
| `POST /api/users/:id/reject` | Admin | Reject a pending registration, with an optional reason. |
| `POST /api/users/:id/reset-password` | Admin | Issue a one-time temporary password (shown once). The user must change it at the next sign-in. |
| `PATCH /api/users/:id/role` | Admin | Admin: change access role (TRAINEE / TRAINER / ADMIN). |
| `PATCH /api/users/:id/status` | Admin | Suspend or reactivate an account. A suspended user loses access immediately. |
| `GET /api/users/me` | Any signed-in user | The signed-in user (also used by the web app to restore a session). |
| `PATCH /api/users/me` | Any signed-in user | Basic details. Department, role and employee id are managed by administrators. |
| `POST /api/users/me/experiences` | Any signed-in user | Add a work experience entry. |
| `PATCH /api/users/me/experiences/:id` | Any signed-in user | Edit a work experience entry. |
| `DELETE /api/users/me/experiences/:id` | Any signed-in user | Remove a work experience entry. |
| `GET /api/users/me/profile` | Any signed-in user | Your professional profile: headline, bio, expertise, qualifications, experience and self-declared skills. |
| `PUT /api/users/me/profile` | Any signed-in user | Update headline, bio and expertise. |
| `POST /api/users/me/qualifications` | Any signed-in user | Add a qualification. |
| `PATCH /api/users/me/qualifications/:id` | Any signed-in user | Edit a qualification. |
| `DELETE /api/users/me/qualifications/:id` | Any signed-in user | Remove a qualification. |
| `POST /api/users/me/skills` | Any signed-in user | Add a self-declared skill (informational only: verified competency changes only through assessed evidence). |
| `PATCH /api/users/me/skills/:id` | Any signed-in user | Edit a self-declared skill. |
| `DELETE /api/users/me/skills/:id` | Any signed-in user | Remove a self-declared skill. |

### Organisation

Departments and job roles (an employee's designation, which carries the competency requirements; not the access role).

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/departments` | Any signed-in user | Active departments for everyone; `?includeInactive=true` is admin-only. Query: `includeInactive` (administrators only). |
| `POST /api/departments` | Admin | Create a department. |
| `PATCH /api/departments/:id` | Admin | Edit or deactivate a department. |
| `DELETE /api/departments/:id` | Admin | Admin; departments with employees can only be deactivated. |
| `GET /api/roles` | Any signed-in user | Active roles for everyone; `?includeInactive=true` is admin-only. Query: `includeInactive` (administrators only). |
| `POST /api/roles` | Admin | Create a job role (with its criticality from 1 to 5). |
| `GET /api/roles/:id` | Any signed-in user | Role with its required competencies. |
| `PATCH /api/roles/:id` | Admin | Edit or deactivate a job role. |
| `DELETE /api/roles/:id` | Admin | Admin; roles held by employees can only be deactivated. |
| `PUT /api/roles/:id/competencies/:competencyId` | Admin | Define (or change) the required level for a role. |
| `DELETE /api/roles/:id/competencies/:competencyId` | Admin | Remove a requirement from a role. |

### Competency framework, skill gaps and recommendations

The deterministic engine. Numbers and reasons come from [competency-engine.md](competency-engine.md).

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/competencies` | Any signed-in user | The competency framework. Query: `q`, `category`, `includeInactive` (administrators only), `page`, `pageSize`. |
| `POST /api/competencies` | Admin | Create a competency. |
| `GET /api/competencies/:id` | Any signed-in user | Detail with mapped courses (and role requirements for admins). |
| `PATCH /api/competencies/:id` | Admin | Edit, deactivate or reactivate a competency. |
| `DELETE /api/competencies/:id` | Admin | Admin; competencies with any usage can only be deactivated. |
| `GET /api/competencies/engine/config` | Any signed-in user | Thresholds and formula weights in force (read-only for everyone). |
| `PUT /api/competencies/engine/config` | Admin | Change the engine thresholds and weights. Validated: thresholds must increase and evaluation weights must add up to 1. Gaps and priorities are calculated on read, so the change applies everywhere at once. |
| `POST /api/competencies/engine/config/reset` | Admin | Restore the default engine configuration. |
| `POST /api/competencies/engine/simulate` | Admin, Trainer | What-if calculator for administrators and trainers. Runs the real engine functions (optionally with an unsaved configuration) without touching any data. |
| `GET /api/competencies/decay/policies` | Admin, Trainer | Every competency with its freshness policy (half-life, minimum safe level, recertification interval, criticality) and which of them are actually configured. |
| `PUT /api/competencies/:id/decay-policy` | Admin | Configure how a competency loses freshness. A competency with no policy does not decay at all. |
| `DELETE /api/competencies/:id/decay-policy` | Admin | Remove the policy, so the competency stops decaying and expiring. |
| `POST /api/competencies/practice` | Admin, Trainer | Record that a competency was used. Resets the decay clock without claiming it was re-verified. |
| `GET /api/competencies/me` | Any signed-in user | My competencies against my role's requirements. |
| `GET /api/competencies/me/history` | Any signed-in user | The competency timeline (35% → 52% → 72%). |
| `GET /api/competencies/me/passport` | Any signed-in user | The Competency Passport. |
| `GET /api/recommendations/me` | Any signed-in user | Rule-based course recommendations (with the reasons why) and the ordered Beginner → Intermediate → Advanced learning path for every skill gap. Query: `limit` (1 to 50). See [competency-engine.md](competency-engine.md#recommendations-and-learning-paths). |
| `GET /api/skill-gaps/me` | Any signed-in user | The signed-in employee's skill gaps, ranked by training priority, with competency freshness and the refreshers it calls for. Query: `offsetDays` or `asOf` to run the readiness simulation (see below). |
| `GET /api/skill-gaps/users/:userId` | Admin, Trainer | Another employee's report. Admins may view anyone; trainers only trainees enrolled in one of their courses. Same simulation query parameters. |
| `GET /api/succession` | Admin | Knowledge-loss risk for every competency: experts, who is leaving, who is developing, and why. Accepts the simulation parameters. |
| `GET /api/succession/competencies/:id` | Admin, Trainer | One competency in detail, with existing mentorships and suggested pairings. |
| `GET /api/succession/mentorships` | Admin, Trainer | Mentorships, filterable by competency, mentor, mentee or status. |
| `GET /api/succession/mentorships/me` | Any signed-in user | The signed-in user's own mentorships, as mentee and as mentor. |
| `POST /api/succession/mentorships` | Admin, Trainer | Pair an expert with someone developing a competency. |
| `PATCH /api/succession/mentorships/:id` | Admin, Trainer | Move a mentorship through NOT_STARTED, ACTIVE, COMPLETED or CANCELLED. |
| `GET /api/readiness/overview` | Admin | Everything the Operational Readiness dashboard shows, including the demonstration Readiness Index. |
| `GET /api/readiness/calendar` | Admin, Trainer | Every upcoming readiness event with its headline readiness, measured at each event's start date. |
| `GET /api/readiness/events` | Admin, Trainer | The configured readiness calendar. |
| `GET /api/readiness/events/:id` | Admin, Trainer | One event's definition. |
| `GET /api/readiness/events/:id/readiness` | Admin, Trainer | Who is ready for the event, who is short, and on which competencies. |
| `GET /api/readiness/events/:id/assignments` | Admin, Trainer | Preparation assigned for an event. |
| `POST /api/readiness/events` | Admin | Add an event to the readiness calendar. |
| `PUT /api/readiness/events/:id` | Admin | Change an event; its requirements and departments are replaced wholesale. |
| `DELETE /api/readiness/events/:id` | Admin | Remove an event and its assignments. |
| `POST /api/readiness/events/:id/assign` | Admin | Assign preparation to everyone short for the event. Idempotent. |
| `GET /api/readiness/assignments/me` | Any signed-in user | What the signed-in user has been asked to prepare. |
| `GET /api/certificates/verification-key` | Public | The Ed25519 public key certificates are signed with, so anyone can verify one offline. |

### Courses

The catalogue and course authoring. Authorship is enforced per record: a trainer can change only their own courses; administrators can change any.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/courses` | Any signed-in user | Catalog with search and filters (visibility depends on the caller's role). Query: `q`, `category`, `difficulty`, `competencyId`, `departmentId`, `status`, `mine`, `completion` (`NOT_ENROLLED`, `ENROLLED`, `IN_PROGRESS`, `ASSESSMENT_PENDING`, `COMPLETED`), `sort` (`newest`, `title`, `popular`, `duration`), `page`, `pageSize`. Learners see published courses; trainers also see their own drafts; administrators see all. |
| `POST /api/courses` | Trainer, Admin | Create a draft course. Trainers own what they create; administrators may assign a trainer. |
| `GET /api/courses/:id` | Any signed-in user | Course detail: outcomes, modules (material titles only), competency mappings, prerequisites, rating and the caller's own enrollment. |
| `PATCH /api/courses/:id` | Trainer, Admin | Edit course details (course owner or administrator). |
| `DELETE /api/courses/:id` | Trainer, Admin | Only courses without enrollments; others must be archived. |
| `GET /api/courses/:id/analytics` | Trainer, Admin | Completion, assessment performance and competency impact. |
| `PUT /api/courses/:id/competencies` | Trainer, Admin | Replace the whole competency mapping. |
| `PUT /api/courses/:id/competencies/:competencyId` | Trainer, Admin | Map (or re-level) one competency. |
| `DELETE /api/courses/:id/competencies/:competencyId` | Trainer, Admin | Remove one competency mapping from the course. |
| `POST /api/courses/:id/enroll` | Trainee | A learner enrolls. The course must be published and its prerequisites completed. |
| `GET /api/courses/:id/feedback` | Any signed-in user | Learner ratings and comments (paginated) with the average and the caller's own rating in `meta`. |
| `POST /api/courses/:id/feedback` | Trainee | Rate a course from 1 to 5, optionally rate the trainer and comment. Only for learners enrolled in the course; rating again replaces the earlier one. |
| `GET /api/courses/:id/learn` | Any signed-in user | The course player payload (enrolled trainee, or preview for trainer/admin). |
| `POST /api/courses/:id/modules` | Trainer, Admin | Add a module (`title`, optional `description`, `durationMinutes`). |
| `PATCH /api/courses/:id/modules/:moduleId` | Trainer, Admin | Edit a module. |
| `DELETE /api/courses/:id/modules/:moduleId` | Trainer, Admin | Delete a module with its materials. |
| `POST /api/courses/:id/modules/:moduleId/materials` | Trainer, Admin | JSON for VIDEO (url) / LINK / TEXT, or multipart (fields title, type + file) for uploaded documents and videos. |
| `PATCH /api/courses/:id/modules/:moduleId/materials/:materialId` | Trainer, Admin | Edit a material's title, link or text. |
| `DELETE /api/courses/:id/modules/:moduleId/materials/:materialId` | Trainer, Admin | Delete a material (and its stored file, if any). |
| `PUT /api/courses/:id/modules/order` | Trainer, Admin | Reorder the modules (`{ moduleIds: [...] }`). |
| `PUT /api/courses/:id/prerequisites` | Trainer, Admin | Replace the prerequisite courses. |
| `PATCH /api/courses/:id/status` | Trainer, Admin | Publish, unpublish (back to DRAFT) or archive. |
| `GET /api/courses/:id/thumbnail` | Public | The course thumbnail image. Public: course images are not sensitive, and a plain `<img>` tag cannot attach credentials across sites. |
| `POST /api/courses/:id/thumbnail` | Trainer, Admin | Multipart image upload (PNG, JPEG, GIF, WebP up to 5 MB). |
| `DELETE /api/courses/:id/thumbnail` | Trainer, Admin | Remove the course thumbnail. |
| `GET /api/courses/:id/trainees` | Trainer, Admin | Enrolled trainees with progress and results (course trainer / admin). Query: `q`, `status`, `page`, `pageSize`; `meta.statusCounts` gives the totals per status. |
| `GET /api/courses/materials/:materialId/download` | Any signed-in user | Download an uploaded material: the course trainer, an administrator, or a learner enrolled in the course. The file is streamed after the access check. |

### Enrollments and progress

A learner's own enrollments.

| Endpoint | Access | What it does |
|---|---|---|
| `POST /api/enrollments/:id/modules/:moduleId/complete` | Trainee | Mark a module complete (idempotent). |
| `DELETE /api/enrollments/:id/modules/:moduleId/complete` | Trainee | Un-mark a module. |
| `POST /api/enrollments/:id/withdraw` | Trainee | Withdraw from a course. A completed course cannot be withdrawn. |
| `GET /api/enrollments/me` | Trainee | My courses with progress, the next module and assessment state. |
| `GET /api/enrollments/me/:courseId` | Trainee | My enrollment in one course. |

### Assessments

One assessment per course. Scoring, competency update and certificate issue happen in the submit call, in one transaction.

An assessment can have a **practical component**: scenarios, each a briefing and a sequence of decisions where an option can be
partly right (`credit` 0..1). The final mark is `questions x mcqWeight + practical x (1 - mcqWeight)`. While an attempt is open the
credits and rationales are never sent; they appear in the result, because a scenario teaches through them. Submission accepts an
`idempotencyKey`, so a device that loses the network mid-submit can send the same answers again without burning an attempt.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/assessments` | Trainer, Admin | Trainer/admin: assessments of the courses they manage. |
| `POST /api/assessments` | Trainer, Admin | Trainer/admin: create the assessment of a course (optionally with questions). |
| `GET /api/assessments/:id` | Any signed-in user | Managers get the full question bank; trainees get the rules and their eligibility. |
| `PATCH /api/assessments/:id` | Trainer, Admin | Edit the settings (time limit, pass mark, attempts, deadline, shuffling, answer review) and publish or unpublish. |
| `DELETE /api/assessments/:id` | Trainer, Admin | Delete an assessment. Refused (`ASSESSMENT_HAS_ATTEMPTS`) once learners have attempted it: unpublish it instead. |
| `POST /api/assessments/:id/questions` | Trainer, Admin | Add one question, or `{ questions: [...] }` in bulk. |
| `PATCH /api/assessments/:id/questions/:questionId` | Trainer, Admin | Edit a question. After learners have attempted the assessment only the wording and the explanation can change. |
| `DELETE /api/assessments/:id/questions/:questionId` | Trainer, Admin | Remove a question. Refused after attempts, when it is the last question of a published assessment, or when too few would remain for `questionsPerAttempt`. |
| `PUT /api/assessments/:id/questions/order` | Trainer, Admin | Reorder the questions (`{ questionIds: [...] }`). |
| `GET /api/assessments/:id/scenarios` | Trainer, Admin | The practical component with its marking (credits and rationales). |
| `PUT /api/assessments/:id/scenarios` | Trainer, Admin | Replace the practical component wholesale. Refused (`SCENARIOS_IN_USE`) once answers have been marked against it. |
| `GET /api/assessments/:id/results` | Any signed-in user | Own history (trainee) or all results + statistics (course trainer / admin). |
| `POST /api/assessments/:id/start` | Trainee | Begin (or resume) a timed attempt. |
| `POST /api/assessments/:id/submit` | Trainee | Score the attempt, update competency, issue the certificate. |
| `GET /api/assessments/attempts/:attemptId` | Any signed-in user | One attempt with its question-by-question review. |
| `GET /api/assessments/me` | Trainee | Trainee: assessments of my courses and what I can do next. |

### Certificates

PDF certificates with a QR code and public verification.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/certificates` | Admin | Admin: every certificate with search and filters. Query: `q`, `status` (`VALID`, `REVOKED`), `courseId`, `page`, `pageSize`. |
| `GET /api/certificates/:id/pdf` | Any signed-in user | The certificate as a PDF (with QR code). `?inline=1` displays it in the browser. |
| `GET /api/certificates/:id/qr` | Any signed-in user | The verification QR code as a PNG. |
| `POST /api/certificates/:id/reinstate` | Admin | Admin: undo a revocation. |
| `POST /api/certificates/:id/revoke` | Admin | Admin. A revoked certificate fails public verification. |
| `GET /api/certificates/me` | Any signed-in user | Certificates I hold. |
| `GET /api/certificates/verify/:certificateId` | Public | PUBLIC. Anyone (an employer, an auditor, a QR scanner) can check a certificate without signing in. Always answers 200 with `valid: true\|false` so a scanner can render the outcome. |

### Trainer evaluations

The weighted rubric a trainer fills in; it feeds the competency engine.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/evaluations` | Trainer, Admin | Trainer: evaluations I gave; admin: all. Filter by trainee or course. Query: `traineeId`, `courseId`, `page`, `pageSize`. Trainers see the evaluations they gave. |
| `POST /api/evaluations` | Trainer, Admin | Record a weighted evaluation of a trainee. The weighted score becomes evidence for the competency update engine, so a competency never depends on multiple-choice results alone. |
| `GET /api/evaluations/me` | Trainee | Evaluations I have received. |
| `GET /api/evaluations/rubric` | Any signed-in user | Criteria, labels and the weights currently in force. |

### Dashboards, achievements and search

Role dashboards, badges and global search (each result group respects what the caller may see).

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/achievements/me` | Any signed-in user | Badge catalogue with what the signed-in user has earned. |
| `GET /api/dashboard/trainee` | Trainee | Competency, gaps, recommendations, progress, assessments, certificates, activity. |
| `GET /api/dashboard/trainer` | Trainer, Admin | Courses, trainees, completion, scores, competency improvement. |
| `GET /api/search` | Any signed-in user | Global search over courses, competencies, learning materials and (where authorised) employees. Every group respects what the caller may see: - trainees: published courses; materials of courses they are enrolled in; no employees - trainers: published + own courses; materials of own courses; trainees of their courses - admins:   everything. |

### Notifications and announcements

In-app notifications and announcements addressed to the caller.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/announcements` | Any signed-in user | Announcements addressed to the signed-in user. |
| `GET /api/notifications` | Any signed-in user | My notifications, newest first. `?unread=true`, `?type=`. Query: `unread`, `type`, `page`, `pageSize`. |
| `DELETE /api/notifications/:id` | Any signed-in user | Dismiss. |
| `PATCH /api/notifications/:id/read` | Any signed-in user | Mark one notification as read. |
| `PATCH /api/notifications/read-all` | Any signed-in user | Mark everything as read. |
| `GET /api/notifications/unread-count` | Any signed-in user | Number of unread notifications (for the bell badge). |

### Administration

Everything under `/api/admin` requires the ADMIN role.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/admin/analytics` | Admin | Organisation metrics, monthly trends and department comparison. Query: `months` (3 to 24, default 12). |
| `GET /api/admin/announcements` | Admin | Every announcement (including expired ones). |
| `POST /api/admin/announcements` | Admin | Publish and (by default) notify the audience. |
| `PATCH /api/admin/announcements/:id` | Admin | Edit an announcement. |
| `DELETE /api/admin/announcements/:id` | Admin | Delete an announcement. |
| `GET /api/admin/audit-logs` | Admin | Who did what, when (filterable). Query: `q`, `action`, `entityType`, `userId`, `from`, `to`, `page`, `pageSize`. |
| `GET /api/admin/heatmap` | Admin | Competency heatmap (department or role × competency). Query: `groupBy` (`department` or `role`), `period` (`30d`, `90d`, `180d`, `365d`), `departmentId`, `jobRoleId`, `competencyId`. |
| `GET /api/admin/heatmap/cell` | Admin | The employees behind one heatmap cell. Query: `competencyId` (required), `groupBy`, `groupId`, `onlyGaps`, `page`, `pageSize`. |
| `POST /api/admin/jobs/reminders` | Admin | Send deadline / stalled-learner / skill-gap reminders now. |
| `GET /api/admin/predictive-needs` | Admin | Trend-based forecast of training needs (calculated from history; no AI service involved). Query: `horizon` in months (1 to 12, default 6). See [competency-engine.md](competency-engine.md#training-needs-forecast). |
| `GET /api/admin/skill-gaps` | Admin | Severity distribution and gaps by department / role / competency. |
| `GET /api/admin/training-needs` | Admin | Competencies ranked by organisation-wide training demand. |
| `GET /api/admin/training-needs/:competencyId` | Admin | Departments, affected employees and courses for one competency. |

### AR Instrument Lab

A trainee identifies components on a 3D model of an instrument. The practical is **marked on the server** from the components
they selected - no endpoint accepts a score - and the result is handed to the competency engine as PRACTICAL evidence, so it
goes through the same update rules as an assessment or a trainer evaluation. The combined score is
`theory x theoryWeight + practical x (1 - theoryWeight)`, with the weight configured per module; with no theory result yet the
practical stands on its own. Submission accepts an `idempotencyKey`, so a phone that drops mid-submit cannot create a second
attempt or a second competency update.

| Endpoint | Access | What it does |
|---|---|---|
| `GET /api/ar/modules` | Any signed-in user | Every published lab with this trainee's standing on the competency behind it. `?offsetDays=` simulates a future date. |
| `GET /api/ar/modules/:idOrKey` | Any signed-in user | One lab: components, guided training (with hints) and the trainee's own attempts. Never the answers. |
| `POST /api/ar/modules/:idOrKey/start` | Trainee | Begin a practical, or resume one already in progress. Returns the assessment tasks without answers or hints. |
| `POST /api/ar/modules/:idOrKey/submit` | Trainee | Mark the practical, combine it with the theory result and apply it to the competency engine, in one transaction. |
| `GET /api/ar/attempts/:attemptId` | Owner, course trainer, Admin | One finished practical, task by task, with the correct answers revealed. |
| `GET /api/ar/attempts` | Trainer, Admin | Completed practicals with the competency movement each one caused. |
| `GET /api/ar/refresher` | Any signed-in user | The refresher the freshness engine says this trainee needs, or `null`. |
| `GET /api/ar/analytics` | Admin | Completion, score distribution, competency gain and the tasks people find hardest. |

### AI features (optional)

They add to the deterministic framework and never change a skill gap, priority or competency level. Without an AI key the generative ones answer `503 AI_NOT_CONFIGURED`. See [AI features](#ai-features).

| Endpoint | Access | What it does |
|---|---|---|
| `POST /api/ai/courses/:courseId/ask` | Any signed-in user | Answers a question from the course's own materials, with sources. |
| `POST /api/ai/courses/:courseId/quiz-draft` | Trainer, Admin | Question drafts for the trainer to review (nothing is saved). |
| `POST /api/ai/predictive-needs/summary` | Admin | A written briefing of the (deterministic) training-needs forecast. |
| `POST /api/ai/recommendations/me/plan` | Trainee | Plain-language explanation of the engine's recommendations. |
| `POST /api/ai/search` | Any signed-in user | Plain-language course search: the request becomes filters, results come from the catalogue. |

## Sample responses

Trimmed responses from the demo data (`GET /api/skill-gaps/me`, one entry of `gaps`):

```json
{
  "competencyName": "Numerical Weather Prediction",
  "requiredLevel": 70, "currentLevel": 52, "gap": 18,
  "severity": "MODERATE", "priorityScore": 11.5, "priorityLevel": "LOW",
  "importanceLabel": "Major", "criticalityLabel": "High",
  "reason": "Numerical Weather Prediction: you are at 52% and your role requires 70%, a gap of 18 points (Moderate severity). Priority = gap 18 × importance 4/5 (Major) × role criticality 4/5 (High) = 11.5 out of 100, which is Low priority.",
  "band": "DEVELOPING",
  "recommendedCourses": [{ "title": "Numerical Weather Prediction Essentials", "stage": "INTERMEDIATE", "status": "ASSESSMENT_PENDING", "locked": false, "coverage": 18 }]
}
```

Public certificate verification (`GET /api/certificates/verify/CC-2026-SZ4Q794M`, no sign-in). It answers `200` for a
valid, revoked or unknown number so a QR scanner can always show the outcome, and exposes only what is printed on the
certificate (never an e-mail address, employee id or internal id):

```json
{ "success": true, "data": { "valid": true, "certificateNumber": "CC-2026-SZ4Q794M", "holderName": "Dr. Ananya Rao",
  "courseTitle": "Radar Fundamentals", "issuer": "India Meteorological Department, Ministry of Earth Sciences",
  "score": 84, "issuedAt": "2026-09-20T21:45:15.856Z", "verificationUrl": "http://localhost:5173/verify/CC-2026-SZ4Q794M" } }
```

```json
{ "success": true, "data": { "valid": false, "reason": "NOT_FOUND", "certificateNumber": "CC-0000-000000-AAAAAA", "verificationUrl": "..." } }
```

A revoked certificate answers `{ "valid": false, "reason": "REVOKED", "revokedAt": ..., "holderName": ..., "courseTitle": ... }`.

## AI features

Phase 2 features are optional and additive. **The rule-based framework decides; AI explains, drafts and searches.** A
skill gap, priority, recommendation order, competency level or certificate is never produced or changed by a model.

| Feature | Endpoint | Without an AI key |
|---|---|---|
| Course assistant (answers from the course's own text materials, with sources) | `POST /api/ai/courses/:courseId/ask` | `503 AI_NOT_CONFIGURED` |
| Quiz generator (drafts for a trainer to review; nothing is saved) | `POST /api/ai/courses/:courseId/quiz-draft` | `503 AI_NOT_CONFIGURED` |
| Study-plan explanation (wording for the engine's recommendations) | `POST /api/ai/recommendations/me/plan` | `503 AI_NOT_CONFIGURED` |
| Plain-language course search | `POST /api/ai/search` | works: a built-in keyword interpreter is used |
| Training-needs forecast (a linear-trend calculation) | `GET /api/admin/predictive-needs` | works: it never needed AI |
| Written briefing of the forecast | `POST /api/ai/predictive-needs/summary` | `503 AI_NOT_CONFIGURED` |

`GET /api/meta/options` reports `features.ai` so the web app can hide the generative screens, and `features.aiProvider` (for example `OpenAI`), the service that receives the text, which the notice next to each AI feature names.

How the model's output is treated: it is **untrusted input**. Structured output is requested and validated again on the
server; source ids the model cites, course ids, competency ids and categories are checked against the database and
dropped if they are not real; quiz drafts are re-validated with the same rules as hand-written questions, deduplicated
against the course's existing questions and shuffled; course text is escaped before it is placed in a prompt.
Requests, answers and prompts are never written to the audit log (only the feature, sizes and token counts).

| Code | Status | Meaning |
|---|---|---|
| `AI_NOT_CONFIGURED` | 503 | no API key on this server |
| `AI_BUSY`, `AI_UNAVAILABLE` | 503 | the AI service is rate limiting or unreachable; retry shortly |
| `AI_MISCONFIGURED` | 502 | the service rejected this server's credentials, or does not accept the configured model |
| `AI_QUOTA_EXHAUSTED` | 503 | the AI account this server uses has no credit left (OpenAI) |
| `AI_REQUEST_REJECTED`, `AI_UPSTREAM_ERROR` | 502 | the service refused or failed the request |
| `AI_REFUSED` | 422 | the model declined the request |
| `AI_TRUNCATED`, `AI_BAD_OUTPUT` | 502 | the answer was cut off or was not in the expected format |
| `AI_RATE_LIMITED` | 429 | the caller's hourly AI allowance is used up (failed requests do not count) |
| `NO_READABLE_MATERIALS` | 422 | the course has no text the assistant can read |
| `NOTHING_TO_EXPLAIN` | 422 | there are no recommendations to explain |
| `NOT_ENROLLED`, `NOT_COURSE_OWNER` | 403 | the caller may not use the assistant on that course |
