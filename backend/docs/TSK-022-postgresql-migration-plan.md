# TSK-022 — PostgreSQL consolidation: migration plan

## 1. Baseline and scope

The verified integration baseline is `stevenssebuma/cardealership:main` at
`cc24e5178028d376e9a3a3514b4851e9b34be147`. The designated contributor branch
is `feature/edwin-sprint17-postgresql-consolidation` in
`ADBranches/cardealership`. The local branch currently has no implementation
commits; all eventual changes belong in one reviewed pull request. Cloud
execution and a disposable PostgreSQL database are the verification targets.
GitHub Actions must not be dispatched or relied on for acceptance evidence.

P1 evidence: 135 exported files matched the corresponding committed Git blob
hashes from the complete upstream tree; three dependency-free route contract
tests passed. A syntax sweep of 123 backend JavaScript files found nine inherited
exchange-rate syntax failures. A static relative-import traversal from the
canonical server identified 30 reachable JavaScript modules; dynamic imports
and runtime behavior still require verification.

## 2. Dependency graph and present state

| Entry point or domain | Persistence edge | Migration impact |
| --- | --- | --- |
| Auth routes | authController, authMiddleware → config/db.js | Users, hashed passwords, unique email, role checks |
| Cars and image routes | carsController, carImageService, bulkCarImageRepository → carsModel → config/db.js | Cars, one-to-one specifications, images, rollback-safe writes |
| Booking routes | bookingController, availabilityService → config/db.js | Booking states, slot constraints, concurrent requests |
| Admin routes | adminController → config/db.js | Aggregate and date SQL, filtering, state changes, reporting |
| Financing and cleanup | financingLeadRepository, staleCarMediaService → config/db.js | Existing PostgreSQL-oriented SQL; currently unmounted on main |
| Exchange rates | exchangeRateRepository → config/db.js plus obsolete MongoDB implementation | PR #58 must be coordinated; timestamps and JSON snapshots |
| Old vehicle/image/user models | Mongoose models and CJS repositories, references from legacy tests and middleware | Confirm no live callers; migrate or retire and test |
| Analytics/reporting/optimized routes | config/database.js (in-memory sample data) | Unmounted on main, but PR #55 mounts optimized and metrics routes |
| Operational scripts | check-db.js, seed.js, reset-admin.js, test-db.js, ensureCarSearchIndexes.js | Replace SQLite-only diagnostics and ensure safe, explicit database targeting |

Only PostgreSQL should remain the application's persistent database. Do not
maintain the in-memory sample store as an alternate production data source.
Preserve API paths, response shapes, authorization, and externally stored media
references; image binary storage is outside the database-consolidation scope.

## 3. Integration dependency and overlap decision

Open PR #55 (`Devine-codes`, head
`3bde5fc608cb819d549175c381166780142d4e58`) already implements a pg Pool,
transaction helper, a runtime-created partial schema, and PostgreSQL-based car
transactions. It removes SQLite and Mongoose package declarations but retains
the old model files and the in-memory database. Its admin controller and seed
still contain SQLite-style positional placeholders, the admin controller uses
SQLite date functions, check-db.js still queries sqlite_master, and
backend/scripts/schema.sql is absent. The expanded server mounts
optimizedRoutes and adminMetricsRoutes which still rely on the in-memory store.
Thus the consolidation is incomplete even in PR #55.

Open PR #52 (API tests) contains a PostgreSQL pool and TEST_DATABASE_URL
isolation, but targets an older baseline and has merge conflicts. PR #56
changes car and admin behavior and removes a Mongoose User model. PR #57 changes
package manifests, lockfiles and the legacy database configuration. PR #58
repairs exchange-rate syntax and removes its MongoDB model, but its persistence
and schema introspection remain SQLite-specific. Review these PRs' final merged
contents before applying overlapping changes.

**Recommended integration gate:** ask the integration lead to review and
integrate PR #55, or explicitly allocate its overlapping database changes to
TSK-022. Revalidate upstream and fast-forward the existing empty Sprint 17
branch only after that decision. If the branch remains based on the current
main, do not silently incorporate unapproved teammate changes or open a
competing adapter rewrite. Coordinate PR #58 and any other overlapping work at
the same gate.

## 4. Implementation sequence after integration decision

