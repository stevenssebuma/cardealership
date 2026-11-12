import { authenticatedApiRequest } from "../../../api/client";
import type {
  BookingCancelResult,
  BookingHistoryItem,
  BookingHistoryResult,
} from "../types";
import { sortBookingHistory } from "../utils/bookingHistory";
import {
  BOOKING_HISTORY_ENDPOINT,
  isProfileMockMode,
} from "./profileApi";

type BookingHistoryOptions = {
  mockMode?: boolean;
  fetcher?: typeof fetch;
};

type RawBooking = {
  id?: string | number;
  _id?: string;
  car_id?: string | number;
  carId?: string | number;
  car_model?: string;
  carModel?: string;
  vehicleName?: string;
  booking_date?: string;
  date?: string;
  time_slot?: string;
  timeSlot?: string;
  status?: string;
};

// Synthetic rows have no server record behind them, so they are never
// cancellable — offering the action would only produce a failing request.
const SYNTHETIC_BOOKINGS: BookingHistoryItem[] = [
  {
    id: "mock-booking-001",
    vehicleId: "mock-car-101",
    vehicleName: "Toyota Land Cruiser",
    date: "2026-09-14",
    time: "10:30",
    status: "upcoming",
    canCancel: false,
  },
  {
    id: "mock-booking-002",
    vehicleId: "mock-car-202",
    vehicleName: "BMW X5",
    date: "2026-06-11",
    time: "14:00",
    status: "completed",
    canCancel: false,
  },
  {
    id: "mock-booking-003",
    vehicleId: "mock-car-303",
    vehicleName: "Mercedes GLE",
    date: "2026-07-03",
    time: "09:30",
    status: "cancelled",
    canCancel: false,
  },
];

function normalizeBooking(item: RawBooking): BookingHistoryItem {
  const date = String(item.booking_date ?? item.date ?? "");
  const suppliedStatus = String(item.status ?? "confirmed").toLowerCase();
  const isPast =
    new Date(`${date}T23:59:59`).getTime() < Date.now();

  const status: BookingHistoryItem["status"] =
    suppliedStatus === "cancelled"
      ? "cancelled"
      : suppliedStatus === "completed" || isPast
        ? "completed"
        : "upcoming";

  return {
    id: String(item.id ?? item._id ?? ""),
    vehicleId: String(item.car_id ?? item.carId ?? ""),
    vehicleName:
      item.vehicleName ?? item.car_model ?? item.carModel ?? "Vehicle",
    date,
    time: String(item.time_slot ?? item.timeSlot ?? ""),
    status,
    // Only an upcoming booking can still be called off; the backend rejects a
    // second cancel with 400, and past appointments are already settled.
    canCancel: status === "upcoming",
  };
}

export async function loadBookingHistory(
  accessToken: string,
  options: BookingHistoryOptions = {},
): Promise<BookingHistoryResult> {
  if (options.mockMode ?? isProfileMockMode()) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      success: true,
      bookings: sortBookingHistory(SYNTHETIC_BOOKINGS),
      mock: true,
    };
  }

  try {
    const response = options.fetcher
      ? await options.fetcher(BOOKING_HISTORY_ENDPOINT, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        })
      : await authenticatedApiRequest(
          BOOKING_HISTORY_ENDPOINT,
          accessToken,
          { headers: { Accept: "application/json" } },
        );

    if (response.status === 401) {
      return {
        success: false,
        code: "UNAUTHORIZED",
        message: "Your session has expired. Please sign in again.",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        code: "BOOKING_HISTORY_FAILED",
        message: "Booking history could not be loaded. Please try again.",
      };
    }

    const data = (await response.json().catch(() => ({}))) as {
      bookings?: RawBooking[];
    };

    return {
      success: true,
      bookings: sortBookingHistory(
        (data.bookings ?? []).map(normalizeBooking),
      ),
      mock: false,
    };
  } catch {
    return {
      success: false,
      code: "BOOKING_HISTORY_FAILED",
      message: "Booking history could not be loaded. Please try again.",
    };
  }
}

export const BOOKING_CANCEL_ENDPOINT = (bookingId: string) =>
  `/api/bookings/${encodeURIComponent(bookingId)}/cancel`;

/**
 * Cancels one of the signed-in customer's own bookings. Ownership is enforced
 * server-side from the bearer token, so the id alone never grants access.
 */
export async function cancelBookingRequest(
  bookingId: string,
  accessToken: string,
  options: BookingHistoryOptions = {},
): Promise<BookingCancelResult> {
  if (options.mockMode ?? isProfileMockMode()) {
    return {
      success: false,
      code: "CANCEL_FAILED",
      message:
        "Cancelling is unavailable while synthetic booking data is displayed.",
    };
  }

  try {
    const requestOptions: RequestInit = {
      method: "PUT",
      headers: { Accept: "application/json" },
    };

    const response = options.fetcher
      ? await options.fetcher(BOOKING_CANCEL_ENDPOINT(bookingId), {
          ...requestOptions,
          headers: {
            ...requestOptions.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        })
      : await authenticatedApiRequest(
          BOOKING_CANCEL_ENDPOINT(bookingId),
          accessToken,
          requestOptions,
        );

    if (response.status === 401) {
      return {
        success: false,
        code: "UNAUTHORIZED",
        message: "Your session has expired. Please sign in again.",
      };
    }

    if (response.status === 403) {
      return {
        success: false,
        code: "FORBIDDEN",
        message: "That booking belongs to another account.",
      };
    }

    if (response.status === 400) {
      return {
        success: false,
        code: "ALREADY_CANCELLED",
        message: "That booking is already cancelled.",
      };
    }

    if (response.status === 404) {
      return {
        success: false,
        code: "CANCEL_FAILED",
        message: "That booking no longer exists.",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        code: "CANCEL_FAILED",
        message: "The booking could not be cancelled. Please try again.",
      };
    }

    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    return {
      success: true,
      message: data.message ?? "Booking cancelled.",
    };
  } catch {
    return {
      success: false,
      code: "CANCEL_FAILED",
      message: "The booking could not be cancelled. Please try again.",
    };
  }
}
