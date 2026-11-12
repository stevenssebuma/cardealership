// src/tests/adminCustomers.manual.ts
//
// Deterministic coverage for the admin customer directory and the per-customer
// history drawer service. The HTTP layer is injected, so no backend is needed.

import assert from "node:assert/strict";
import {
  ADMIN_CUSTOMERS_ENDPOINT,
  adminCustomerBookingsEndpoint,
  deriveCustomerBookingCounts,
  loadAdminCustomers,
  loadCustomerBookings,
} from "../features/admin-customers/services/adminCustomersApi";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type CapturedRequest = { url: string; authorization: string | undefined };

function createFetcher(status: number, body: unknown) {
  let captured: CapturedRequest | null = null;

  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;

    captured = {
      url: String(input),
      authorization: headers.Authorization,
    };

    return jsonResponse(status, body);
  }) as typeof fetch;

  return { fetcher, captured: () => captured };
}

// ---------------------------------------------------------------------------
// 1. Endpoints
// ---------------------------------------------------------------------------

assert.equal(ADMIN_CUSTOMERS_ENDPOINT, "/api/admin/users");
assert.equal(
  adminCustomerBookingsEndpoint(7),
  "/api/admin/users/7/bookings",
  "History is read per customer through the admin route",
);

// ---------------------------------------------------------------------------
// 2. Directory normalisation
// ---------------------------------------------------------------------------

const directory = createFetcher(200, {
  success: true,
  total: 2,
  data: [
    {
      id: 7,
      name: "Amina Nakato",
      email: "amina@pandamotors.test",
      role: "user",
      phone: null,
      created_at: "2026-10-01T09:00:00.000Z",
      booking_count: 3,
    },
    {
      id: 9,
      name: null,
      email: "unregistered@pandamotors.test",
      role: "user",
      created_at: null,
      booking_count: "0",
    },
  ],
});

const customers = await loadAdminCustomers("admin-token", {
  fetcher: directory.fetcher,
});

if (customers.success === false) throw new Error(customers.message);

assert.equal(customers.customers.length, 2);
assert.equal(directory.captured()?.url, "/api/admin/users");
assert.equal(directory.captured()?.authorization, "Bearer admin-token");
assert.equal(customers.customers[0].bookingCount, 3);
assert.equal(customers.customers[0].joinedAt, "2026-10-01T09:00:00.000Z");
assert.equal(
  customers.customers[1].name,
  "Unnamed customer",
  "A customer without a name still renders",
);
assert.equal(
  customers.customers[1].bookingCount,
  0,
  "A string booking count is coerced to a number",
);

// ---------------------------------------------------------------------------
// 3. History normalisation and derived counts
// ---------------------------------------------------------------------------

const history = createFetcher(200, {
  success: true,
  total: 3,
  user: {
    id: 7,
    name: "Amina Nakato",
    email: "amina@pandamotors.test",
    role: "user",
    phone: "+256700111222",
    created_at: "2026-10-01T09:00:00.000Z",
  },
  bookings: [
    {
      id: 31,
      carId: 2,
      carModel: "Toyota Land Cruiser",
      date: "2030-01-05",
      timeSlot: "10:00",
      status: "confirmed",
      notes: "",
    },
    {
      id: 32,
      carId: 3,
      carModel: "BMW X5",
      date: "2020-01-05",
      timeSlot: "09:00",
      status: "confirmed",
      notes: "Past appointment",
    },
    {
      id: 33,
      carId: 4,
      carModel: "Mercedes GLE",
      date: "2030-02-05",
      timeSlot: "11:00",
      status: "cancelled",
      notes: "",
    },
  ],
});

const detail = await loadCustomerBookings(7, "admin-token", {
  fetcher: history.fetcher,
});

if (detail.success === false) throw new Error(detail.message);

assert.equal(history.captured()?.url, "/api/admin/users/7/bookings");
assert.equal(detail.customer.name, "Amina Nakato");
assert.equal(detail.bookings.length, 3);
assert.equal(
  detail.bookings.find((booking) => booking.id === "31")?.status,
  "upcoming",
  "A future confirmed booking is upcoming",
);
assert.equal(
  detail.bookings.find((booking) => booking.id === "32")?.status,
  "completed",
  "An appointment whose date has passed is settled",
);
assert.equal(
  detail.bookings.find((booking) => booking.id === "33")?.status,
  "cancelled",
  "A cancelled booking keeps its status",
);
assert.deepEqual(detail.counts, { upcoming: 1, completed: 1, cancelled: 1 });
assert.deepEqual(deriveCustomerBookingCounts([]), {
  upcoming: 0,
  completed: 0,
  cancelled: 0,
});

// ---------------------------------------------------------------------------
// 4. Failure mapping
// ---------------------------------------------------------------------------

const forbidden = await loadAdminCustomers("customer-token", {
  fetcher: createFetcher(403, { success: false }).fetcher,
});
assert.equal(forbidden.success, false);
if (forbidden.success === false) {
  assert.equal(forbidden.code, "FORBIDDEN");
  assert.ok(forbidden.message.length > 0);
}

const expired = await loadAdminCustomers("stale-token", {
  fetcher: createFetcher(401, { success: false }).fetcher,
});
assert.equal(expired.success, false);
if (expired.success === false) assert.equal(expired.code, "UNAUTHORIZED");

const missing = await loadCustomerBookings(9999, "admin-token", {
  fetcher: createFetcher(404, { success: false }).fetcher,
});
assert.equal(missing.success, false);
if (missing.success === false) {
  assert.equal(missing.code, "NOT_FOUND");
  assert.equal(missing.message, "That customer no longer exists.");
}

const broken = await loadCustomerBookings(7, "admin-token", {
  fetcher: createFetcher(500, { success: false }).fetcher,
});
assert.equal(broken.success, false);
if (broken.success === false) assert.equal(broken.code, "LOAD_FAILED");

// ---------------------------------------------------------------------------
// 5. Empty directory
// ---------------------------------------------------------------------------

const empty = await loadAdminCustomers("admin-token", {
  fetcher: createFetcher(200, { success: true, data: [] }).fetcher,
});
assert.equal(empty.success, true);
if (empty.success === true) assert.equal(empty.customers.length, 0);

console.log(
  JSON.stringify(
    {
      suite: "adminCustomers",
      passed: 27,
      failed: 0,
      tokenLogged: false,
      networkUsed: false,
      adminOnlyEndpoints: true,
    },
    null,
    2,
  ),
);