1. **Schema (P2):** derive a canonical schema from the accepted source and
   existing migration files. Include users, cars, car_specs, car_images,
   bookings, financing leads and exchange-rate snapshots, and any accepted
   session or security tables. Preserve actual column contracts and foreign
   keys. Reconcile `brand`/ `make`, `is_available`, status values and existing
   migrations. Preserve the partial unique booking-slot index and verify fresh
   install and upgrades separately; do not blindly rerun non-idempotent
   historical DDL.
2. **Adapter (P3):** one configurable pg Pool and native `query(text, params)`
   result contract; require explicit connection settings. Use TLS verification
   for managed databases, a validated test-only connection, safe error messages,
   bounded connection settings and graceful close. Execute each transaction on
   one acquired client, always rolling back and releasing on errors. Do not
   route BEGIN/COMMIT through independent pool queries.
3. **Consumers (P4):** migrate anonymous SQLite placeholders to explicitly
   numbered PostgreSQL parameters; change SQLite JSON aggregation and date
   arithmetic to native PostgreSQL equivalents. Normalize result types at API
   boundaries (counts, numeric money, date/timestamps, JSON arrays). Replace
   stale Mongoose and fake collection consumers with PostgreSQL repositories or
   remove proven-unused code and its tests as appropriate. Preserve existing
   authorization and avoid mounting unrelated endpoints as a side effect.
4. **Operations (P5):** provide canonical `backend/scripts/schema.sql`,
   PostgreSQL-compatible `backend/scripts/seed.js` and read-only catalog
   diagnostics; keep compatible entry points where needed. Seed only explicitly
   selected non-production targets with synthetic data and no fixed secrets.
   Align index maintenance and package lockfiles.
5. **Migration rehearsal (P6):** inventory existing database schema and record
   counts only in a separately approved environment. Back up the source using
   its native tool, stage data in an isolated target, convert timestamps and JSON
   deliberately, preserve identifiers and relationships, import parent before
   child records, reconcile duplicates, reseed sequences, and verify counts,
   constraints and representative queries. Migrate Mongo data only if actual
   data and an approved source exist. Never copy production records into logs.
6. **Regression (P7):** run syntax, unit, contract, and real PostgreSQL
   integration tests. Include auth roles, CRUD, image metadata, booking
   contention/cancellation, rollback, analytics, financing, exchange-rate
   persistence, schema repeatability, diagnostic read-only behavior, and
   post-migration sequence correctness. Distinguish inherited failures from new
   failures; do not claim a passing database gate without a running disposable
   PostgreSQL instance.
7. **Handoff (P8):** publish only the verified branch and a single PR to upstream
   main with the migration plan, validation commands, exact test results, known
   limitations, schema/rollback instructions and integration conflicts. The
   integration lead reviews and merges; deployment and production data migration
   require a separate approval.

## 5. Acceptance and rollback

- Fresh database initialization, repeat-safe migration, and upgrade rehearsal
  preserve all expected records, relationships, constraints and indexes.
- Every active persistent query uses PostgreSQL; no runtime SQLite, MongoDB,
  or fake in-memory persistence remains.
- Critical endpoint and transactional behavior is unchanged, except documented
  corrections agreed with integration owners.
- PostgreSQL diagnostics do not return credentials or personal record contents.
- All new tests pass on a disposable database and no unexplained regression
  remains. Existing failures are individually documented and reconciled.
- No production writes or deployments in this sprint's development workflow.
  For any eventual production cutover, verify backups and restore in a
  separately approved rehearsal; retain the original datastore until validation
  is complete and plan reconciliation of any writes after cutover.

## 6. P2 fresh-schema implementation and evidence

The non-overlapping fresh-schema work has proceeded on the verified baseline
while PR coordination remains pending. The canonical SQL bootstrap is
`backend/scripts/schema.sql`; executable checks are
`backend/tests/fixtures/postgresqlSchemaAssertions.sql` and
`backend/tests/postgresqlSchemaEngine.manual.js`.

Cloud engine: PostgreSQL 18.7 via PGlite 0.5.17 (isolated, in-memory WASM).
The PostgreSQL driver, a native network server, production upgrade, and pooled
transaction behavior are not claimed as verified by this gate.

