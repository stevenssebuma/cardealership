import { apiRequest } from "../../../api/client";
import { getAuthToken } from "../../auth/services";
import type {
  TestDriveBookingNotification,
  TestDriveBookingPayload,
  TestDriveBookingResult,
} from "../types";

/**
 * Test drives are created through the booking endpoint that owns the
 * persistence, the double-booking conflict check and the confirmation email:
 *
 *   GET  /api/bookings/check-availability  -> slots offered to the customer
 *   POST /api/bookings/create              -> persists the chosen slot
 *
 * Both endpoints read the same `bookings` collection, so the slots the
 * scheduler offers are exactly the slots that can still be booked.
 */
export const TEST_DRIVE_BOOKING_ENDPOINT = "/api/bookings/create";

export const AVAILABLE_TEST_DRIVE_TIMES = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00",
  "16:00",
] as const;

export type TestDriveBookingErrorCode =
  | "SLOT_CONFLICT"
  | "UNAUTHORIZED"
  | "REQUEST_FAILED";

export class TestDriveBookingError extends Error {
  code: TestDriveBookingErrorCode;

  constructor(message: string, code: TestDriveBookingErrorCode) {
    super(message);
    this.name = "TestDriveBookingError";
    this.code = code;
  }
}

type SubmitTestDriveOptions = {
  /** Injectable fetch used by the deterministic manual test suite. */
  fetcher?: typeof fetch;
  endpoint?: string;
  /** Overrides the token read from storage (used by the manual test suite). */
  accessToken?: string;
};

type BookingApiResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  booking?: {
    id?: string | number;
  };
  notification?: TestDriveBookingNotification;
};

function buildReference(
  response: BookingApiResponse,
  payload: TestDriveBookingPayload,
): string {
  if (response.booking?.id !== undefined && response.booking?.id !== null) {
    return `TD-${response.booking.id}`;
  }

  // Fall back to a deterministic reference so the customer still has a
  // reference to quote if the backend response omits the persisted id.
  return `TD-${payload.date.replace(/-/g, "")}-${payload.time.replace(":", "")}`;
}

export async function submitTestDriveBooking(
  payload: TestDriveBookingPayload,
  options: SubmitTestDriveOptions = {},
): Promise<TestDriveBookingResult> {
  const token = options.accessToken ?? getAuthToken();
  const endpoint = options.endpoint ?? TEST_DRIVE_BOOKING_ENDPOINT;

  const requestOptions: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      user_id: payload.customerId,
      car_id: payload.vehicleId,
      car_model: payload.vehicleName,
      date: payload.date,
      time_slot: payload.time,
      user_name: payload.customerName,
      user_email: payload.customerEmail,
      user_phone: payload.phone,
      notes: payload.notes,
    }),
  };

  const response = options.fetcher
    ? await options.fetcher(endpoint, requestOptions)
    : await apiRequest(endpoint, requestOptions);

  const data = (await response.json().catch(() => ({}))) as BookingApiResponse;

  if (response.status === 409) {
    throw new TestDriveBookingError(
      data.error ||
        "That time slot has just been reserved. Please choose another time.",
      "SLOT_CONFLICT",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new TestDriveBookingError(
      "Your session has expired. Please sign in again to book a test drive.",
      "UNAUTHORIZED",
    );
  }

  if (!response.ok || !data.success) {
    throw new TestDriveBookingError(
      data.message ||
        data.error ||
        "Unable to submit your test drive request. Please try again.",
      "REQUEST_FAILED",
    );
  }

  return {
    success: true,
    message: data.message || "Test-drive appointment confirmed.",
    reference: buildReference(data, payload),
    notification: data.notification,
  };
}

