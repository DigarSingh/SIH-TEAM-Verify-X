# Deployment

Capacity Connect is three independent parts: a **web app** (static files), a stateless **API** (Node.js) and **PostgreSQL**.
Uploaded files live on disk or in an S3-compatible bucket. You can run all of it on one host with Docker Compose, or host each
part separately (the web app on any static host or CDN, the API on a container platform or VM, a managed database).

> **What has and has not been verified.** The application, the tests, the production builds and the web app's security
> headers (checked in a real browser against the production bundle) were verified during development. The Dockerfiles, the
> nginx template, `docker-compose.yml` and the CI workflow were written carefully but **could not be built or run** where this was
> developed (no Docker, no nginx, no GitHub runner). The CI workflow builds both images and validates the compose file on the
> first push; treat the first deployment as a test and read the container logs.

## Requirements

* Node.js 22 (developed on 22.16 and also tested on 24.21; the `engines` field allows 20.19 or newer) and PostgreSQL 17 (the version it was developed and tested on).
* A domain name and TLS termination in front of the web tier (a load balancer, an ingress controller, or a host-level proxy).
* For AI features only: an OpenAI API key, or an Anthropic one (see [AI features](#ai-features-optional)).

## Configuration

Everything is configured through environment variables, validated at start-up: the API refuses to start with a message that
lists every problem. `.env.example` documents each variable without values. Never commit a real `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `production` turns on the production checks below |
| `PORT` | `4000` | API port |
| `LOG_LEVEL` | `info` | `trace` … `fatal`, `silent` |
| `TRUST_PROXY` | `false` | number of reverse-proxy hops in front of the API (so rate limits and audit logs see the client IP) |
| `DATABASE_URL` | required | PostgreSQL connection string |
| `TEST_DATABASE_URL` | | only for the backend tests; must end in `_test` (they truncate every table) |
| `JWT_SECRET` | required | at least 32 characters; signs access tokens |
| `ACCESS_TOKEN_TTL_MINUTES` / `REFRESH_TOKEN_TTL_DAYS` | `15` / `7` | session lifetimes |
| `COOKIE_SECURE` | `false` | **must be `true` in production** (HTTPS only) |
| `COOKIE_SAMESITE` | `lax` | `lax`, `strict` or `none` (`none` for a web app and API on different sites; requires `COOKIE_SECURE=true`) |
| `COOKIE_DOMAIN` | | set for a shared parent domain (for example `.example.gov.in`) |
| `FRONTEND_URL` | required in production | comma-separated allowed browser origins (CORS); the first is also the base of certificate verification links and QR codes |
| `REGISTRATION_REQUIRES_APPROVAL` | `true` | self-registered accounts wait for an administrator |
| `ALLOWED_EMAIL_DOMAINS` | any | comma-separated domains allowed to self-register |
| `MAX_FAILED_LOGINS` / `LOCKOUT_MINUTES` | `5` / `15` | account lock-out |
| `ARGON2_MEMORY_KIB` / `ARGON2_TIME_COST` | `19456` / `2` | password hashing cost; raise on production hardware |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
| `STORAGE_LOCAL_DIR` | `./uploads` | for `local`; a persistent volume in production |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_FORCE_PATH_STYLE` | | for `s3` (bucket, access key and secret are required) |
| `MAX_UPLOAD_MB` | `25` | upload size cap; keep the proxy limit above it |
| `CERTIFICATE_ISSUER`, `CERTIFICATE_ID_PREFIX` | IMD text, `CC` | printed on certificates; the prefix is 2 to 8 upper-case letters or digits |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX` | `900000`, `1000`, `30` | rate limits per client IP |
| `ENABLE_SCHEDULER` | `false` | run the reminder job every six hours in the API process |
| `AI_PROVIDER` | `openai` | which service writes the AI answers: `openai` (GPT models) or `anthropic` (Claude); only that provider's key is used |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | empty | the OpenAI key (switches the optional AI features on); the base URL only for an OpenAI-compatible service (must be `https://` in production) |
| `ANTHROPIC_API_KEY` | empty | the key when `AI_PROVIDER=anthropic` |
| `AI_MODEL`, `AI_REFUSAL_FALLBACKS`, `AI_RATE_LIMIT_PER_HOUR`, `AI_MAX_CONTEXT_CHARS` | provider default, `true`, `30`, `120000` | see below |
| `SEED_DEMO_PASSWORD`, `ALLOW_PRODUCTION_SEED` | | development seed only |
| `VITE_API_URL` | empty | build-time: absolute API URL when the API is on another origin |
| `VITE_SHOW_DEMO_ACCOUNTS`, `VITE_DEMO_PASSWORD` | `false`, empty | build-time: demo shortcuts on the sign-in page. Never set a real password |

Production checks (the API will not start otherwise): `COOKIE_SECURE=true`, `FRONTEND_URL` set, `JWT_SECRET` of at least 32
characters, S3 credentials when `STORAGE_DRIVER=s3`, and `COOKIE_SAMESITE=none` only together with `COOKIE_SECURE=true`.

Docker Compose additionally reads `POSTGRES_PASSWORD` (required), `POSTGRES_USER`, `POSTGRES_DB`, `PUBLIC_URL`, `WEB_PORT`
and `CSP_EXTRA_ORIGINS` from the same `.env` file.

## Option A: Docker Compose on one host

```bash
npm run setup                        # creates .env from .env.example with a generated JWT_SECRET (or: cp .env.example .env and set it yourself)
# edit .env: set POSTGRES_PASSWORD (letters and digits) and PUBLIC_URL
docker compose up -d --build         # starts db, applies migrations (one-off "migrate" service), starts api and web
docker compose run --rm api node dist/cli/create-admin.js --email you@example.gov.in --name "Your Name"
```

Open `PUBLIC_URL` (default `http://localhost:8080`) and sign in with the temporary password the command printed; you will be
asked to choose your own. The services:

| Service | What it is | Notes |
|---|---|---|
| `db` | `postgres:17-alpine` | data in the `pgdata` volume |
| `migrate` | the API image running `prisma migrate deploy` | one-off; the API starts only after it succeeds |
| `api` | the API image | not published on the host; reached through `web`. Uploads in the `uploads` volume; health check on `/api/health` |
| `web` | nginx serving the build and forwarding `/api` | published on `WEB_PORT`; sets the security headers and the `/api` timeouts |

Compose fixes the production choices on purpose (`NODE_ENV=production`, secure cookies) and passes only the variables it
lists to the containers. Browsers accept `Secure` cookies on `http://localhost` (Chrome, Edge, Firefox; Safari does not), so
the stack works for a local trial; for a real deployment put TLS in front of `web` and set `PUBLIC_URL` to the HTTPS address.

**Updating.** `git pull && docker compose up -d --build`: the new image is built, `migrate` applies any new migrations first,
then the API and web containers are replaced. **Back up the database before an upgrade** (below); migrations are forward-only.

**TLS.** Terminate TLS on a load balancer or a host-level proxy that forwards to `web:80`, sets `X-Forwarded-Proto`,
`X-Forwarded-For` and keeps `Host`. If it is a proxy hop in addition to the nginx container, raise `TRUST_PROXY` to 2. Enable
HSTS at that layer as well (the API sends it in production).

## Option B: separate hosting

Build and run each part where you prefer.

**API** (container platform, VM or PaaS):

```bash
npm ci && npx prisma generate && npm run build -w backend     # produces backend/dist
npx prisma migrate deploy                                     # applies migrations (needs DATABASE_URL)
node backend/dist/server.js                                   # or: npm start
```

The image built from `backend/Dockerfile` does the same. Give it a managed PostgreSQL, set the variables above, and expose it
over HTTPS. For more than one instance use `STORAGE_DRIVER=s3` (uploads must be shared) and set `TRUST_PROXY`.

**Web app** (any static host or CDN):

```bash
VITE_API_URL=https://api.example.gov.in/api npm run build -w frontend      # produces frontend/dist
```

Serve `frontend/dist` with a single-page-app fallback (every unknown path returns `index.html`), cache `assets/` for a year
and never cache `index.html`. The nginx template in `frontend/nginx/` shows the headers to send.

**Cookies and CORS across origins.** If the web app and the API are on *different sites* (different registrable domains), the
browser only sends the session cookies with `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`, and the API must list the web
origin in `FRONTEND_URL`. If they share a parent domain (`app.example.gov.in` and `api.example.gov.in`) use `COOKIE_SAMESITE=lax`
and, if you want the cookies shared, `COOKIE_DOMAIN=.example.gov.in`. Serving both behind one origin, as Compose does, avoids
all of it. When the API is on another origin also add it to the web app's Content-Security-Policy (`CSP_EXTRA_ORIGINS` in the
nginx image, or the equivalent header on your static host).

## Object storage (S3-compatible)

Set `STORAGE_DRIVER=s3`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, and for non-AWS stores
`STORAGE_ENDPOINT` and `STORAGE_FORCE_PATH_STYLE=true`. The bucket stays **private**: the API checks who may see a file and
answers with a short-lived pre-signed URL. Because the browser follows that redirect, the bucket needs CORS for the web origin
and the web app's Content-Security-Policy must allow the bucket origin (`CSP_EXTRA_ORIGINS=https://my-bucket.s3.amazonaws.com`).

## Database

* **Migrations.** `npx prisma migrate deploy` (Compose runs it in the `migrate` service; in CI/CD run it before starting the
  new API version). It applies only committed migrations and never generates or resets anything. See
  [database.md](database.md#migrations) for how to write one, and keep changes backward compatible with the previous API version so
  a rolling deploy works.
* **Users.** Migrations need DDL rights; the running API needs only `SELECT`, `INSERT`, `UPDATE`, `DELETE`. Use two database users
  if you can.
* **Connections.** Prisma opens a pool per API instance; size it with the `connection_limit` query parameter of `DATABASE_URL`,
  and behind PgBouncer add `pgbouncer=true`.
* **Backups.** Use the provider's point-in-time recovery, or schedule `pg_dump --format=custom` and *test the restore*. Back up
  the uploads (volume or bucket) with it: they are one system.
* **Never run the demo seed in production.** It refuses `NODE_ENV=production`; create the first administrator with the command
  below instead.

## First administrator and accounts

```bash
npm run admin:create -- --email you@example.gov.in --name "Your Name"                                # from a checkout
docker compose run --rm api node dist/cli/create-admin.js --email you@example.gov.in --name "Your Name"   # with Compose
```

A strong temporary password is printed once; the account must change it at first sign-in. `ADMIN_PASSWORD` may supply your own
first password (for example from a secret manager). After that, administrators create and approve accounts in the web app.

## Running more than one API instance

The API is stateless: sessions are rows in PostgreSQL. Requirements: shared uploads (`STORAGE_DRIVER=s3`), `TRUST_PROXY` set,
and awareness that rate-limit counters are per instance. `ENABLE_SCHEDULER=true` is safe on every instance because the reminder job
takes a PostgreSQL advisory lock, so only one runs it; alternatively leave it off and call `POST /api/admin/jobs/reminders` from an
external cron with an administrator session.

## Health, logs and monitoring

* `GET /api/health` returns `{ status: "ok" }` only if the database answers: use it for load-balancer and container checks.
* Logs are one JSON object per line on stdout (pino). Ship them; every request line and every error carries the request id
  that the client also receives as `X-Request-Id`.
* Worth alerting on: 5xx rates, `SESSION_REUSE_DETECTED` and repeated `USER_LOCKED` audit entries, database connection errors,
  disk space of the uploads volume, certificate/backup job failures on your side.

## AI features (optional)

Leave the key of the chosen provider empty to keep the generative features off (the platform then behaves exactly as without
them, and plain-language search and the forecast still work). To enable them with GPT, create a key at
platform.openai.com/api-keys (the account needs API credit), set `OPENAI_API_KEY` (from your secret manager, never in the
repository), review what is sent ([security.md](security.md#optional-ai-features)) and tell your staff. For Claude set
`AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` instead. `OPENAI_BASE_URL` is only for a service that speaks OpenAI's protocol
other than OpenAI itself; the text of your courses then goes to that operator, so choose one you trust.

`AI_MODEL` picks the model. Empty means `gpt-4.1-mini` with OpenAI, which was checked against the app's own prompts: it returned
valid drafts and grounded answers, declined a question the course does not cover and ignored an instruction planted in a
reading, at low cost and in one to five seconds. A larger model can polish quiz drafts a little more at a higher price; models that
think before answering (`gpt-5*`, `o*`) are supported but slower and use more tokens for the same result. With Anthropic the
default is `claude-opus-5`, and `AI_REFUSAL_FALLBACKS=true` lets Anthropic re-run a request the model declines on its
recommended fallback model (set `false` if your account has no access to that beta; it has no effect with OpenAI).
`AI_RATE_LIMIT_PER_HOUR` caps requests per user per hour, and `AI_MAX_CONTEXT_CHARS` caps the course text sent per request. An AI
request can take up to two minutes: keep any proxy read timeout above that (the bundled nginx uses 180 s). If OpenAI answers
that the account has no credit left, the AI screens show a clear notice and everything else keeps working.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| The API exits at start with "Invalid environment configuration" | the message lists each missing or invalid variable; see the table above |
| Sign-in works but the next request is `401` | the session cookie is not being stored: `COOKIE_SECURE=true` over plain HTTP (except `localhost`), or `COOKIE_SAMESITE=lax` with the web app and API on different sites |
| Browser reports a CORS error | the web origin is not in `FRONTEND_URL` (compare scheme, host and port exactly) |
| Every write answers `403 CSRF_REJECTED` | a proxy or client drops the `X-Requested-With` header |
| Everyone shares one rate-limit budget or the audit log shows only the proxy's address | `TRUST_PROXY` is not set to the number of proxy hops |
| Uploads fail with `413` | the proxy's body limit is below `MAX_UPLOAD_MB` (the bundled nginx allows 30 MB) |
| An AI request fails with a gateway timeout | a proxy read timeout shorter than the request; raise it (180 s) |
| Files do not open with S3 storage | bucket CORS, or the bucket origin is missing from `CSP_EXTRA_ORIGINS` |
| `prisma migrate deploy` cannot connect | `DATABASE_URL` host or password (a password with `@`, `:` or `/` must be percent-encoded) |
| Certificate QR codes point at `localhost` | `FRONTEND_URL` (its first entry) or `PUBLIC_URL` is not the public address |

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: typecheck, lint, all tests (the backend against a real
PostgreSQL service, the frontend in jsdom), the check that `docs/api.md` lists exactly the routes the code registers, and the production
build; a second job builds both Docker images and validates the compose file. A deployment pipeline should build the images once,
run `prisma migrate deploy` as a release step, then roll the API and web containers.