| P2 check | Result |
| --- | --- |
| Fresh DDL creates exactly seven canonical tables | PASS |
| Constraints, relationships, booking slot reuse, financing and JSONB | PASS |
| Synthetic fixture rollback leaves all seven tables empty | PASS |
| Repeat bootstrap preserves an existing synthetic row | PASS |
| Required indexes exist | PASS |

Run the engine harness with an explicitly installed standalone PGlite module
using `S17_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node backend/tests/postgresqlSchemaEngine.manual.js`.
The SQL fixture can also run with `psql -v ON_ERROR_STOP=1 -f ...` against a
separately created, verified disposable database; never execute it against
production. The existing financing migrations were consolidated into the fresh
schema; the historical inventory migration that renames brand to make must
not be replayed on this bootstrap. Existing database upgrades and sequence
reconciliation are P6 responsibilities.

P2 fresh-schema gate: 5/5 passed. No remote writes, GitHub Actions, or
production database connections occurred. Integration review remains required
for overlapping adapter and feature changes, including any session/security
tables introduced by an accepted PR #55.

## 7. P3 adapter implementation and native verification

The shared `backend/config/db.js` now lazily constructs a native pg Pool
using `databasePoolConfig.js`. It preserves `query(text, params)` and the
native rows/rowCount result, with no SQLite translation or import-time DDL.
The transaction helper checks out one connection, commits or rolls back,
rejects silently aborted transactions, invalidates an escaped transaction
scope, and discards clients whose rollback failed. Extended-query protocol
rejects multiple statements through the ordinary query interface. The health
probe and close operation are available for startup/shutdown integration.

Configuration:

- `DATABASE_URL` — explicitly supplied non-test URL.
- `TEST_DATABASE_URL` — mandatory in NODE_ENV=test and must identify a
  dedicated test database distinct from the configured non-test target.
- `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`,
  `DB_STATEMENT_TIMEOUT_MS`, `DB_TRANSACTION_IDLE_TIMEOUT_MS` — bounded numeric
  pool/timeout configuration.
- Ordinary non-loopback connections require certificate-verified TLS. Local
  loopback can disable TLS. The explicit `DATABASE_NETWORK=render-private`
  exception is available only inside a Render service (RENDER=true) with a
  single-label private hostname. It requires encryption but accepts Render's
  documented self-signed private certificate; it is not a verified external
  TLS mode and cannot be used for public hostnames. Prefer standard verified
  TLS wherever a trusted certificate is available.

P3 executed in a disposable native PostgreSQL 18.7 cluster bound to loopback
TCP only, using the repository lockfile's pg 8.23.1. The test runner created
a fresh database; no production credentials, URLs or data were accessed.

| Verification gate | Result |
| --- | --- |
| Configuration and adapter unit tests | 10/10 |
| Native PostgreSQL integration (parent plus six subtests) | 7/7 |
| Baseline static route and health contracts | 3/3 |
| Combined Node test count | 20/20, no failures or skips |
| Disposable server shutdown | Confirmed |

P4 must port the existing anonymous placeholders, SQLite date/JSON functions,
and pool-level BEGIN/COMMIT consumers before launching the entire application.
Do not deploy the current intermediate tree. P2 bootstrap and assertions also
ran successfully on the native PostgreSQL engine during P3.

## 8. P4A mounted API consumers and native HTTP gate

The four routers mounted by the audited upstream `server.js` now use the
canonical pool: authentication, inventory, bookings and administration.
The migration replaces SQLite placeholders, date expressions and JSON
aggregation with PostgreSQL syntax and binds all user-supplied values. API
mapping keeps vehicle prices/counts numeric, booking dates date-only, and
`make`/`brand` compatible.

- Booking creation serializes per-user limit checks via a row lock and
  relies on the partial unique slot index to resolve cross-user races.
- Multi-table inventory writes use one checked-out transaction; a restricted
  deletion rolls back changes to images and specifications as well.
- Duplicate VIN and booking conflicts return HTTP 409; vehicle error responses
  do not expose database exception details.
- The legacy SQLite car-spec test now uses PostgreSQL catalog queries. The
  stale inventory validation fixture was aligned with the already-existing
  required fields without changing the validator.

Executed against freshly initialized, disposable native PostgreSQL 18.7
databases with the actual Express server and synthetic records:

