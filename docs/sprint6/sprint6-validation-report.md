# Sprint 6 Validation Report - Devine (Backend: Email Automation, Booking Security & Automated Testing)

## Scope

| Task | Deliverable | Status |
| --- | --- | --- |
| Task 1 | Automated test drive email pipeline (immediate confirmation + 24 hour reminder) | Implemented and validated |
| Task 2 | API integration testing suite (Jest + Supertest) | Implemented and validated |
| Task 3 | Token-scoped booking access (create, history, cancel) + account-pinned confirmation email | Implemented and validated |

## Task 1 - Automated test drive email pipeline

### Task 1 Files

```text
backend/services/emailService.js              sendTestDriveConfirmation(), sendTestDriveReminder()
backend/templates/appointmentConfirmation.js  confirmation template (existing, reused)
backend/templates/testDriveReminder.js        reminder template (new)
backend/routes/bookingRoutes.js               triggers the confirmation email after the booking is persisted
backend/controllers/bookingController.js      resolves the recipient from the session, not the request body
backend/jobs/testDriveReminderJob.js          background checker + runTestDriveReminderCheck()
backend/server.js                             mounts /api/test-drives and starts the checker safely
```

### Behaviour

1. `POST /api/bookings/create` requires a bearer token, validates the slot, checks for a conflict, resolves the recipient from the authenticated account, persists the booking and only then sends the confirmation receipt. A failed send can never fail a booking.
2. The confirmation always goes to the account address on the token. A `user_email` in the request body is ignored, so the endpoint cannot be used to mail arbitrary recipients.
3. The background checker runs on an in-process interval (default 60 minutes, `setInterval(...).unref()` so it never keeps the process alive on its own) plus one immediate sweep at boot so a restart does not delay pending reminders.
4. Reminders are limited to appointments 23-25 hours away and guarded by `reminderSent` / `reminderSentAt` on the booking, so the same appointment is never reminded twice.
5. Provider resolution: configured `nodemailer` provider first, then the Ethereal test account, otherwise the send is skipped safely with a reported reason. No credentials are ever returned to the API response.

### Commands

```text
cd backend
npm run test:test-drive-emails
npm run email:verify -- --to=<address>
```

## Task 3 - Booking security contract

Every route that acts on a customer's behalf resolves the customer from the verified
bearer token (`req.user.id`). No route trusts a `user_id` from the request body, and no route
reads or mutates a booking without an ownership check.

| Route | Auth | Rule |
| --- | --- | --- |
| `POST /api/bookings/create` | required | owner comes from the token; body `user_id` and `user_email` are ignored |
| `GET /api/bookings/me` | required | always scoped to the caller |
| `GET /api/bookings/user/:user_id` | required | caller's own account or an admin, otherwise `403` |
| `PUT /api/bookings/:id/cancel` | required | booking owner or an admin, otherwise `403`; already cancelled → `400`; unknown id → `404` |
| `GET /api/bookings/check-availability` | public | slot lookup only, exposes no customer data |

Composition is verified by `backend/tests/integration/bookingRouteContract.integration.test.js`, which
asserts that each customer route is wrapped in `rateLimitProtectedRoute, authenticateToken`, that the
router is mounted once with no inline handlers, that identity is read from the token, and that the
confirmation address is bound to the account address. This suite replaces the earlier
`bookingRouteContract.test.js`, which asserted a router and controller shape that no longer existed
and was never collected by `jest.config.js` (`testMatch` is `tests/**/*.integration.test.js`).

### Task 3 Files

```text
backend/routes/bookingRoutes.js                                  authenticated customer routes
backend/controllers/bookingController.js                         token identity, ownership checks, pinned recipient
backend/tests/testDriveBooking.integration.test.js               create, conflict, attribution, ownership
backend/tests/testDriveEmail.integration.test.js                 confirmation + reminder pipeline, recipient pinning
backend/tests/integration/bookingRouteContract.integration.test.js route composition contract
backend/tests/helpers/bookingTestPool.js                         stateful bookings double (returns user_id for the cancel guard)
src/features/test-drive/services/testDriveService.ts             sends no user_id and no user_email
src/features/profile/services/bookingHistoryApi.ts               GET /api/bookings/me + PUT /api/bookings/:id/cancel
src/features/profile/hooks/useBookingHistory.ts                  load, refresh-after-cancel, session teardown on 401
src/features/profile/components/BookingHistory.tsx               history tabs + two-step self-service cancel
src/pages/Profile/ProfilePage.tsx                                mounts the history card on /profile
```

Customers see their history and can cancel their own upcoming test drive from `/profile`, and the
same component is shared with `/settings`. The cancel button only appears on bookings the server
already reports as upcoming, the action is a two-step confirm, and the list is re-read afterwards so
the row moves into the cancelled group with the stored status.

## Task 2 - API integration testing suite

### Task 2 Files

```text
backend/jest.config.js                          Jest configuration (ESM, node environment)
backend/tests/setup/env.setup.js                loads backend/.env and test-safe defaults
backend/tests/auth.integration.test.js          register, login, admin protection, profile routes
backend/tests/testDriveBooking.integration.test.js create, conflict, attribution, ownership rules
backend/tests/testDriveEmail.integration.test.js confirmation email, reminder checker, recipient pinning
backend/tests/dbTransaction.integration.test.js  transaction rollback, release and partial-write safety
backend/tests/integration/bookingRouteContract.integration.test.js  route composition contract
backend/tests/helpers/bookingTestPool.js         stateful bookings double
.github/workflows/backend-integration-tests.yml CI gate on pull requests to main
```

### Design notes

- The suite imports the real Express application from `backend/server.js` (`export default app`), so routes, middleware, JWT signing and validation are exercised through HTTP with Supertest.
- `backend/config/db.js` is replaced with an in-memory double so the suite is deterministic and requires no PostgreSQL credentials.
- `nodemailer` is replaced with a transport double so no real email is sent.
- `PORT=0` (OS-assigned port) and `TEST_DRIVE_REMINDER_ENABLED=false` avoid port conflicts and background work during test runs; the HTTP server started by the module is closed in `afterAll`.
- `AUTH_ALLOW_ANY_CREDENTIALS` is forced to `false` so the development open sign-in can never mask a broken password check.

### Result

```text
cd backend
npm test

Test Suites: 5 passed, 5 total
Tests:       52 passed, 52 total
```

Live smoke check on the running API (real server, real configuration, PostgreSQL on port 5433):

```text
GET  /api/health                              -> 200
GET  /api/users/me                            -> 401 (token required)
GET  /api/admin/stats                         -> 401 (token required)
POST /api/bookings/create (no token)          -> 401 AUTHENTICATION_REQUIRED
POST /api/bookings/create (body user_id = 1)  -> 201, booking owned by the token's user
GET  /api/bookings/user/8 as another customer -> 403
PUT  /api/bookings/16/cancel as another user  -> 403, status stays confirmed
PUT  /api/bookings/16/cancel as the owner     -> 200, status cancelled
reminder job sweep                            -> 0 sent, 0 failed, 0 in window
```

## Follow-up required outside code

- `backend/.env` contains expired Ethereal credentials, so the pipeline currently reports `535 Authentication failed` and the booking flow correctly continues without email. Replace `EMAIL_USER` / `EMAIL_PASSWORD` (or supply a fresh `ETHEREAL_USER` / `ETHEREAL_PASSWORD`) to enable real delivery. Until then the confirmation panel shows the phone-fallback copy instead of claiming an email was sent.
