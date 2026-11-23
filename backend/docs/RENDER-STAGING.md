# TSK-022 Render staging setup

This is a temporary, synthetic-data environment. Do not connect the live
database, deploy a production service, reuse production credentials, or
modify upstream main. Deploy the Sprint 17 contributor branch manually,
without GitHub Actions. Keep the final PR for integration review.

## 1. Create the isolated database

At https://dashboard.render.com/new/database, verify your workspace's
available plan and usage before creating anything. A free Postgres instance
is temporary (30 days, 1 GB, one active free database per workspace as
documented by Render); if that slot is occupied, stop rather than reuse a
live instance or purchase a plan without approval.

Set instance name `panda-s17-staging-db`, database name
`cardealership_s17_staging`, and a new database user. Use the same region
and workspace for the eventual web service. Record connection credentials
privately; do not paste the URL into conversation or Git. Restrict external
access to the IP of your approved development machine for bootstrap.

On your own checkout of the verified Sprint 17 branch, use its backend
directory and Node 24. Install dependencies with npm ci. Temporarily set
NODE_ENV=staging, STAGING_DATABASE_NAME=cardealership_s17_staging and
DATABASE_URL to the new database's **external** connection URL. Set
DATABASE_NETWORK=standard and DATABASE_SSL=require (our adapter verifies
the server certificate). Use a password prompt or private untracked env
file, not command-line literals or terminal screenshots.

```bash
npm ci
npm run db:test
npm run db:init -- --confirm cardealership_s17_staging
npm run db:seed -- --confirm cardealership_s17_staging
npm run db:check
```

Expected eight-table counts after the seed: users 1, cars 2, car_specs 2,
car_images 0, bookings 1, financing_leads 0, exchange_rate_snapshots 0,
vehicle_spotlights 0. If counts differ, investigate rather than wipe the
database. Disable external access after bootstrap if not needed. Do not
automatically seed or initialize on every Render deploy.

## 2. Create the isolated web service

At https://dashboard.render.com/new/web, connect the fork
ADBranches/cardealership (grant Render access only as appropriate),
select branch feature/edwin-sprint17-postgresql-consolidation, and use:

| Field | Value |
| --- | --- |
| Name | panda-s17-staging-api (or available unique variant) |
| Region/workspace | Same as staging database |
| Runtime | Node |
| Root Directory | backend |
| Build Command | npm ci |
| Start Command | npm start |
| Health Check Path | /api/ready |
| Auto-Deploy | Off |
| Instance | Free, subject to workspace limits |

Environment:

| Key | Value |
| --- | --- |
| NODE_ENV | staging |
| NODE_VERSION | 24.22.3 (verified locally; supported Render Node 24 if unavailable) |
| DATABASE_URL | New staging database's internal URL only |
| STAGING_DATABASE_NAME | cardealership_s17_staging |
| DATABASE_NETWORK | render-private |
| DATABASE_SSL | require |
| JWT_SECRET | New random secret generated securely, never shared |
| STAGING_DEPLOYMENT_ID | s17-panda-staging |
| CORS_ALLOWED_ORIGINS | http://localhost:5173 (add an exact staging frontend origin if needed) |
| EXCHANGE_RATE_PROVIDER | disabled (start without external calls) |
| EMAIL_PROVIDER | pending |
| CLEANUP_CRON_ENABLED | false |
| CLEANUP_STORAGE_DELETE_ENABLED | false |

Render provides PORT and RENDER_GIT_COMMIT; do not set them manually.
Do not configure production Cloudinary/email credentials. The private
TLS exception is limited to the explicit Render internal host and
requires encryption; external connections use verified TLS.
Free web services cannot provide shell/SSH access or paid pre-deploy
commands, so bootstrap the staging DB from the approved local machine
before deploying. Cold starts may take time.

## 3. Verify the deployed revision and run smoke tests

Use the actual Render service URL and actual deployed Git commit SHA
shown in its Deploys page. Confirm the GitHub branch head matches.
The stage-only /api/staging-info response exposes the deployment
identifier and SHA but no credentials. /api/ready must return 200.

```bash
npm run staging:smoke -- --url "$STAGING_URL" --confirm-host "$STAGING_HOST" --deployment s17-panda-staging --revision "$STAGING_COMMIT" --origin http://localhost:5173 --exchange disabled
```

Set STAGING_URL to the exact assigned HTTPS origin without slash,
STAGING_HOST to its onrender.com hostname, and STAGING_COMMIT to the
40-character SHA. All are nonsecret. The command checks revision,
readiness, CORS preflight, inventory, unauthenticated route denial and
controlled disabled exchange rates. Add `--exercise-writes` only after
verifying this is the isolated service; it creates a uniquely marked
synthetic user and booking, validates login/RBAC/duplicate rejection,
then cancels the created booking. Synthetic account and cancelled
booking remain in staging; no deletion of customer data.

Optional live rate validation: explicitly set
EXCHANGE_RATE_PROVIDER=frankfurter, manually deploy and repeat with
`--exchange frankfurter` to verify genuine provider data and database
cache. Do not use mock rates for hosted reference-rate acceptance.
If deploying a separate staging frontend, configure the exact API origin
through its documented VITE_API_BASE_URL and add the staging frontend's
exact HTTPS origin to CORS_ALLOWED_ORIGINS. Validate browser requests
against staging only; no change to the existing live frontend.

## 4. Evidence and handoff gate

Record staging deploy SHA, smoke completion, readiness, DB counts and
optional reference-rate result without secrets. Keep Render's free
resource expiry and workspace usage in mind. Do not claim hosted success
before the real URL and deploy revision have passed. Run the final
upstream conflict audit before the single PR; integration lead merges.

Official references: https://render.com/docs/free ,
https://render.com/docs/postgresql-creating-connecting ,
https://render.com/docs/deploys and https://render.com/docs/health-checks .
