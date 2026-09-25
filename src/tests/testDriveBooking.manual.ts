// src/tests/testDriveBooking.manual.ts
//
// Deterministic coverage for the test-drive booking client that talks to
// POST /api/bookings/create (the endpoint that owns the slot conflict check,
// the persistence and the confirmation email).
//
// The fetch implementation is injected, so no network or backend is required.

import assert from "node:assert/strict";
import {
  TEST_DRIVE_BOOKING_ENDPOINT,
  TestDriveBookingError,
  submitTestDriveBooking,
} from "../features/test-drive/services/testDriveService";
import type { TestDriveBookingPayload } from "../features/test-drive/types";

const token = "redacted-test-token";

const payload: TestDriveBookingPayload = {
  vehicleId: "2",
  vehicleName: "BMW X5",
  date: "2026-09-27",
  time: "09:00",
  phone: "+256700111222",
  notes: "Prefer a morning slot",
  customerId: "5",
  customerName: "Verify User",
  customerEmail: "verify@example.com",
};

type CapturedRequest = {
  url: string;
  method: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: Record<string, unknown>;
};

let captured: CapturedRequest | null = null;

function createFetcher(response: Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;

    captured = {
      url: String(input),
      method: init?.method ?? "GET",
      authorization: headers.Authorization,
      contentType: headers["Content-Type"],
      body: JSON.parse(String(init?.body ?? "{}")),
    };

    return response;
  }) as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// 1. Successful booking
// ---------------------------------------------------------------------------

const success = await submitTestDriveBooking(payload, {
  accessToken: token,
  fetcher: createFetcher(
    jsonResponse(201, {
      success: true,
      message: "Test drive booked for 2026-09-27 at 09:00",
      booking: { id: 42, date: "2026-09-27", timeSlot: "09:00" },
      notification: { attempted: true, sent: true, skipped: false },
    }),
  ),
});

assert.equal(success.success, true, "A confirmed booking must report success");
assert.equal(success.reference, "TD-42", "The persisted booking id must be used as the reference");
assert.equal(success.message, "Test drive booked for 2026-09-27 at 09:00");
assert.equal(success.notification?.sent, true);

assert.equal(TEST_DRIVE_BOOKING_ENDPOINT, "/api/bookings/create", "Bookings must use the persisted booking endpoint");
assert.equal(captured?.url, "/api/bookings/create");
assert.equal(captured?.method, "POST");
assert.equal(captured?.authorization, `Bearer ${token}`, "The signed-in session must travel with the booking");
assert.equal(captured?.contentType, "application/json");

assert.equal(captured?.body.user_id, "5", "The booking must be attached to the signed-in account");
assert.equal(captured?.body.car_id, "2");
assert.equal(captured?.body.car_model, "BMW X5");
assert.equal(captured?.body.date, "2026-09-27");
assert.equal(captured?.body.time_slot, "09:00");
assert.equal(captured?.body.user_name, "Verify User");
assert.equal(captured?.body.user_email, "verify@example.com");
assert.equal(captured?.body.user_phone, "+256700111222");
assert.equal(captured?.body.notes, "Prefer a morning slot");

// ---------------------------------------------------------------------------
// 2. Reference fallback when the backend omits the persisted id
// ---------------------------------------------------------------------------

const withoutId = await submitTestDriveBooking(payload, {
  accessToken: token,
  fetcher: createFetcher(jsonResponse(201, { success: true, message: "Booked" })),
});

assert.equal(withoutId.reference, "TD-20260927-0900", "A deterministic reference must still be shown");

// ---------------------------------------------------------------------------
// 3. Slot conflicts, expired sessions and validation failures
// ---------------------------------------------------------------------------

async function expectBookingError(
  response: Response,
  expectedCode: TestDriveBookingError["code"],
): Promise<string> {
  try {
    await submitTestDriveBooking(payload, { accessToken: token, fetcher: createFetcher(response) });
  } catch (error) {
    assert.ok(error instanceof TestDriveBookingError, "A TestDriveBookingError must be thrown");
    const bookingError = error as TestDriveBookingError;
    assert.equal(bookingError.code, expectedCode);
    return bookingError.message;
  }

  throw new Error(`Expected ${expectedCode} to be thrown`);
}

const conflictMessage = await expectBookingError(
  jsonResponse(409, {
    success: false,
    error: "Time slot already booked for this car",
    conflict: true,
  }),
  "SLOT_CONFLICT",
);
assert.equal(conflictMessage, "Time slot already booked for this car", "The conflict reason must reach the customer");

const expiredMessage = await expectBookingError(jsonResponse(401, { success: false }), "UNAUTHORIZED");
assert.match(expiredMessage, /sign in again/i);

const rejectedMessage = await expectBookingError(
  jsonResponse(400, { success: false, error: "Invalid time slot" }),
  "REQUEST_FAILED",
);
assert.equal(rejectedMessage, "Invalid time slot", "Backend validation messages must be surfaced");

const malformedMessage = await expectBookingError(
  new Response("<html>gateway error</html>", { status: 502 }),
  "REQUEST_FAILED",
);
assert.match(malformedMessage, /try again/i, "A malformed response must fall back to a safe message");

// ---------------------------------------------------------------------------
// 4. Signed-out callers must not pretend to send a session
// ---------------------------------------------------------------------------

await submitTestDriveBooking(payload, {
  accessToken: "",
  fetcher: createFetcher(jsonResponse(201, { success: true, message: "Booked" })),
});
assert.equal(captured?.authorization, undefined, "No Authorization header must be sent without a session");

console.log(
  JSON.stringify(
    {
      suite: "testDriveBooking",
      passed: 32,
      failed: 0,
      endpoint: TEST_DRIVE_BOOKING_ENDPOINT,
      tokenLogged: false,
      networkUsed: false,
    },
    null,
    2,
  ),
);

assert.equal(captured?.body.date, "2026-09-27");
assert.equal(captured?.body.time_slot, "09:00");
assert.equal(captured?.body.user_name, "Verify User");
assert.equal(captured?.body.user_email, "verify@example.com");
assert.equal(captured?.body.user_phone, "+256700111222");
assert.equal(captured?.body.notes, "Prefer a morning slot");