| Verification gate | Result |
| --- | --- |
| Live HTTP core API (parent plus six subtests) | 7/7 |
| PostgreSQL car-spec persistence contract | 1/1 |
| Adapter/configuration, native transactions, route contracts, payload fixture | 23/23 |
| Total reported Node tests | 31/31, zero failures or skips |
| Two simultaneous reservations for the same slot | HTTP 201 + HTTP 409 |
| Restricted vehicle deletion | HTTP 409, images/specs retained |
| PostgreSQL service shutdown | Confirmed |

P4A passes for the mounted core API; P4B is still open. Dormant MongoDB
repositories, alternate in-memory routes, exchange-rate persistence and
legacy scripts have not yet been consolidated. The existing server health
route is liveness only; database readiness and staging deployment remain
separate gates. Do not deploy this intermediate tree or claim full TSK-022
completion based on P4A evidence alone.

## 9. P4B1 exchange rates and obsolete Mongoose graph

PR #58 remained open at head `1b69dec255de39459a2f4d106a6c54f25bd25622`
when P4B1 began. The backend-only exchange-rate implementation was recovered
from that exact contributor commit, preserving its request guard, provider
validation, explicit production opt-in, cache deadlines, fallback/backoff, and
worker lifecycle. It was adapted to native JSONB and TIMESTAMPTZ, BIGINT
identity and parameterized SQL; `scripts/schema.sql` alone owns DDL. No
SQLite compatibility translation or request-time schema creation remains in
the exchange-rate repository. The read-only route and worker are integrated
in the server. The storefront changes from PR #58 were not copied; that PR
still requires integration-lead coordination.

The retired MongoDB User, Vehicle, VehicleImage and ExchangeRateSnapshot
models and old vehicle/image repositories had no mounted runtime consumers.
The redundant CommonJS car router and claim-only authorization middleware
were retired in favour of the already-mounted canonical route with
database-backed authentication. Tests were redirected to the actual canonical
route and PostgreSQL repository contracts. The local image storage unit tests
were retained and ported to ESM; binary media storage remains independent of
the relational database.

| Verification gate | Result |
| --- | --- |
| Exchange-rate service/provider/guard/repository/worker/HTTP tests | 62/62 |
| Canonical bulk-image, authentication and repository tests | 22/22 |
| Existing core adapter, static contracts and payload validation | 23/23 |
| Actual API and native PostgreSQL exchange-rate persistence | 9/9 |
| PostgreSQL car-spec persistence | 1/1 |
| Total reported Node tests | 117/117, zero failures or skips |
| Backend JavaScript syntax sweep | 130/130 (nine inherited syntax failures repaired) |

The native test used synthetic exchange rates in NODE_ENV=test, never a live
provider or production database. It verified JSONB retrieval, observation
timestamps, deterministic ordering under equal timestamps, exclusion of
future and expired rows, HTTP cache reuse, image metadata and persistence-based
RBAC (a previously issued admin token is denied after database demotion).
The native PostgreSQL cluster was shut down after testing. Package declarations
for Mongoose and SQLite are still present pending P5 lockfile cleanup.

P4B2 remains open: five direct consumers of `config/database.js` (optimized
routes, metrics routes/controller, reports and spotlight) and the alternate
Mongo-style query optimizer/index configuration must be reconciled. Do not
import fictional users, sales, bookings or search logs from the sample store.
Where no authoritative data producer exists, explicitly identify unavailable
metrics instead of manufacturing production activity. Existing unmounted paths
remain unmounted until their security, functionality and integration scope
are verified. No remote writes, Actions, upstream merges or deployments have
occurred.

## 10. P4B2 remaining in-memory consumers and native verification

The simulated `config/database.js` and its sample users, cars, bookings, sales
and search history were removed. All five former consumers, the query
optimizer and the index utility now use the canonical PostgreSQL adapter or
typed repositories backed by it. A source sweep found no old collection API
or `config/database.js` imports. No fictional records were imported.

The optimized inventory search uses bound filters, an allowlisted sort,
bounded pagination, an exact count even on an empty page, and public listing
status filtering. Optional transmission and fuel-type fields are persisted
through the canonical inventory API; unknown values remain NULL. The
availability endpoint uses the active booking constraint and does not
disclose another customer's identity. Admin metrics and inventory PDF/JSON
reports read real rows; revenue and search-event metrics explicitly report
unavailable data with a reason, because no authoritative source exists on
the audited baseline. Listing prices are not presented as completed sales.

