# Capacity Connect

**Digital Capacity Building & Competency Management Platform** for the India Meteorological Department (Ministry of Earth Sciences).

Capacity Connect turns "who completed which course" into "which competencies do our people actually have, where are the
gaps, and what should each person learn next". It runs the full loop: a competency framework per job role, skill-gap
analysis with explainable priorities, rule-based course recommendations and learning paths, courses and timed assessments,
competency levels that update from assessed evidence, verifiable PDF certificates, and organisation-wide analytics for the
training office. It is a real application: React and TypeScript in the browser, Node.js and Express behind it, PostgreSQL
underneath, with role-based access enforced on the server.

- [The problem](#the-problem) · [The solution](#the-solution) · [Features](#features) · [Screenshots](#screenshots)
- [How the competency engine works](#how-the-competency-engine-works) · [Architecture](#architecture) · [Tech stack](#tech-stack)
- [Getting started](#getting-started) · [Demo accounts and a guided demo](#demo-accounts-and-a-guided-demo)
- [Configuration](#configuration) · [Database](#database) · [API](#api) · [Testing](#testing) · [Deployment](#deployment) · [Security](#security)
- [Optional AI features](#optional-ai-features-phase-2) · [Project structure](#project-structure) · [Documentation](#documentation) · [Future scope](#future-scope)

## The problem

Training records answer *"who attended what"*. They do not answer *"who can do what"*. A forecaster can complete a radar course
and still be unable to interpret a Doppler velocity image; a department can have a serious gap in cyclone warning skills and not
know it; a training office commissions courses on instinct because there is no shared measure of demand; and a certificate
cannot be checked by anyone outside the office that printed it.

## The solution

* A **competency framework**: departments, job roles, competencies, and for each role the required level (0 to 100) and importance
  of each competency.
* A deterministic **engine** that computes each person's gap, how serious it is, and how much it matters (gap × importance × role
  criticality), and recommends courses in a Beginner → Intermediate → Advanced order, always with the reasons.
* **Assessed evidence moves competency**: a passed assessment, a trainer evaluation or a practical assessment is blended with the
  previous level (35% + an 84% assessment gives 72%, not 84%), with a full history you can inspect.
* **Certificates** that anyone can verify from a QR code, without signing in.
* **Analytics** for administrators: competency heatmaps, ranked training needs and a trend-based forecast of where needs are heading.
* Optional **AI assistance** (a course assistant, a quiz drafter, plain-language search, explanations and briefings) that adds to the
  framework and never replaces it.

## Features

**Trainee.** Competency Passport (levels, requirements, gaps and a timeline such as 35% → 52% → 72%), skill gaps with the reason
behind every priority, the AR Instrument Lab, "my readiness" (what has faded, what needs recertifying, what an upcoming operational period needs),
recommended courses and learning paths, a course catalogue with filters and plain-language search, course player with progress,
timed assessments with autosave, scenario-based practical exercises and instant feedback, certificates (PDF, QR, public link),
achievements, notifications, announcements, profile and global search. Saved courses and queued work keep working offline.

**Trainer.** Course authoring (modules, text, links, uploaded documents and video, competency mapping, prerequisites, publish
workflow with a readiness checklist), an assessment builder with a question bank, results and analytics per course, trainee
monitoring and passports for their own trainees, and the weighted evaluation rubric that feeds the engine.

**Administrator.** People (approve registrations, create accounts with one-time temporary passwords, roles, suspension), the
framework (departments, job roles and their requirements, competencies), engine settings with a simulator, every course and
certificate (revoke and reinstate), announcements, an audit log, the competency heatmap (with a freshness layer), training-needs
analysis and the forecast.

**Operational readiness.** Competency freshness with configurable decay and recertification; readiness time travel (recompute
everything at a future date without writing anything); knowledge-continuity risk with mentor pairing; a readiness calendar of
operational periods, each measured at its own start date, with preparation assigned to whoever is short; and an Operational
Readiness dashboard with a headline index that is labelled a demonstration metric wherever it appears.

**AR Instrument Lab.** A trainee places a Doppler weather radar in the room through their phone's camera, identifies its
components and takes a practical assessment on the model. The practical is marked on the server, combined with the theory
result at a configurable weighting, and applied to the competency engine as practical evidence - so it moves the competency
through the same rules as any other evidence, and it resets that competency's freshness. When the freshness engine later
reports the competency as at risk, a five-minute AR refresher is recommended automatically. AR is never required: on a laptop
or a phone without AR support the same lab runs as an interactive 3D model, and the assessment is identical.

**Platform.** Server-enforced role-based access, HttpOnly session cookies with refresh-token rotation, rate limiting, upload
validation, notifications and scheduled reminders, an audit trail, Ed25519-signed certificates with a public verification page,
and an installable, offline-capable web app.

## Screenshots

Taken in a real browser from the seeded demo data (after the guided demo below was run once, so the demo trainee already holds a
certificate). The two AI screens were captured with a *scripted stand-in* for the AI model, because no API key was available; they
show the interface, not real model output.

| | |
|---|---|
| ![Sign-in](docs/screenshots/01-sign-in.png)<br>**Sign-in** with demo shortcuts (development builds) | ![Competency Passport](docs/screenshots/02-competency-passport.png)<br>**Competency Passport**: readiness, gaps and profile |
| ![Skill gaps](docs/screenshots/03-skill-gaps.png)<br>**Skill gaps** with severity and priority, each explained | ![Learning path](docs/screenshots/04-learning-path.png)<br>**Learning path**: Beginner → Advanced, prerequisites locked |
| ![Course catalogue](docs/screenshots/05-course-catalog.png)<br>**Course catalogue** with plain-language search | ![Course player](docs/screenshots/06-course-player.png)<br>**Course player** with progress and the optional assistant |
| ![Assessment result](docs/screenshots/07-assessment-result.png)<br>**Assessment result** with the competency update | ![Certificate verification](docs/screenshots/08-public-certificate-verification.png)<br>**Public certificate verification** (no sign-in) |
| ![Trainer dashboard](docs/screenshots/09-trainer-dashboard.png)<br>**Trainer dashboard** | ![Course editor](docs/screenshots/10-course-editor.png)<br>**Course editor** with readiness checklist |
| ![Admin dashboard](docs/screenshots/11-admin-dashboard.png)<br>**Administrator dashboard** | ![Competency heatmap](docs/screenshots/12-competency-heatmap.png)<br>**Competency heatmap** by department |
| ![Training needs and forecast](docs/screenshots/13-training-needs-forecast.png)<br>**Training needs and forecast** | ![Engine settings](docs/screenshots/14-engine-settings.png)<br>**Engine settings** with the simulator |
| ![AI course assistant](docs/screenshots/15-ai-course-assistant.png)<br>**AI course assistant** (scripted stand-in model) | ![AI quiz generator](docs/screenshots/16-ai-quiz-generator.png)<br>**AI quiz generator**: drafts to review (scripted stand-in model) |

### Operational readiness

| | |
|---|---|
| ![Operational readiness](docs/screenshots/17-operational-readiness.png)<br>**Operational Readiness dashboard**: the index with its arithmetic on show, and the simulation control | ![Readiness calendar](docs/screenshots/18-readiness-calendar.png)<br>**Readiness calendar**: operational periods, each measured at its own start date |
| ![Readiness sprint](docs/screenshots/19-readiness-sprint.png)<br>**A readiness sprint**: who is short, on what, measured at the event's start | ![Knowledge continuity](docs/screenshots/20-knowledge-continuity.png)<br>**Knowledge continuity**: where too few people hold a competency |
| ![My readiness](docs/screenshots/22-my-readiness.png)<br>**My readiness** (trainee): what has faded and what is needed next | ![Offline library](docs/screenshots/25-offline-library.png)<br>**Offline library**: what this device holds and what is waiting to sync |

### AR Instrument Lab

| | |
|---|---|
| ![AR Instrument Lab](docs/screenshots/23-ar-instrument-lab.png)<br>**AR Instrument Lab**: each lab with the competency it develops | ![Doppler Radar Lab](docs/screenshots/24-ar-doppler-radar.png)<br>**Doppler Radar Lab**, guided training. Captured on a desktop, so it shows the **Interactive 3D fallback** and the notice that AR is unavailable here; on an Android phone the same screen offers "View in AR" |
| ![AR practical performance](docs/screenshots/21-ar-practical-analytics.png)<br>**AR practical performance** (administrator): score distribution, hardest tasks and the competency gain the labs actually produced | |

## How the competency engine works

Everything below is deterministic and reproducible by hand; [docs/competency-engine.md](docs/competency-engine.md) has the full
detail and worked examples.

| Step | Rule | Demo value |
|---|---|---|
| Skill gap | `required − current` (never negative) | Radar Meteorology: 80 − 35 = **45** |
| Severity | 0 to 10 Low · 11 to 25 Moderate · 26 to 50 High · 51 and up Critical | 45 → **High** |
| Training priority | `gap × (importance ÷ 5) × (role criticality ÷ 5)`, scale 0 to 100; Low below 12, Medium 12+, High 25+, Critical 45+ | 45 × 4/5 × 4/5 = **28.8** → **High** |
| Competency update | `0.25 × previous + 0.75 × evidence` (evidence = weighted assessment, trainer evaluation, practical); no decrease; capped at the course's target level | 0.25 × 35 + 0.75 × 84 = 71.75 → **72** |
| Recommendations | courses that overlap the gap, scored by priority and coverage, prerequisites first, every reason shown | Radar Fundamentals → Doppler → Advanced |
| Forecast | straight-line trend of each competency's monthly average; projection from today's average | e.g. +5 points a month closes a 20-point gap in 4 months |

All thresholds and weights are administrator settings with a simulator to preview a change.

## Architecture

```mermaid
flowchart LR
  Browser["React SPA<br/>(TypeScript, Vite)"] -->|"JSON + HttpOnly cookies"| Web["nginx<br/>static files + /api proxy"]
  Web --> API["Express API<br/>stateless, TypeScript"]
  API --> DB[("PostgreSQL")]
  API --> Files[("Uploads<br/>disk or S3")]
  API -.->|"optional"| AI["OpenAI (GPT)<br/>or Anthropic"]
```

The web app and the API deploy independently; the competency logic is pure functions shared by the API and its tests. Read
[docs/architecture.md](docs/architecture.md) for the request pipeline, the atomic assessment submission, files, background jobs and
the design decisions.

## Tech stack

| Layer | Technology |
|---|---|
| Web app | React 19, TypeScript 5.9, Vite 6, React Router 6, TanStack Query 5, React Hook Form + Zod 4, Tailwind CSS 3, Recharts 2, Lucide icons |
| API | Node.js 22, Express 5, TypeScript, Zod 4 validation, Prisma 6, `@node-rs/argon2`, `jsonwebtoken`, helmet, express-rate-limit, multer, PDFKit + qrcode, pino |
| Database | PostgreSQL 17 (48 tables, migrations, SQL `CHECK` constraints) |
| Storage | local disk (development) or any S3-compatible bucket |
| AI (optional) | OpenAI GPT models over the Chat Completions API (plain `fetch`, JSON answers checked against a Zod schema); Anthropic Claude through its official SDK as an alternative |
| Tests | Vitest, Supertest against a real PostgreSQL, React Testing Library + jsdom |
| Delivery | npm workspaces monorepo, Docker, nginx, GitHub Actions |

## Getting started

Prerequisites: **Node.js 22** (20.19 or newer is allowed by `engines`) and either your own **PostgreSQL 17** or the local one that
`npm run db:local` starts for you (no Docker or system install needed).

```bash
git clone <this repository> && cd capacity-connect
npm install
npm run setup          # creates .env from .env.example with a freshly generated JWT_SECRET
npm run db:local       # terminal 1: starts PostgreSQL on :5432 and creates the development and test databases (leave it running)
npm run db:deploy      # apply the migrations
npm run db:seed        # load the demo data (about 50 people, 17 courses, a year of activity)
npm run dev            # API on http://localhost:4000, web app on http://localhost:5173
```

If you use your own PostgreSQL, set `DATABASE_URL` (and `TEST_DATABASE_URL`, which must end in `_test`) in `.env` and skip
`npm run db:local`. Open http://localhost:5173.

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | API (auto-restarts on change) and web app (hot reload) together |
| `npm run typecheck` · `npm run lint` | strict TypeScript and ESLint for both workspaces |
| `npm test` | all backend and frontend tests |
| `npm run build` | production build of the API and the web app |
| `npm run db:migrate` · `db:deploy` · `db:seed` · `db:studio` | create a migration · apply migrations · demo data · Prisma Studio |
| `npm run admin:create -- --email … --name "…"` | create an administrator (the way to start a production system) |
| `npm run routes` · `npm run routes -- --check` | list every API route with its access rule · verify `docs/api.md` against them |

`npm run db:seed -- --reset` **wipes the application data** and re-seeds; use it to return to the pristine demo.

## Demo accounts and a guided demo

The seed creates about 50 people. Three headline logins all use the password in `SEED_DEMO_PASSWORD` in your `.env`.
`.env.example` leaves it **empty**, in which case the seed generates a random password and prints it once at the end of
its output - set the variable yourself if you would rather choose one:

| Role | Email | Who |
|---|---|---|
| Trainee | `trainee@imd.gov.in` | Dr. Ananya Rao, Severe Weather Forecaster (Forecasting) |
| Trainer | `trainer@imd.gov.in` | Dr. Arjun Mehta, owns the Radar courses |
| Administrator | `admin@imd.gov.in` | Meera Iyer, Learning & Development |

The seed also leaves three self-registered accounts waiting for approval and one suspended account, so the approval workflow can be
tried. Sign-in shows these shortcuts in development (and when built with `VITE_SHOW_DEMO_ACCOUNTS=true`).

**The scenario** (on a freshly seeded database):

1. Sign in as the **trainee**. The Competency Passport shows Radar Meteorology at **35%** against a required **80%**: a gap of
   **45**, **High** priority (28.8 out of 100), and the reason is written out.
2. **Learning path** and **Ranked recommendations** propose *Radar Fundamentals* first, then *Doppler Radar Analysis* (locked until the
   first is done), then *Advanced Radar Analysis*, each with why.
3. **Enrol** in Radar Fundamentals, open it in the course player, and mark its five modules complete.
4. Start the **assessment** and answer. Scoring about **84%** passes; the result page shows **Radar Meteorology: 35% → 72%**
   and the explanation of the calculation.
5. The **Competency Passport** now shows 72% and a timeline; **Certificates** has a new PDF with a QR code. Open the **verification
   link** in a private window (no sign-in): it shows the certificate as valid.
6. Sign in as the **trainer**: the trainee appears under *Trainees*, with the attempt, the passport and the option to record a
   weighted evaluation (which the engine blends into the level).
7. Sign in as the **administrator**: the *Competency Heatmap* and *Training Needs* pages rank the organisation's demand, the
   forecast shows where it is heading, *Certificates* can revoke (and the public page then says revoked), and the *Audit Log* shows
   everything above.

The same scenario is replayed end to end by an automated test (`backend/tests/integration/demo-scenario.test.ts`).

### The operational-readiness and AR scenario

The walk above ends with a competency that is up to date. This one is about what happens next, and was rehearsed end to end
against a seeded database (the numbers below are the ones that actually appeared).

1. Sign in as the **trainee**. *Skill Gaps* shows Radar Meteorology at **35%** of the **80%** the role needs - **High** severity,
   freshness **Watch**. No refresher is offered: the competency is current, it is simply under-trained.
2. Open the **AR Instrument Lab** → *Doppler Radar Lab*. Read the objectives, then start it. Four guided training steps with hints
   (not scored), then five assessment tasks with neither. Tap the numbered markers on the radar; "See inside" hides the radome so
   the antenna is visible. On an Android phone, **View in AR** places the radar on the floor in front of you.
3. Submit. Getting four of five right scores **practical 80%**. With no theory result yet the practical stands alone, and the
   competency engine takes Radar Meteorology from **35% to 69%** - blended, not set to the score, with the arithmetic shown.
4. Take the **Radar Fundamentals** theory assessment (already enrolled, modules complete). Around **84%** passes, and the engine
   re-blends to roughly **73%**. Run the AR lab again and the result page now shows the weighting in full:
   **theory 84% × 40% + practical 80% × 60% = 81.6%**.
5. The **Competency Passport** records the practical alongside the assessment and the trainer evaluation, with the date, because
   a practical from two years ago is a different claim from one taken last week.
6. Sign in as the **administrator**. *AR Practicals* shows every attempt with the competency movement it caused, plus the score
   distribution and which tasks people find hardest. *Operational Readiness* shows the index with its arithmetic.
7. **Travel forward.** Use the simulation control on *Operational Readiness*, or *My Readiness* as the trainee. At **+90 days**
   the radar competency has decayed to **24%** and is **Critical**; at **+180 days** it is **Expired**. Nothing is written: the
   engine recomputes from the dates.
8. The trainee's dashboard now offers a **five-minute AR refresher**. Completing it records fresh practical evidence and resets
   the competency's freshness - the loop closes.

Everything in steps 2 to 8 is covered by `backend/tests/integration/ar-lab.test.ts`.

## Configuration

All configuration is by environment variable, validated at start-up (the API refuses to start with a list of what is wrong).
`.env.example` documents every variable; the ones you will change first:

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL (the test one is truncated by the tests and must end in `_test`) |
| `JWT_SECRET` | signs access tokens (32+ characters; `npm run setup` generates one) |
| `FRONTEND_URL`, `COOKIE_SECURE`, `COOKIE_SAMESITE` | CORS origins and cookie policy (secure cookies are mandatory in production) |
| `STORAGE_DRIVER` (+ `STORAGE_*`) | `local` or `s3` for uploads |
| `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `AI_MODEL` | `openai` (GPT) or `anthropic` (with `ANTHROPIC_API_KEY`); leave the key empty to keep the AI features off; `AI_MODEL` empty = `gpt-4.1-mini` |
| `VITE_API_URL` | when the web app and the API are hosted on different origins |

The full table, defaults and the production rules are in [docs/deployment.md](docs/deployment.md#configuration).

## Database

PostgreSQL, 48 tables in six groups (organisation and accounts, competency framework, courses and learning, assessment and
certification, operational readiness and the AR lab, engagement and governance), UUID keys, append-only history and audit tables, soft deletion where records must
outlive their owner, and `CHECK` constraints that make the database itself refuse a competency level outside 0 to 100. The entity
diagram, every table, the migrations and the seed are described in [docs/database.md](docs/database.md).

## Offline and installable

The web app is a Progressive Web App. It installs from the browser, and what has been saved keeps working with no network at all.

- **App shell.** A hand-written service worker (`frontend/public/sw.js`, no build-time dependency) caches the HTML, the hashed
  build assets and the icons. It is registered only in production builds; set `VITE_ENABLE_SW=true` to exercise it in development.
- **Saved courses.** "Save for offline" in the course player downloads a course's modules, readings, documents and videos into
  IndexedDB. Saved documents and videos are then served from the device, not the network.
- **Work done offline.** Marking a module complete, course feedback and submitting an assessment already in progress are queued in
  IndexedDB and sent when the connection returns, oldest first. Each entry carries an idempotency key generated when the learner
  acted, so a submission replayed after a dropped connection returns the original result instead of costing an attempt.
- **What the learner sees.** A connection indicator in the header reads ONLINE, OFFLINE, SYNCING or SYNC COMPLETE, with the list of
  changes still waiting. The Offline Library page (`/offline-library`) shows what this device is holding and lets the learner
  remove any of it.
- **Shared devices.** Signing out flushes the queue, then deletes every cached response, saved course and stored file.

Starting a new assessment, issuing certificates and the workforce dashboards need a connection, and the interface says so rather
than failing quietly.

## API

A JSON REST API under `/api` with a consistent envelope (`{ success, data, meta }` and `{ success: false, code, message }`),
pagination, validation errors per field, HttpOnly cookie sessions with CSRF protection, and role-based access. **175 endpoints** are
documented in [docs/api.md](docs/api.md), and `npm run routes -- --check` (run in CI) fails if the document and the code diverge.

## Testing

```bash
npm test                          # backend (unit + integration against PostgreSQL) and frontend
npm run test -w backend           # only the API: needs PostgreSQL (npm run db:local) and TEST_DATABASE_URL
npm run test:coverage -w backend  # with coverage
npm run test -w frontend
```

| Suite | Tests | What it covers |
|---|---|---|
| Backend unit | engine rules (gaps, severity, priority, the update formula and its guard-rails, recommendations and learning paths, scoring), the forecast maths, AI client behaviour against a local stand-in for the API, rate limits, uploads, config validation | pure logic and infrastructure, no database |
| Backend integration | authentication and sessions, RBAC and record ownership, courses, assessments and scoring, the AR Instrument Lab end to end (server-side marking, theory/practical weighting, the competency update, the decay-driven refresher), scenario-based practical assessment and idempotent submission, certificate signing and public verification, competency decay and the readiness simulation, readiness events and assignment, knowledge continuity, organisation analytics and the heatmap's freshness layer, the demo scenario, the forecast, the AI features (with a scripted fake model), the admin CLI | the real Express app over HTTP against a real PostgreSQL |
| Frontend | the API client (CSRF header, envelope, single-flight session refresh), sign-in and the forced-password-change regression, route guards, the offline mutation queue (ordering, idempotency, retry and give-up) and its status indicator, the AI screens, the quiz generator, link safety, accessibility contracts (tabs, table scroll areas, headings, landmarks) and the heatmap's text contrast | React Testing Library with a scripted API |

614 backend tests and 139 frontend tests pass at the time of writing, alongside strict TypeScript, ESLint and the production
builds. What is **not** in the repository: automated browser end-to-end tests. The flows (the guided demo, trainer authoring, every
admin workflow, the AI screens, the security headers) were exercised in a real browser with throw-away Playwright scripts during
development, not kept as a test suite; the same scripts ran an axe-core accessibility and layout scan of 31 screens at desktop
and phone width, which came back clean (an automated scan is not a substitute for testing with assistive technology).

The AR lab needs one more caveat. **AR placement was confirmed on a real Android phone in Chrome**: the camera starts, a
surface is detected and the radar is placed. The viewer itself needs WebGL, which the test environment does not have, so the AR
tests cover the screens around it - the lab list, the refresher recommendation, the scoring and the result - rather than the
rendering, and the desktop 3D fallback has not been clicked through by hand. See [docs/AR_ASSETS.md](docs/AR_ASSETS.md) for what
has and has not been checked, and re-test the AR flow after upgrading `@google/model-viewer`.

## Deployment

Docker Compose (PostgreSQL + API + nginx-served web app, with a one-off migration step) or separate hosting of each part; both,
the environment, TLS, object storage, backups, scaling and troubleshooting are in [docs/deployment.md](docs/deployment.md).
A GitHub Actions workflow runs typecheck, lint, tests, the docs check and the builds. **The Dockerfiles, the nginx template and
the compose file could not be built where this was developed (no Docker there)**, so treat the first `docker compose up` as a test.

## Security

Argon2id password hashing and account lock-out; HttpOnly cookies with rotating refresh tokens and reuse detection; role checks per
route *and* per record on the server; CSRF header, strict CORS, security headers and a strict Content-Security-Policy;
schema-validated input and parameterised queries only; content-checked uploads; rate limiting; no secrets in code or logs; an
audit trail; and a deliberate treatment of AI output as untrusted. Details, known limitations (no MFA, no e-mail delivery, no
malware scanning) and a production hardening checklist are in [docs/security.md](docs/security.md).

## Optional AI features (Phase 2)

Off unless the key of the chosen provider is set (`OPENAI_API_KEY` by default), and always additive: **the rule-based framework decides; AI explains, drafts and searches.**

* a **course assistant** that answers only from the course's own materials, with sources;
* a **quiz generator** that drafts questions for the trainer to review (nothing is saved automatically);
* a **study-plan explanation** of the engine's recommendations (it cannot add or reorder a course);
* **plain-language course search** (works without AI through a built-in keyword interpreter);
* a **training-needs forecast** (a calculation, needs no AI) with an optional **written briefing**.

Model output is validated against the database before use; users see exactly what is sent to the AI service; use is rate limited per
user and audited without storing prompts. **The automated tests use a scripted fake model and a local stand-in for the providers'
HTTP protocols. The default provider (OpenAI) was also tried against the real API with all five features; the optional Anthropic
provider has only been tested against the stand-in.** Try any provider with your own key in a non-production environment first.
See [docs/security.md](docs/security.md#optional-ai-features) for the data flow.

## Project structure

```
backend/     Express API: src/modules (one folder per feature), src/middleware, src/services, src/cli, tests, scripts
frontend/    React app: src/pages, src/components (ui + domain), src/services, src/api, src/charts, src/offline; nginx/ for production
             public/  the service worker, web app manifest, icons and the AR models
prisma/      schema.prisma, migrations, the deterministic demo seed
docs/        architecture, database, api, competency-engine, security, deployment (+ screenshots)
scripts/     local PostgreSQL, .env setup, the AR model generator
```

## Documentation

| Document | Read it for |
|---|---|
| [docs/architecture.md](docs/architecture.md) | how the system is put together and why |
| [docs/database.md](docs/database.md) | the schema, integrity rules, migrations, seed, personal data |
| [docs/api.md](docs/api.md) | conventions and all 175 endpoints |
| [docs/AR_ASSETS.md](docs/AR_ASSETS.md) | every 3D asset, its source, licence and how it is regenerated |
| [docs/competency-engine.md](docs/competency-engine.md) | every formula with worked examples, recommendations, the forecast |
| [docs/security.md](docs/security.md) | controls, AI data flow, known limitations, hardening checklist |
| [docs/deployment.md](docs/deployment.md) | environment, Docker, separate hosting, storage, backups, troubleshooting |

## Future scope

Not implemented, and reasonable next steps: e-mail and SMS delivery of notifications and password reset; single sign-on with the
department's identity provider and multi-factor authentication; a Hindi and regional-language interface; e-learning standards
(SCORM and xAPI) for imported content; a native mobile app (the web app is already installable and works offline); background
synchronisation so queued work is sent even with the app closed; scheduled instructor-led sessions with
attendance; question-bank analytics (difficulty and discrimination) and proctoring for high-stakes assessments; 360-degree and peer
evaluation; synchronisation with the HR system for postings and role changes; cohort analytics and exportable reports; a formal
accessibility audit against WCAG; malware scanning of uploads; and, for the AI features, retrieval over PDFs and video transcripts
and human review workflows.

## Licence

No licence has been chosen; until the project owner adds one, all rights are reserved.
