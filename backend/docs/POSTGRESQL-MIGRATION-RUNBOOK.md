# TSK-022 data transfer and recovery runbook

## Scope and preconditions

This runbook transfers an approved, frozen legacy source copy into a new,
isolated PostgreSQL database. It does not upgrade an existing database in
place, connect to the live Render database, or reconcile independently
written SQLite, MongoDB and PostgreSQL records. Integration-owner approval,
source inventory, outage/write-freeze planning and an independently
verified native backup/restore are required before a real cutover.

The P1 source identified the SQLite file `backend/data.sqlite` with users,
cars, car_specs, car_images and bookings, and separate PostgreSQL-oriented
financing migrations and MongoDB models. The migration supports that
five-table relational layout and optional canonical financing, exchange
snapshot and spotlight tables. Unknown tables, columns, schemas or SQLite
views/triggers fail closed. PostgreSQL export reads tables in public only
and rejects additional user-schema relations. It is a data transfer, not
a native backup of PostgreSQL objects, roles, extensions, triggers or
privileges. Inventory those separately. Multiple populated sources,
MongoDB ObjectIds, divergent identity mappings, and an actual source
schema outside this allowlist require a separately reviewed mapping.

Use Node 22.13+ for the offline SQLite extractor (built-in node:sqlite);
the application continues to use PostgreSQL alone. The PostgreSQL clone
export and importer use the same pg connection and safety configuration
as the API. This tool is deliberately bounded to modest snapshots (128 MiB
serialized maximum); plan a streaming migration for larger datasets.

## 1. Freeze, back up and inventory

1. Obtain approval for access to the source and determine authoritative
   data ownership. Record schema, counts, maximum IDs, identity sequence
   states, integrity and required privileges without logging record values.
2. Stop source writes or use a consistent, isolated native backup. For
   SQLite, use the SQLite backup API or the sqlite3 CLI's `.backup`; never
   copy an actively written database file without considering WAL. For
   PostgreSQL use a version-compatible `pg_dump --format=custom` and verify
   a restore with `pg_restore` into a separate disposable clone. Configure
   connection and credentials via the approved environment/PGPASSFILE;
   never paste secrets into commands, tickets, logs or Git.
3. Retain the original backup under access-controlled, encrypted storage.
   Verify the cloned source's completeness, then keep it frozen.
   Do not bring production records into the cloud development workspace.

## 2. Export from the approved copy

Execute from `backend/` using private paths outside the repository. Use
restricted permissions (e.g. umask 077). The snapshot contains sensitive
record data including password hashes, notes and customer contacts; treat
it like a database backup. Do not commit or transmit it in a PR.

For a frozen SQLite copy:

```bash
npm run db:migration:export -- sqlite --source /private/legacy-copy.sqlite --out /private/snapshot.json --assume-utc
```

For a frozen PostgreSQL clone named `cardealership_source_staging`, first
configure NODE_ENV=staging, DATABASE_URL and
STAGING_DATABASE_NAME=cardealership_source_staging for that clone:

```bash
npm run db:migration:export -- postgresql --confirm cardealership_source_staging --out /private/snapshot.json --assume-utc
```

The UTC switch explicitly confirms the source policy for timestamps without
an offset (legacy SQLite CURRENT_TIMESTAMP uses UTC). Do not use it if the
source's timezone is unknown; reconcile that first. Exports are read-only
and use consistent read transactions. The tool checks SQLite integrity and
foreign keys. It writes a new mode-0600 snapshot, never overwriting an
existing file, then prints only a SHA-256 digest and table counts. Record
that digest in the private migration evidence. Keep the clone frozen during
export, including sequence state.

## 3. Validate, dry-run and transfer

Create a separate empty database named e.g. `cardealership_migration_staging`
with a dedicated credential. Switch DATABASE_URL to the new target and
confirm the configured hostname/account independently. Set
STAGING_DATABASE_NAME=cardealership_migration_staging. Do not run db:init:
the importer creates the schema within its own transaction.