Spotlight management now uses the eighth canonical table,
`vehicle_spotlights`, with a unique foreign key to each car, score/tier
constraints, durable read state and an atomic, idempotent upsert under a row
lock. It re-reads authoritative vehicle data, rather than trusting webhook
payload values. The report, metrics and spotlight routers (including the
formerly public webhook) require database-backed administrator authorization.
The index utility checks valid/ready PostgreSQL catalog entries and fails
closed if a required index is missing. The query profiler is bounded,
process-local telemetry, not a persistence layer, and retains no parameters.

| Verification gate | Result |
| --- | --- |
| Native analytics/reporting/spotlight HTTP suite | 7/7 |
| Filter validation, index and query telemetry unit tests | 5/5 |
| Previous P4B1 regression gate including native core API | 117/117 |
| Combined reported Node tests | 129/129, zero failures or skips |
| PostgreSQL schema engine checks (eight tables) | 5/5 |

Tests used a disposable native PostgreSQL cluster, an isolated HTTP harness
with the actual four previously unmounted routers, and the existing canonical
server separately. Verified empty fresh bootstrap, real filter persistence,
parameter binding, pagination and injection rejection, booking-month bounds,
admin authorization, actual PDF bytes, no fabricated revenue, concurrent
spotlight deduplication, read state across new service instances, and exclusion
of sold vehicles from the featured list. The four verified dormant routers
remain unmounted in the canonical server pending integration review; this
phase does not enable independent team features or publish new endpoints.

P4 runtime persistence consolidation is verified. P5 results follow.

## 10. P5 operational consolidation (verified)

- One canonical connection policy for diagnostics, explicit bootstrap, seed,
  index verification and administrator provisioning.
- Fresh-schema bootstrap refuses a nonempty incomplete schema and all
  production/unspecified environments; seed and admin operations demand the
  exact confirmed non-production target, verified inside the session.
- Seed uses only clearly marked synthetic fixtures and a discarded random
  password hash. Admin provisioning accepts explicit environment credentials,
  never resets a non-admin account, and never prints credentials.
- Readiness checks eight tables, required columns, table permissions and all
  23 explicit schema indexes. Liveness is independent of database availability.
  The API fails startup on invalid configuration and drains worker/pool on
  SIGTERM or SIGINT. Browser CORS uses an explicit origin allowlist.
- Removed better-sqlite3 and mongoose from manifest and npm lock; the clean
  install and PostgreSQL/sharp imports passed with the retained pg 8.23.1.

| Verification gate | Result |
| --- | --- |
| New native PostgreSQL operational and readiness tests | 8/8 |
| Full previous targeted regression, rerun with clean npm ci dependencies | 129/129 |
| Combined Node tests | 137/137, zero failures or skips |
| JavaScript syntax scan | 137/137 |
| PostgreSQL schema engine | 5/5 |
| Clean npm ci | Pass (246 packages on this platform) |

The clean install emitted existing multer 1.x and jpeg-exif deprecation
warnings; this consolidation does not certify the unrelated dependencies
as vulnerability-free. Fresh-schema checks used disposable PostgreSQL only,
not the existing Render database. Next gate: P6 existing-database migration
rehearsal, including schema/data compatibility, reconciliation and rollback
against a synthetic legacy fixture. Fresh bootstrap is not an upgrade.
No GitHub Actions, remote writes or production access occurred.

See [PostgreSQL operations](POSTGRESQL-OPERATIONS.md) for commands.

## 11. P6 synthetic migration and recovery rehearsal (verified)

The committed P1 baseline used a SQLite file (`backend/data.sqlite`) via
better-sqlite3, with five core tables and additional PostgreSQL-oriented
financing migrations and MongoDB models. This evidence takes precedence
over the task sheet's description of sql.js. Both SQLite file formats can
be exported from a consistent, approved SQLite backup. The P6 extractor is
offline only and uses Node's built-in SQLite module; it is not an alternate
application persistence engine.

Added `scripts/exportMigrationSnapshot.js`, `scripts/migrationSnapshot.js`
and `scripts/migrateLegacySnapshot.js`. These transfer one approved source
copy, not multiple independently populated databases. They require explicit
UTC interpretation of naive timestamps, reject unmapped tables/columns
and write a private, non-overwritten snapshot with a SHA-256 digest.
The importer validates data and source sequence high-water marks, requires
an explicitly confirmed empty non-production database and defaults to a
transactional dry run. It creates the canonical schema, inserts parents
before dependants, verifies typed rows and counts, restarts identities
transactionally and checks readiness. Explicit apply commits; any failure
rolls back the whole operation. A replay cannot overwrite populated data.

