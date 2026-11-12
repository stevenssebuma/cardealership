# Sprint 10 API Testing Guide

## Scope
Covers registration, login, vehicle listing, the legacy test-drive request (`POST /api/test-drives`), the persisted booking endpoint (`POST /api/bookings/create`), and administrator statistics.

> **Two different test-drive endpoints.** `POST /api/test-drives` is the sprint 10 request-only
> endpoint: no authentication, no persistence, no conflict check — it just sends an email. The
> booking flow customers actually use is `POST /api/bookings/create`, which requires a bearer token,
> validates the slot, persists the booking and mails the account address. Contract:
> [../sprint6/sprint6-validation-report.md](../sprint6/sprint6-validation-report.md) § Task 3.

## Prerequisites
1. Configure PostgreSQL and `backend/.env`.
2. Start the backend from `backend/` with `npm run dev`.
3. Confirm `http://localhost:5500/api/health` is reachable.
4. Open `src/tests/sprint10-required-endpoints.http` in an HTTP client.

## Safety
Replace password and token placeholders only in a local untracked copy. Never commit real JWTs, passwords, secrets, or database URLs.

## Execution order
1. Register once, then repeat to test HTTP 409.
2. Log in and keep temporary tokens locally.
3. Run login negative cases.
4. Run cars requests.
5. Run the legacy test-drive request cases (`POST /api/test-drives`).
6. Run the persisted booking cases (`POST /api/bookings/create`, then `GET /api/bookings/me`).
7. Run admin authorization cases.

## Verified limitations
- Registration does not validate email format.
- `GET /api/cars` does not implement server filtering or sorting.
- `POST /api/test-drives` does not validate date, time or phone formats.
- `POST /api/test-drives` does not persist or enforce conflicts. Persistence, slot validation and
  conflict checks exist on `POST /api/bookings/create`.
- Phone is optional on the legacy request; the booking endpoint always falls back to the account
  phone on file.

## Expected statuses
- Registration: 201, missing field 400, duplicate 409.
- Login: 200, invalid credentials 401, missing field 400.
- Cars list: 200.
- Legacy test drive (`POST /api/test-drives`): 201, missing required value 400.
- Admin stats: missing or invalid token 401, non-admin 403, admin 200.

## Persisted booking endpoint statuses

| Request | Expected |
| --- | --- |
| `POST /api/bookings/create` without a token | 401 `AUTHENTICATION_REQUIRED` |
| `POST /api/bookings/create` with a valid token | 201, booking owned by the token's account |
| same car/date/slot booked twice | 409 slot conflict |
| date in the past or unknown `time_slot` | 400 |
| unknown `car_id` | 404 |
| booking outside the per-customer allowance | 429 |
| `GET /api/bookings/me` without a token | 401 |
| `GET /api/bookings/user/:user_id` for another customer | 403 |
| `PUT /api/bookings/:id/cancel` for another customer | 403 |
| `PUT /api/bookings/:id/cancel` twice | 400 already cancelled |
| `GET /api/admin/users/:user_id/bookings` without the admin role | 403 |
| `GET /api/admin/users/:user_id/bookings` for an unknown id | 404 |

## Live-test blocker policy
If PostgreSQL or the backend is unavailable, record live testing as blocked. Structural request validation is not a substitute for live endpoint results.
