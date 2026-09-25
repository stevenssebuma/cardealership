
  # Car Dealership Website

  This is a code bundle for Car Dealership Website. The original project is available at https://www.figma.com/design/NPsA6njEcspPFrARnNwvCj/Car-Dealership-Website.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  ---

---

## Sprint 4 Image Cleanup Contract

Edwin's Sprint 4 backend task introduces a safe cleanup contract for stale car listing media.

A car listing is eligible for image cleanup only when all of the following are true:

- The listing status is `Draft` or `Deleted`.
- The listing has remained in that state for more than 30 days.
- The listing has associated image/media links.

The cleanup contract intentionally protects active inventory. Listings with statuses such as `Available`, `Sold`, `Pending`, `Approved`, `Published`, or `Active` must be skipped.

The cleanup timestamp fallback order is:

```text
deleted_at
drafted_at
updated_at
created_at
```

---

## Sprint 4 Image Cleanup PR Readiness

Edwin's Sprint 4 backend implementation provides a safe cleanup workflow for stale car-listing media.

### Implemented Scope

- Selects car listings with `Draft` or `Deleted` status that are older than 30 days.
- Protects active statuses such as `Available`, `Sold`, `Pending`, `Approved`, `Published`, and `Active`.
- Reads associated media through the `car_images` table and `image_url` field.
- Provides a provider-safe storage adapter with `pending`, `cloudinary`, `s3`, `firebase`, `supabase`, and `local` provider options.
- Defaults all cleanup operations to dry-run mode.
- Requires explicit flags and environment configuration before storage or database cleanup can proceed.
- Rechecks listing status and timestamp eligibility inside database removal queries.
- Provides a repeatable manual cleanup script and a scheduler-ready job.
- Keeps automatic in-process scheduling disabled until deployment-owner approval.
- Returns structured, sanitized cleanup reports with run IDs and operation counts.
- Includes repeatable manual validation covering stale, recent, active, media-free, malformed-media, dry-run, and execute-mode scenarios.

### Manual Commands

```text
cd backend
npm run test:car-image-cleanup
npm run cleanup:car-images
npm run cleanup:car-images:job
```

The execute command exists but must not be used until storage-provider behavior, production credentials, and destructive-cleanup ownership are approved:

```text
cd backend
npm run cleanup:car-images:execute
```

### Safe Defaults

```text
STORAGE_PROVIDER=pending
CLEANUP_STORAGE_DELETE_ENABLED=false
CLEANUP_CRON_ENABLED=false
CLEANUP_DRY_RUN=true
CLEANUP_OLDER_THAN_DAYS=30
CLEANUP_STATUSES=Draft,Deleted
```

### Provider-Dependent Work

Real storage deletion remains intentionally disabled. Before enabling destructive cleanup, the team must confirm the production storage provider, object identifier strategy, bucket or folder rules, credentials management, storage-versus-database deletion policy, scheduler ownership, cron schedule, production dry-run policy, and approval owner.

The backend exposes GET /api/auth/session. The endpoint requires Authorization: Bearer <access-token>, verifies the JWT, confirms that the referenced PostgreSQL user still exists, and returns the verified user. Missing, invalid, expired, and rejected sessions return unauthorized responses and cause the frontend to clear stored authentication data. Live deployment validation still requires securely configured DATABASE_URL and JWT_SECRET values.

### Routing safety contract

```text
Authentication unresolved -> render a bootstrap/loading state
Authentication ready and verified -> render protected content
Authentication ready and unauthenticated -> redirect to login
Authenticated user visiting login -> redirect to the intended destination or dashboard
```

The active router remains `src/app/App.tsx`. The unused `src/app/routes.tsx` configuration must not become a second active router during authentication implementation.

### Security rules

- Never treat local JWT decoding as authentication proof.
- Never log access tokens, JWT payloads, or authorization headers.
- Never place backend secrets in frontend environment variables.
- Clear malformed and rejected sessions safely.
- Return sanitized errors to the UI.
- Do not redirect before restoration completes.
- Preserve the requested protected destination where practical.

## Sprint 5 Authentication Persistence Validation

The authentication persistence flow is validated with deterministic in-memory storage and an injectable mock verification API contract. Validation covers login storage, refresh and browser-reopen restoration, protected-route access after successful verification, expired and invalid token cleanup, unauthorized redirects, safe network-failure handling, logout cleanup, and token-redaction checks.