The native PostgreSQL rehearsal exercised the five-table SQLite fixture
and a second PostgreSQL clone containing all eight canonical domains.
Verified source bytes unchanged, bcrypt authentication, foreign keys,
media references, supported status conversion, legacy brand/make mapping,
case-insensitive email collisions, duplicate active bookings, missing
parents, invalid decimal scales, bigint identifiers above JavaScript's safe
integer range, microsecond timestamps, JSONB rates, sequence positions
including deleted source IDs, and rollback of all target DDL. The actual
API authenticated the migrated account, served persisted inventory and
bookings, and rejected unauthorized admin access.

| Verification gate | Result |
| --- | --- |
| Native SQLite/PostgreSQL migration and API recovery suite | 8/8 |
| P5 and earlier targeted regression suite, clean dependencies | 137/137 |
| Combined Node tests | 145/145, zero failures/skips |
| JavaScript syntax scan | 141/141 |
| PostgreSQL schema engine | 5/5 |

The source is synthetic, not an actual Render backup. Native PostgreSQL
dump/restore and the real database's schema/count inventory have not been
executed and require separate approved access. Unknown production schema,
MongoDB data or multiple populated sources must be reconciled explicitly.
This rehearsal is not permission to perform production migration. Full
mapping, backup/restore prerequisites, commands and cutover recovery are
documented in [the migration runbook](POSTGRESQL-MIGRATION-RUNBOOK.md).
No GitHub Actions, remote writes or production connections occurred.

## 12. Hosted staging gate (after local end-to-end readiness)

### P7A — staging release preparation (verified locally)

Staging now requires the exact dedicated database name, and an opt-in
stage-only deployment identity endpoint exposes the commit SHA without DB
details. The guarded HTTP smoke runner defaults to read-only and requires
the expected deployment ID, SHA and confirmed Render HTTPS hostname before
synthetic mutations. It validates liveness, readiness, allowed and denied
CORS, fixture inventory, unauthorized requests, disabled exchange-rate
behavior, registration/login/RBAC, conflicting bookings and cancellation.
Hosted reference-rate smoke is separately selectable.

| Verification | Result |
| --- | --- |
| Native staging HTTP smoke | 4/4 |
| Previous targeted test gate + staging target guard | 146/146 |
| Combined targeted Node tests | 150/150, zero failures/skips |
| Additional safe manual/contract suites | 5/5 |
| JavaScript syntax scan | 143/143 |
| Existing failing suites | 4/4 matching upstream baseline |

The unchanged failing files are `tests/integration/sprint9FailurePaths.test.js`,
`tests/unit/middleware/bulkImageUpload.test.js`,
`tests/unit/services/bulkCarImageUploadService.test.js` and
`tests/unit/utils/validateImageUpload.test.js`. Each fails at its inherited
CommonJS require in an ESM package before running assertions, reproduced
on the exact P1 baseline. The external Cloudinary upload manual test was
not run (no approved external storage target). No new unclassified failures.

Upstream main remains cc24e5178028d376e9a3a3514b4851e9b34be147 and open
overlapping PRs #52, #55–#58 remain pending. The staging release is based on
that exact baseline, not a merge of those PRs. No GitHub Actions were used.

### P7B — hosted acceptance (pending)

See [Render staging setup](RENDER-STAGING.md) for the deployment, bootstrap,
credential isolation and actual hosted smoke commands. Hosted acceptance
requires a real Render URL, matching deployment revision and positive
test evidence. Do not record local tests as hosted results.

As a separate, explicitly approved deployment, provision a Render database
and Node web service in the same region/workspace. Link the existing Sprint 17
feature branch, use manual deploys, and configure only staging credentials,
synthetic fixtures and staging API origins. Never reuse the live database or
production secrets. Use the staging database's internal URL with the explicit
private-network configuration above when appropriate, or verified external
TLS. Check the actual service/DB plan and cost before provisioning. Hosted
health, authorization, inventory, bookings, analytics and browser integration
tests supplement local regression evidence; they do not permit deployment
or merge to production.
