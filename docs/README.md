# UPSC Compass — Auth API (Bun + Express + Drizzle + PostgreSQL)

Backend service implementing the auth contract described in `AUTH_API.md` for the Dextora UPSC Compass Flutter app. All endpoints are mounted under the `/api/v1` prefix.

---

## Tech stack

| Layer        | Choice                                    |
| ------------ | ----------------------------------------- |
| Runtime      | [Bun](https://bun.sh) (1.1+)              |
| HTTP         | Express 5                                 |
| Database     | PostgreSQL 14+                            |
| ORM          | Drizzle (`drizzle-orm`, `drizzle-kit`)    |
| DB driver    | `postgres` (postgres-js)                  |
| Validation   | Zod                                       |
| Auth tokens  | JWT (HS256, `jsonwebtoken`)               |
| Password hash| `Bun.password` (bcrypt, cost ≥ 12)        |
| OTP hash     | HMAC-SHA256 with `OTP_SECRET` salt        |
| Linter       | Biome                                     |
| Tests        | `bun test` (unit + e2e)                   |

---

## Project layout

```
.
├── src/
│   ├── index.ts                 # entrypoint — boots Express on PORT
│   ├── app.ts                   # buildApp() — testable Express factory
│   ├── drizzle.config.ts        # drizzle-kit config
│   ├── config/env.ts            # zod-validated env config
│   ├── db/
│   │   ├── index.ts             # postgres-js + drizzle connection
│   │   ├── schema.ts            # users / otps / revoked_tokens tables
│   │   └── migrate.ts           # `bun run db:migrate`
│   ├── routes/                  # Express routers (mounted at /api/v1)
│   ├── controllers/             # HTTP handlers (thin)
│   ├── services/                # auth, otp, jwt, password, email
│   ├── middleware/              # validate, requireAuth, errorHandler
│   ├── validators/              # zod schemas (one per route body)
│   └── utils/                   # AppError, response builders
├── tests/
│   ├── unit/                    # pure-logic tests (no DB)
│   ├── e2e/                     # end-to-end via fetch + Postgres
│   └── helpers/                 # test env + db setup utilities
├── docs/README.md               # this file
├── biome.json                   # linter/formatter config
├── .env.example                 # copy to .env and fill in
├── package.json
└── tsconfig.json
```

---

## Getting started

### 1. Install Bun and dependencies

```bash
curl -fsSL https://bun.sh/install | bash   # if Bun isn't installed yet
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, JWT_SECRET, OTP_SECRET.
```

`.env` is loaded by Bun automatically — no `dotenv` package needed.

### 3. Start PostgreSQL

Any Postgres 14+ instance is fine. For local dev:

```bash
docker run -d --name upsccompass-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=upsccompass \
  -p 5432:5432 \
  postgres:16
```

### 4. Create the schema

Generate and apply the initial migration:

```bash
bun run db:generate    # writes ./drizzle/<timestamp>_*.sql
bun run db:migrate     # applies to DATABASE_URL
```

Or, for fast local iteration, skip migration files entirely:

```bash
bun run db:push        # syncs schema directly (NOT for production)
```

### 5. Run the server

```bash
bun run dev            # hot reload via bun --hot
# or
bun run start          # production mode
```

The server logs:

```
upsccompass-auth-api listening on http://localhost:3000 [development]
API base path: /api/v1
```

### 6. Smoke test

```bash
curl -s http://localhost:3000/api/v1/health
# → {"status":1,"service":"upsccompass-auth-api","time":"..."}
```

---

## API reference (summary)

All routes are mounted under `/api/v1`. All requests and responses are JSON (`Content-Type: application/json`). The detailed contract lives in `AUTH_API.md`; this section summarises endpoint shapes.

### Standard error response

```json
{
  "status": 0,
  "error": {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "An account with this email already exists.",
    "fields": { "email": "Already registered" }
  }
}
```

### `POST /api/v1/auth/register`

Register a new user and email them a 6-digit OTP. The user is created but **not** verified until the OTP is confirmed.

Request body:
```json
{ "name": "Rajat", "phone": "9876543210", "city": "Delhi", "email": "rajat@example.com", "password": "secret1" }
```

| Status | When                                         |
|--------|----------------------------------------------|
| 201    | `{ "status": 1, "message": "OTP sent to email" }` |
| 409    | `EMAIL_ALREADY_EXISTS`                       |
| 422    | `VALIDATION_FAILED` with `fields.{name,phone,city,email,password}` |

### `POST /api/v1/auth/verify-otp`

Confirm the OTP and receive a JWT. Marks `is_email_verified = true` on success.

Request body:
```json
{ "email": "rajat@example.com", "otp": "123456" }
```

| Status | When                                         |
|--------|----------------------------------------------|
| 200    | `{ "status": 1, "token": "<jwt>", "user": { ... } }` |
| 400    | `INVALID_OTP` / `OTP_EXPIRED` / `OTP_ATTEMPTS_EXCEEDED` |
| 404    | `EMAIL_NOT_REGISTERED`                       |

### `POST /api/v1/auth/resend-otp`

Issue a fresh OTP for an existing user.

Request body:
```json
{ "email": "rajat@example.com" }
```

| Status | When                                         |
|--------|----------------------------------------------|
| 200    | `{ "status": 1, "message": "OTP resent" }`   |
| 404    | `EMAIL_NOT_REGISTERED`                       |
| 429    | `OTP_RATE_LIMITED` — max 3 resends per 10 minutes per email |

### `POST /api/v1/auth/login`

Email + password login. Requires the user to have already verified their email.

Request body:
```json
{ "email": "rajat@example.com", "password": "secret1" }
```

| Status | When                                         |
|--------|----------------------------------------------|
| 200    | `{ "status": 1, "token": "<jwt>", "user": { ... } }` |
| 401    | `INVALID_CREDENTIALS`                        |
| 403    | `EMAIL_NOT_VERIFIED`                         |

### `POST /api/v1/auth/logout`

Revoke the current JWT by storing its `jti` in `revoked_tokens`. The token's signature stays valid until expiry, but subsequent requests through `requireAuth` are rejected with `TOKEN_REVOKED`.

Headers: `Authorization: Bearer <token>`

| Status | When                                         |
|--------|----------------------------------------------|
| 200    | `{ "status": 1 }`                            |
| 401    | `UNAUTHORIZED` / `TOKEN_EXPIRED` / `TOKEN_REVOKED` |

### `GET /api/v1/health`

Liveness probe. Returns `{ "status": 1, "service": "...", "time": "..." }`.

---

## Data model

### `users`

| Column            | Type           | Notes                                   |
|-------------------|----------------|-----------------------------------------|
| `id`              | `uuid`         | PK, default `gen_random_uuid()`         |
| `name`            | `text`         |                                         |
| `phone`           | `varchar(10)`  | exactly 10 digits                       |
| `city`            | `text`         |                                         |
| `email`           | `varchar(255)` | stored lowercase, unique                |
| `password_hash`   | `text`         | bcrypt (cost = `BCRYPT_COST`)           |
| `is_email_verified` | `boolean`    | default `false`                         |
| `created_at`      | `timestamptz`  | default `now()`                         |

### `otps`

| Column            | Type           | Notes                                   |
|-------------------|----------------|-----------------------------------------|
| `id`              | `uuid`         | PK                                      |
| `email`           | `varchar(255)` | indexed                                 |
| `code_hash`       | `text`         | `HMAC-SHA256(OTP_SECRET, email:code)`   |
| `expires_at`      | `timestamptz`  | `now() + OTP_EXPIRY_MINUTES`            |
| `verify_attempts` | `integer`      | locked out at `OTP_MAX_VERIFY_ATTEMPTS` |
| `consumed`        | `boolean`      | `true` after successful verification    |
| `created_at`      | `timestamptz`  | indexed (used for resend rate limit)    |

Only the most recently issued, non-consumed OTP per email is considered active during verification.

### `revoked_tokens`

| Column        | Type           | Notes                                       |
|---------------|----------------|---------------------------------------------|
| `jti`         | `varchar(64)`  | PK — JWT ID claim of the revoked token      |
| `expires_at`  | `timestamptz`  | original token expiry — used for sweeping   |
| `revoked_at`  | `timestamptz`  | when the row was inserted                   |

A periodic job can `DELETE FROM revoked_tokens WHERE expires_at < now()` to keep this table small.

---

## Environment variables

See `.env.example` for the full list. Highlights:

| Variable                    | Default       | Purpose                                            |
|-----------------------------|---------------|----------------------------------------------------|
| `PORT`                      | `3000`        | HTTP listen port                                   |
| `DATABASE_URL`              | —             | Postgres connection string                         |
| `TEST_DATABASE_URL`         | —             | Separate Postgres for the e2e suite                |
| `JWT_SECRET`                | —             | ≥ 32 chars; HS256 signing key                      |
| `JWT_EXPIRES_IN`            | `7d`          | Token TTL (any `jsonwebtoken` duration)            |
| `OTP_SECRET`                | —             | HMAC key for hashing OTP codes at rest             |
| `OTP_EXPIRY_MINUTES`        | `10`          | How long a freshly issued OTP is valid             |
| `OTP_MAX_VERIFY_ATTEMPTS`   | `3`           | Lock the OTP after this many wrong tries           |
| `OTP_RESEND_WINDOW_MINUTES` | `10`          | Window for resend rate limiting                    |
| `OTP_RESEND_MAX_PER_WINDOW` | `3`           | Max resends per email per window                   |
| `BCRYPT_COST`               | `12`          | Password hash cost                                 |
| `EMAIL_PROVIDER`            | `console`     | `console` (dev) or `smtp` (real email)             |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` | — | Required when `EMAIL_PROVIDER=smtp` (see Email section below) |

---

## Email delivery

The OTP email is sent through an `EmailProvider` interface ([src/services/email.service.ts](../src/services/email.service.ts)).

Two providers ship with the app:

- **`console`** *(default)*: logs the email to stdout. Good for local dev — read the OTP in your terminal.
- **`smtp`**: real SMTP via [nodemailer](https://nodemailer.com). Works with Gmail (using a 16-char App Password), Mailgun, Postmark, Amazon SES SMTP, your own MTA — anything that speaks SMTP.

### Using Gmail with an App Password

1. Turn on **2-Step Verification** on the sending Google account (Google won't issue app passwords without it).
2. Generate a 16-character app password at <https://myaccount.google.com/apppasswords>. Pick "Mail" + "Other (Custom name)" and copy the password — Google shows it once.
3. Fill in `.env`:

   ```env
   EMAIL_PROVIDER=smtp
   EMAIL_FROM=your.address@gmail.com
   EMAIL_FROM_NAME=Dextora UPSC Compass

   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your.address@gmail.com
   SMTP_PASSWORD=abcdabcdabcdabcd   # the 16-char app password, no spaces
   ```

4. Restart the server. Registration / resend emails now land in the user's inbox.

Notes:
- Gmail's free SMTP caps you at ~500 recipients/day. For real production volume, use a dedicated provider (SES, Postmark, Mailgun) — the same SMTP settings format applies.
- Port `587` uses STARTTLS (`SMTP_SECURE=false`) — the connection starts plaintext and upgrades to TLS. Port `465` uses implicit TLS (`SMTP_SECURE=true`). Either works with Gmail; 587 is the modern default. If you leave `SMTP_SECURE` unset, the app defaults it to `true` for port 465 and `false` otherwise.
- For any non-Gmail provider, swap `SMTP_HOST` / `SMTP_PORT` / credentials — no code changes needed.

Tests inject their own provider via `setEmailProvider()` to capture the OTP code without hitting the network.

---

## Security notes

- **Passwords**: hashed with bcrypt (`Bun.password`). Plain-text password is only seen in-process during the request. Configure `BCRYPT_COST` ≥ 12 in production.
- **OTPs**: stored as `HMAC-SHA256(OTP_SECRET, email:code)`. An attacker with read access to the DB cannot enumerate codes without also stealing `OTP_SECRET`. Constant-time comparison via `timingSafeEqual`.
- **JWTs**: HS256, with `iss`, `sub`, `email`, `jti`, `iat`, `exp` claims. `jti` enables logout/revocation.
- **CORS**: configured via `CORS_ORIGINS` (comma-separated). Use a specific origin list in production — not `*`.
- **Rate limiting**: implemented per-email at the OTP layer. For broader IP-level rate limiting (e.g., on `/login`), add a reverse-proxy layer (nginx, Cloudflare) or an Express middleware.
- **TLS**: terminate TLS at your reverse proxy or load balancer. The app assumes HTTPS upstream.

---

## Scripts

| Command              | What it does                                          |
|----------------------|-------------------------------------------------------|
| `bun run dev`        | Hot-reloading dev server                              |
| `bun run start`      | Production server                                     |
| `bun run build`      | Bundle to `./dist`                                    |
| `bun test`           | Run all tests (unit + e2e)                            |
| `bun run test:unit`  | Unit tests only (no DB required)                      |
| `bun run test:e2e`   | E2E tests (require `TEST_DATABASE_URL`)               |
| `bun run db:generate`| Generate Drizzle SQL migration from `schema.ts`       |
| `bun run db:migrate` | Apply pending migrations                              |
| `bun run db:push`    | Push schema directly (dev only)                       |
| `bun run db:studio`  | Open Drizzle Studio                                   |
| `bun run lint`       | Biome check                                           |
| `bun run lint:fix`   | Biome check + autofix                                 |
| `bun run format`     | Biome formatter                                       |

---

## Testing

### Unit tests

Pure-logic, no DB:

```bash
bun run test:unit
```

Covers: password hashing, JWT sign/verify, OTP hashing determinism, zod validators, `AppError` factories.

### E2E tests

Spin up the Express app against a **real** Postgres at `TEST_DATABASE_URL`. The suite:

1. Drops & recreates the schema in `beforeAll`.
2. Truncates tables in `afterEach`.
3. Replaces the email provider with an in-memory stub that captures the OTP code.
4. Drives every endpoint via `fetch`.

```bash
# 1. Start a Postgres dedicated to tests:
docker run -d --name upsccompass-pg-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=upsccompass_test \
  -p 5433:5432 postgres:16

# 2. Point TEST_DATABASE_URL at it:
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/upsccompass_test

# 3. Run:
bun run test:e2e
```

If `TEST_DATABASE_URL` is unset / unreachable, the e2e tests are **skipped** (not failed) with a warning, so unit tests stay runnable on machines without Postgres.

---

## Flutter integration (mapping to the existing `AuthService`)

| Flutter method (`lib/utils/services/auth_service.dart`) | HTTP call                  |
|---------------------------------------------------------|----------------------------|
| `registerUser()`                                        | `POST /api/v1/auth/register` |
| `generateAndStoreOtp()`                                 | *Removed* — backend issues the OTP automatically on register / resend |
| `verifyOtp()`                                           | `POST /api/v1/auth/verify-otp` → store `token` in `get_storage` |
| `verifyPassword()` (login)                              | `POST /api/v1/auth/login`    |
| `markLoggedIn()`                                        | local-only, after token receipt |
| `logout()`                                              | `POST /api/v1/auth/logout` then clear local token |

The JWT returned by `verify-otp` / `login` should be sent as `Authorization: Bearer <token>` on every protected request.

---

## Deployment notes

- Run behind a TLS-terminating reverse proxy.
- Set `NODE_ENV=production` to suppress verbose error messages.
- Set `BCRYPT_COST=12` (or higher — measure latency).
- Use strong, random `JWT_SECRET` and `OTP_SECRET` (≥ 64 hex chars). Generate with `openssl rand -hex 64`.
- Restrict `CORS_ORIGINS` to your real app origins.
- Schedule `DELETE FROM revoked_tokens WHERE expires_at < now();` and `DELETE FROM otps WHERE expires_at < now() - interval '1 day';` as a daily cron.
- Set `EMAIL_PROVIDER=smtp` with production SMTP credentials before going live (Gmail is fine for low volume; switch to SES/Postmark/Mailgun for production scale).