Set the shell variable SNAPSHOT_SHA256 to the exact digest reported by the
exporter, then run:

```bash
npm run db:migration:import -- --confirm cardealership_migration_staging --file /private/snapshot.json --sha256 "$SNAPSHOT_SHA256"
```

Without `--apply`, all canonical DDL, typed inserts, constraints, identity
restarts, row-level reconciliation and readiness checks execute and then
roll back. A failure at any step also rolls back. Resolve any conflict
from source evidence, not by bypassing constraints. Repeat the dry run.
Only after successful rehearsal and explicit authorization, add
`--apply` to the identical command for the same digest and target.

Both commands require an explicitly named non-production environment and
database; the importer refuses existing user relations, including an
already migrated database. This prevents accidental replacement and
duplicate rows. Repeat against another fresh target if necessary.

## 4. Mapping and reconciliation

| Domain | Treatment |
| --- | --- |
| Users | Preserve numeric IDs, names, emails, bcrypt hashes and supported roles. Case-insensitive duplicate emails block import; no hidden account promotion. |
| Inventory | Preserve IDs, media references, descriptive fields and decimal values. Fill a missing brand/make from the other; conflicting values require review. Normalize supported status case, derive is_available, and use created_at for missing historical updated_at. |
| Specs, images, bookings | Preserve keys, foreign keys, notes, dates and validated slots. Duplicate active reservations and orphaned parents block import. Cancelled/completed reservations do not reserve slots. |
| Financing | Preserve identifiers (including bigint), exact money and interest precision, consent, soft deletion and admin notes. Only newly introduced optional fields may be absent. |
| Exchange snapshots | Preserve IDs, rates JSON, provider, retrieval and expiry timestamps. Missing historic observation timestamps remain null; no fabricated observations. |
| Spotlights | Preserve car relation, score, tier, read state and timestamp. |
| Identity sequences | Restart above the maximum of imported ID and source high-water mark; retain reserved/unconsumed next positions where available. Reject exhausted or nonstandard source sequences. |

The importer checks table counts and compares each batch against its typed
expected rows before commit. It verifies the canonical readiness contract.
Exact decimal scales are enforced rather than silently rounded; UTC
conversion preserves timestamp microseconds. PostgreSQL's target constraints
reject duplicate IDs, unique values, invalid required fields and broken
relationships. A zero count for an absent optional source domain means
only that the domain does not exist in that approved snapshot, not that
the organization's other databases are empty.

## 5. Acceptance and rollback

- Re-run db:check and verify the eight counts against the reviewed snapshot.
  Confirm constraints and generated identity behavior; use synthetic
  credentials for the staging API smoke test, including auth, inventory,
  booking permissions and readiness.
- Pre-commit failures and dry runs roll back automatically, including DDL
  and identity restarts. The source is read-only throughout.
- After a committed transfer, keep the old datastore intact. If pre-cutover
  validation fails, do not cut over; prepare another fresh target.
  If new writes already occurred, halt writes and reconcile them before
  any switch back. Do not delete the target or restore over either source
  without separate approval. A native backup/restore rehearsal remains
  mandatory for any real production migration.
- The synthetic P6 rehearsal does not prove that the unknown live source
  layout is compatible, or authorize production migration/deployment.

## Reproduce the synthetic rehearsal

Supply two distinct, fresh loopback PostgreSQL databases named
`cardealership_s17_test_p6...` via S17_NATIVE_MIGRATION_DATABASE_URL and
S17_NATIVE_MIGRATION_PG_TARGET_URL, then:

```bash
NODE_ENV=test node --test tests/integration/postgresqlMigration.test.js
```

The test creates synthetic SQLite files locally, performs repeated dry runs,
tests failed imports, transfers the five legacy tables, exports the
resulting PostgreSQL clone with all eight domains and checks the restored
rows, sequence positions and API behavior. It must never use a live database.
