# Panda Motors API automated tests

The suite sends HTTP requests through the real Express routes and a real, temporary PostgreSQL server. Existing manual scripts under `tests/` are unchanged.

## One command: no Docker, PostgreSQL installation, or environment file

After the usual one-time dependency installation, run this in the VS Code terminal:

```bash
cd backend
npm run test:api
```

The command automatically starts an embedded PostgreSQL server on an available local port, creates a temporary database, loads the schema-only snapshot, applies the booking contract, runs every API test, prints the TAP result, and removes the database files when finished.

It does not use `DATABASE_URL`, an `.env.test` file, Docker, a shared test database, development data, or production data.

To run one group only:

```bash
npm run test:api -- --test-name-pattern="authentication contracts"
```

## Optional external database mode

Use this only when you intentionally want to run the suite against your own disposable PostgreSQL test database. Copy `.env.test.example` to the ignored `.env.test`, configure `TEST_DATABASE_URL` with a database name containing `test`, then run:

```bash
npm run test:api:setup
npm run test:api:external
```

`test:api:setup` refuses a non-empty database or a database whose name does not contain `test`. The committed `sql/api-test-schema.sql` contains schema only: tables, constraints, indexes, and sequences. It contains no application records or credentials. Update this snapshot whenever the application database schema changes.

## Tested contracts

- `POST /api/auth/register`, `/login`, `GET /me`, `GET /session`: registration role protection, credentials, sessions, and invalid/missing tokens.
- `/api/cars`: public listing/details/filtering, validation, and administrator-only create, update, and delete.
- `/api/bookings`: availability, authenticated creation, duplicate-slot conflict, ownership, cancellation, and PostgreSQL persistence.
- `/api/admin`: administrator-only statistics, safe user listing, booking list, and legal booking status transitions.

## Current limitations

The PostgreSQL schema has no sales table. Admin statistics return `salesMetricsAvailable: false` and `null` revenue/sales values rather than inventing sales data. Email and Cloudinary are not called by this suite.

Some unrelated legacy routes still load the older in-memory adapter when the complete application starts. The endpoints in this API suite—auth, cars, bookings, and admin—use PostgreSQL. Consolidating the unrelated legacy routes is a separate task.

## Endpoint response guide

| Area     | Method and path                                        | Authentication     | Expected result                                                                                         |
| -------- | ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------- |
| Auth     | `POST /api/auth/register`                              | Public             | `201` with `{ data: { user, token } }`; the supplied `role` is ignored and the account is a `customer`. |
| Auth     | `POST /api/auth/login`                                 | Public             | `200` with `{ data: { user, token } }`; invalid credentials return `401`.                               |
| Auth     | `GET /api/auth/me`, `/session`                         | Bearer token       | Current safe user record; no password field.                                                            |
| Cars     | `GET /api/cars?make=&year=&minPrice=&maxPrice=`        | Public             | Inventory list with optional PostgreSQL filters.                                                        |
| Cars     | `POST`, `PUT`, `DELETE /api/cars/:id`                  | Admin bearer token | Create, edit, or delete a vehicle. Customer attempts return `403`.                                      |
| Bookings | `GET /api/bookings/check-availability?car_id=&date=`   | Public             | Available and booked time slots.                                                                        |
| Bookings | `POST /api/bookings` or `/create`                      | Bearer token       | Creates the caller's `pending` test drive. Duplicate active car/date/time returns `409`.                |
| Bookings | `GET /api/bookings/me`, `PUT /api/bookings/:id/cancel` | Bearer token       | Own bookings and own cancellation; administrators may cancel any booking.                               |
| Admin    | `GET /api/admin/stats`, `/users`, `/bookings`          | Admin bearer token | PostgreSQL-backed operational data. Sales values are unavailable until a sales table exists.            |
| Admin    | `PUT /api/admin/bookings/:id/status`                   | Admin bearer token | Only `pending → confirmed/cancelled` and `confirmed → completed/cancelled` are accepted.                |
