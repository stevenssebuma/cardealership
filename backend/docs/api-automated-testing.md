# Panda Motors API automated tests

The suite sends HTTP requests through the real Express routes and uses PostgreSQL. It never uses the application `DATABASE_URL` during API tests. Existing manual scripts under `tests/` are unchanged.

## Local Docker test database

A dedicated PostgreSQL 18 container is provided for repeatable API tests:

```bash
cd backend
docker compose -f docker-compose.test.yml up -d
```

Docker Desktop displays it as **panda-motors-postgres-test**, listening only on local port **5434**. Its named volume is **panda_motors_test_pgdata**.

The first setup creates ignored `backend/.env.test` with unique local credentials. Copy `backend/.env.test.example` if a new local environment file is needed. Never commit `.env.test`.

For a first-time schema setup, the database must be empty. The following copies the active development **schema only**—tables, constraints, indexes, and sequences—without copying users, cars, bookings, or other business records:

```bash
npm run test:api:schema
npm run test:api:prepare
```

`test:api:schema` refuses a non-empty database, a target whose name does not contain `test`, or a target matching the development database. To deliberately recreate the local test database, stop and remove only its local Docker volume, start it again, then run the two commands above:

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
npm run test:api:schema
npm run test:api:prepare
```

## Safe test command

Run the complete suite from `backend`:

```bash
npm run test:api
```

The runner loads `backend/.env.test`, forces `NODE_ENV=test`, removes `DATABASE_URL`, and requires `TEST_DATABASE_URL` to point to a database whose name includes `test`. It cannot use development or production through the normal application database setting.

To run one group:

```bash
npm run test:api -- --test-name-pattern="authentication contracts"
```

`test:api:prepare` applies the additive booking contract migration. It adds `preferred_time`, notes, timestamps, and a partial unique index for active car/date/time slots. It does not delete or reinterpret test-drive records.

## Required test environment

```text
NODE_ENV=test
POSTGRES_DB=panda_motors_test
POSTGRES_USER=panda_motors_test
POSTGRES_PASSWORD=<local-secret>
TEST_DATABASE_URL=postgresql://panda_motors_test:<local-secret>@127.0.0.1:5434/panda_motors_test
TEST_DATABASE_SSL=false
JWT_SECRET=<long-test-only-secret>
```

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