Run the validation with:

```text
npm run test:auth-persistence
```

The frontend verification contract uses `GET /api/auth/session` with `Authorization: Bearer <access-token>`. The backend route and JWT authentication middleware are implemented and pass syntax validation. The deterministic persistence suite remains mock-based because live verification requires deployment-managed PostgreSQL and JWT configuration. The frontend does not use local JWT decoding as proof of authentication.

## Sprint 5 Frontend API Environment

The frontend reads its public API origin from `VITE_API_BASE_URL`. API paths are joined through `src/api/client.ts`, and trailing slashes are normalized before requests are built.

Copy `.env.example` to an ignored environment file and replace the placeholder with the deployment owner-approved API origin.

Development example:

```text
VITE_API_BASE_URL=http://localhost:5000
```

Production example:

```text
VITE_API_BASE_URL=https://approved-production-api.example.com
```

The production value above is a placeholder. A valid absolute HTTP or HTTPS URL is required at build time. Only public `VITE_` variables may be exposed to frontend code. Database URLs, JWT secrets, Cloudinary secrets, email credentials, private keys, and other backend credentials must never be placed in frontend environment files.

Validation commands:

```text
npm run test:api-config

# Vite loads .env / .env.production automatically, so the override is not tied to
# any particular shell. Add the approved origin to an ignored environment file:
#   VITE_API_BASE_URL=https://approved-production-api.example.com
npm run build

# One-off overrides, if you would rather not create an environment file:
#   PowerShell:  $env:VITE_API_BASE_URL="https://approved-production-api.example.com"; npm run build
#   bash / zsh:  VITE_API_BASE_URL=https://approved-production-api.example.com npm run build
```

Project demonstration:

https://youtu.be/HNtln75HTEg

---

## Sprint 6 Automated Test Drive Email Pipeline

The test drive booking lifecycle now sends transactional email automatically:

- An immediate confirmation receipt is sent from `POST /api/bookings/create` through `backend/services/emailService.js`.
- A background checker (`backend/jobs/testDriveReminderJob.js`) emails a reminder when an appointment is approximately 24 hours away and marks the booking with `reminderSent` so a reminder is never duplicated.
- Both sends are non-blocking: a booking is always saved even when email delivery fails, and the pipeline is skipped safely (never throwing) when no provider is configured.

Provider resolution order (see `backend/services/emailService.js` and `backend/config/email.js`):

```text
EMAIL_PROVIDER=nodemailer with EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASSWORD/EMAIL_FROM
  -> fall back to the Ethereal test account (ETHEREAL_USER / ETHEREAL_PASSWORD)
  -> otherwise skip the send safely
```

Reminder checker settings (`backend/.env`):

```text
TEST_DRIVE_REMINDER_ENABLED=true
TEST_DRIVE_REMINDER_INTERVAL_MINUTES=60
TEST_DRIVE_REMINDER_WINDOW_HOURS=24
TEST_DRIVE_REMINDER_DRY_RUN=false
```

The window is deliberately one hour wide on either side of the target (23h to 25h) so an hourly run can never step over an appointment.

Manual validation:

```text
cd backend
npm run test:test-drive-emails
```

### Sprint 6 API Integration Testing Suite

Backend integration tests use Jest + Supertest against the real Express application (routes, middleware and JWT signing) while the PostgreSQL pool is replaced with an in-memory double, so the suite runs without a live database or email provider.

Covered scenarios:

- Registering a new user succeeds and never returns the password hash.
- Registration validation responses (`400`, `409`) stay intact.
- Logging in returns a signed JWT with the expected claims.
- Invalid credentials are rejected with `401`.
- Admin routes fail without a token (`401`), with an invalid token (`401`) and with a customer token (`403`), and succeed with an admin token.
- Profile endpoints used by the profile page (`GET`/`PATCH /api/users/me`) require a valid session.
- Booking a test drive triggers exactly one confirmation email.
- The reminder sweep sends exactly one reminder 24 hours before an appointment and never duplicates it.

Commands:

```text
cd backend
npm test                      # full suite
npm run test:auth-integration # auth, admin protection, profile routes
npm run test:email-integration# booking confirmation + reminder pipeline
```

The suite also runs in CI through `.github/workflows/backend-integration-tests.yml` on pull requests targeting `main`.

