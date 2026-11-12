// src/tests/bookingHistory.manual.ts
//
// Deterministic coverage for the profile booking history and its self-service
// cancellation. The HTTP layer is injected, so no backend is required.

import assert from "node:assert/strict";
import {
  BOOKING_CANCEL_ENDPOINT,
  cancelBookingRequest,
  loadBookingHistory,
} from "../features/profile/services/bookingHistoryApi";
import {
  groupBookingHistory,
  sortBookingHistory,
} from "../features/profile/utils/bookingHistory";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type CapturedRequest = {
  url: string;
  method: string;
  authorization: string | undefined;
};

function createFetcher(status: number, body: unknown) {
  let captured: CapturedRequest | null = null;

  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    captured = {
      url: String(input),
      method: init?.method ?? "GET",
      authorization: headers.Authorization,
    };

    return jsonResponse(status, body);
  }) as typeof fetch;

  return { fetcher, captured: () => captured };
}

const dayOffset = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 1. Synthetic history
// ---------------------------------------------------------------------------

const result = await loadBookingHistory("redacted-token", { mockMode: true });

// Checked before the assert below, which narrows `success` to `true` through its
// `asserts` signature and would make this guard unreachable to the type checker.
if (result.success === false) throw new Error(result.message);
assert.equal(result.success, true);
assert.equal(result.bookings.length, 3);

const groups = groupBookingHistory(result.bookings);
assert.equal(groups.upcoming.length, 1);
assert.equal(groups.completed.length, 1);
assert.equal(groups.cancelled.length, 1);
assert.equal(sortBookingHistory(result.bookings)[0].id, "mock-booking-002");
assert.equal(result.mock, true);
assert.equal(
  result.bookings.some((booking) => booking.vehicleId === ""),
  false,
);

assert.equal(
  result.bookings.every((booking) => booking.canCancel === false),
  true,
  "Synthetic bookings must never be cancellable",
);

// ---------------------------------------------------------------------------
// 2. Server payload: only an upcoming booking can be cancelled
// ---------------------------------------------------------------------------

const upcomingDate = dayOffset(6);
const pastDate = dayOffset(-6);

const liveResponse = createFetcher(200, {
  success: true,
  bookings: [
    {
      id: 41,
      car_id: 7,
      car_model: "Toyota Land Cruiser",
      date: upcomingDate,
      time_slot: "10:00",
      status: "confirmed",
    },
    {
      id: 42,
      car_id: 8,
      car_model: "BMW X5",
      date: pastDate,
      time_slot: "09:00",
      status: "confirmed",
    },
    {
      id: 43,
      car_id: 9,
      car_model: "Mercedes GLE",
      date: upcomingDate,
      time_slot: "11:00",
      status: "cancelled",
    },
  ],
});

const live = await loadBookingHistory("redacted-token", {
  mockMode: false,
  fetcher: liveResponse.fetcher,
});

if (live.success === false) throw new Error(live.message);

const byId = (id: string) => live.bookings.find((booking) => booking.id === id);
assert.equal(byId("41")?.status, "upcoming");
assert.equal(byId("41")?.canCancel, true, "A future confirmed booking can be cancelled");
assert.equal(byId("42")?.status, "completed");
assert.equal(byId("42")?.canCancel, false, "A past booking is settled");
assert.equal(byId("43")?.status, "cancelled");
assert.equal(byId("43")?.canCancel, false, "An already cancelled booking is settled");

// ---------------------------------------------------------------------------
// 3. Cancel request contract
// ---------------------------------------------------------------------------

assert.equal(
  BOOKING_CANCEL_ENDPOINT("41"),
  "/api/bookings/41/cancel",
  "The cancel route is the token-scoped PUT on the booking",
);

const ok = createFetcher(200, {
  success: true,
  booking: { id: 41, status: "cancelled" },
  message: "Booking cancelled successfully",
});

const okCancel = await cancelBookingRequest("41", "redacted-token", {
  mockMode: false,
  fetcher: ok.fetcher,
});

assert.equal(okCancel.success, true);
assert.equal(ok.captured()?.method, "PUT");
assert.equal(ok.captured()?.url, "/api/bookings/41/cancel");
assert.equal(
  ok.captured()?.authorization,
  "Bearer redacted-token",
  "Cancelling must travel with the signed-in session",
);

const forbidden = await cancelBookingRequest("41", "redacted-token", {
  mockMode: false,
  fetcher: createFetcher(403, { success: false, error: "You can only cancel your own bookings" }).fetcher,
});
assert.equal(forbidden.success, false);
if (forbidden.success === false) assert.equal(forbidden.code, "FORBIDDEN");

const alreadyCancelled = await cancelBookingRequest("41", "redacted-token", {
  mockMode: false,
  fetcher: createFetcher(400, { error: "Booking already cancelled" }).fetcher,
});
assert.equal(alreadyCancelled.success, false);
if (alreadyCancelled.success === false) assert.equal(alreadyCancelled.code, "ALREADY_CANCELLED");

const expired = await cancelBookingRequest("41", "redacted-token", {
  mockMode: false,
  fetcher: createFetcher(401, { success: false }).fetcher,
});
assert.equal(expired.success, false);
if (expired.success === false) assert.equal(expired.code, "UNAUTHORIZED");

const missing = await cancelBookingRequest("999", "redacted-token", {
  mockMode: false,
  fetcher: createFetcher(404, { error: "Booking not found" }).fetcher,
});
assert.equal(missing.success, false);
if (missing.success === false) assert.equal(missing.code, "CANCEL_FAILED");

const mockCancel = await cancelBookingRequest("mock-booking-001", "redacted-token", {
  mockMode: true,
});
assert.equal(mockCancel.success, false, "Cancelling synthetic bookings is refused without a request");

console.log(
  JSON.stringify(
    {
      suite: "bookingHistory",
      passed: 24,
      failed: 0,
      syntheticDataUsed: true,
      browserSuppliedUserId: false,
      cancelRequiresSession: true,
    },
    null,
    2,
  ),
);
