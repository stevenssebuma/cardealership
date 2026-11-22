# PostgreSQL operations (TSK-022)

From `backend/`, install with `npm ci`. PostgreSQL is the only runtime
persistence engine. Use a dedicated database, not an existing live database.
For local development set `NODE_ENV=development`, `DATABASE_URL` to a database
named e.g. `cardealership_dev`, and a private `JWT_SECRET`. Tests instead
require `NODE_ENV=test` and `TEST_DATABASE_URL` with a distinct test database.
For hosted staging, set `NODE_ENV=staging` and `STAGING_DATABASE_NAME`
to the exact dedicated staging database name in DATABASE_URL.
Configure `CORS_ALLOWED_ORIGINS` with exact comma-separated frontend origins
(without trailing slashes); no wildcard. Production and staging default to
no browser origins unless explicitly configured. See the migration plan for
TLS and pool configuration. Never commit environment values or secrets.

## Explicit initialization and diagnostics

The database must already exist. The application never creates or seeds a
database at startup. The commands below are for a fresh local development
database; replace the confirmation name with your exact dedicated target.

```bash
npm run db:test
npm run db:init -- --confirm cardealership_dev
npm run db:check
npm run db:indexes
npm start
```

- `db:test` checks connectivity only; `db:check` reports schema readiness and
  counts for the eight canonical tables, without customer rows.
- `db:init` executes the canonical `scripts/schema.sql` only on an empty
  public schema, under an advisory lock. It returns ALREADY_INITIALIZED
  on a ready schema; a nonempty incomplete database fails closed. This is
  **not** an upgrade or an authorization to run DDL on production.
- `db:indexes` verifies valid/ready canonical index names. It does not
  repair them or perform DDL. Any repair requires an approved migration.
- `GET /api/health` is process liveness. `GET /api/ready` returns 200 only
  when required tables, columns, table privileges and explicit indexes
  exist, otherwise 503. Neither endpoint changes the database. A readiness
  result does not certify data quality, schema type/constraint equivalence
  or existing-database migration safety.

## Synthetic fixtures and staging administrator

```bash
npm run db:seed -- --confirm cardealership_dev
npm run db:admin -- --confirm cardealership_dev
```

Provide ADMIN_EMAIL and ADMIN_PASSWORD through a secure environment
mechanism before the second command (minimum 12 characters, maximum 72
UTF-8 bytes); ADMIN_NAME is optional. Never put credentials in shell
history, command arguments, logs or source. The command creates a missing
administrator or rotates only an existing admin's password; it refuses
to promote another account. The seed adds a visibly synthetic user, two
cars, specifications and one booking in one transaction. The user's
random password is discarded, so there is no shared fixture credential.
Reruns are idempotent and refuse unrelated identity collisions.

All three mutation commands require an explicit non-production NODE_ENV,
a database name containing a dev/test/stage token with no prod/live token,
and exact `--confirm` matching the database URL and PostgreSQL session.
These guards do not replace access isolation: use separate credentials
and databases, and verify the deployment target before running them.
The server drains the exchange worker, HTTP and database pool on SIGTERM
or SIGINT, with a bounded shutdown deadline.

## Existing legacy data

Do not use db:init to overwrite or upgrade an existing installation.
See [the data transfer and recovery runbook](POSTGRESQL-MIGRATION-RUNBOOK.md)
for read-only snapshot exports, checksum verification, dry-run imports,
sequence reconciliation and controlled recovery.

## Render staging handoff

Do not provision or deploy to a live service under this task. After the
existing-database migration rehearsal and integration review, use an
isolated Render PostgreSQL database and manually deployed web service with
staging-only secrets and origins; check the current plan and costs first.
Use `backend/` as the service root, `npm ci` as build, `npm start` as
start, and `/api/ready` for readiness. Bootstrap the dedicated staging
database explicitly before deploying or selecting the readiness path.
Validate with synthetic data before any frontend staging integration.
See [Render staging setup](RENDER-STAGING.md) for exact configuration,
deployment identity checks and the guarded HTTP smoke command.
