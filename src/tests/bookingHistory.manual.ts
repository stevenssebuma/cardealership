import assert from "node:assert/strict";
import { loadBookingHistory } from "../features/profile/services/bookingHistoryApi";
import {
  groupBookingHistory,
  sortBookingHistory,
} from "../features/profile/utils/bookingHistory";

const result = await loadBookingHistory(
  "redacted-token",
  { mockMode: true },
);

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

console.log(JSON.stringify({
  suite: "bookingHistory",
  passed: 8,
  failed: 0,
  syntheticDataUsed: true,
  browserSuppliedUserId: false,
}, null, 2));
