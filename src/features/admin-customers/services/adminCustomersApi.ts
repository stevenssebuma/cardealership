import { authenticatedApiRequest } from "../../../api/client";
import type {
  AdminCustomer,
  AdminCustomerBooking,
  AdminCustomersErrorCode,
  AdminCustomersResult,
  CustomerBookingCounts,
  CustomerBookingsResult,
} from "../types";

export const ADMIN_CUSTOMERS_ENDPOINT = "/api/admin/users";

export const adminCustomerBookingsEndpoint = (userId: number | string) =>
  `/api/admin/users/${encodeURIComponent(String(userId))}/bookings`;

type RequestOptions = {
  fetcher?: typeof fetch;
};

type RawCustomer = {
  id?: string | number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  phone?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  booking_count?: string | number | null;
  bookingCount?: string | number | null;
};

type RawBooking = {
  id?: string | number;
  userId?: string | number;
  user_id?: string | number;
  car_model?: string | null;
  carModel?: string | null;
  vehicleName?: string | null;
  date?: string | null;
  booking_date?: string | null;
  time_slot?: string | null;
  timeSlot?: string | null;
  status?: string | null;
  notes?: string | null;
};

function normalizeCustomer(raw: RawCustomer): AdminCustomer {
  return {
    id: Number(raw.id ?? 0),
    name: (raw.name ?? "").trim() || "Unnamed customer",
    email: (raw.email ?? "").trim(),
    role: (raw.role ?? "user").trim(),
    phone: raw.phone ?? null,
    joinedAt: raw.created_at ?? raw.createdAt ?? null,
    bookingCount: Number(raw.booking_count ?? raw.bookingCount ?? 0),
  };
}

/**
 * The console shows history by status, and an appointment whose date has passed
 * is settled even when the row still says "confirmed" — the same rule the
 * customer-facing history uses.
 */
function resolveStatus(
  supplied: string,
  date: string,
): AdminCustomerBooking["status"] {
  const normalized = supplied.toLowerCase();

  if (normalized === "cancelled") return "cancelled";
  if (normalized === "completed") return "completed";

  const settled = Boolean(date) && new Date(`${date}T23:59:59`).getTime() < Date.now();

  return settled ? "completed" : "upcoming";
}

function normalizeBooking(raw: RawBooking): AdminCustomerBooking {
  const date = String(raw.date ?? raw.booking_date ?? "");

  return {
    id: String(raw.id ?? ""),
    vehicleName: raw.car_model ?? raw.carModel ?? raw.vehicleName ?? "Vehicle",
    date,
    time: String(raw.time_slot ?? raw.timeSlot ?? ""),
    status: resolveStatus(String(raw.status ?? "confirmed"), date),
    notes: raw.notes ?? "",
  };
}

export function deriveCustomerBookingCounts(
  bookings: AdminCustomerBooking[],
): CustomerBookingCounts {
  return bookings.reduce<CustomerBookingCounts>(
    (counts, booking) => ({
      ...counts,
      [booking.status]: counts[booking.status] + 1,
    }),
    { upcoming: 0, completed: 0, cancelled: 0 },
  );
}

function failureMessage(code: AdminCustomersErrorCode) {
  switch (code) {
    case "UNAUTHORIZED":
      return "Your session has expired. Please sign in again.";
    case "FORBIDDEN":
      return "Administrator access is required to read customer history.";
    case "NOT_FOUND":
      return "That customer no longer exists.";
    default:
      return "Customer data could not be loaded. Please try again.";
  }
}

function mapFailure(status: number) {
  if (status === 401) return "UNAUTHORIZED" as const;
  if (status === 403) return "FORBIDDEN" as const;
  if (status === 404) return "NOT_FOUND" as const;
  return "LOAD_FAILED" as const;
}

export async function loadAdminCustomers(
  accessToken: string,
  options: RequestOptions = {},
): Promise<AdminCustomersResult> {
  try {
    const requestOptions: RequestInit = {
      method: "GET",
      headers: { Accept: "application/json" },
    };

    const response = options.fetcher
      ? await options.fetcher(ADMIN_CUSTOMERS_ENDPOINT, {
          ...requestOptions,
          headers: {
            ...requestOptions.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        })
      : await authenticatedApiRequest(
          ADMIN_CUSTOMERS_ENDPOINT,
          accessToken,
          requestOptions,
        );

    if (!response.ok) {
      const code = mapFailure(response.status);
      return { success: false, code, message: failureMessage(code) };
    }

    const data = (await response.json().catch(() => ({}))) as {
      data?: RawCustomer[];
      customers?: RawCustomer[];
    };

    const rows = data.data ?? data.customers ?? [];

    return { success: true, customers: rows.map(normalizeCustomer) };
  } catch {
    return {
      success: false,
      code: "LOAD_FAILED",
      message: "Customer data could not be loaded. Please try again.",
    };
  }
}

export async function loadCustomerBookings(
  userId: number,
  accessToken: string,
  options: RequestOptions = {},
): Promise<CustomerBookingsResult> {
  const endpoint = adminCustomerBookingsEndpoint(userId);

  try {
    const requestOptions: RequestInit = {
      method: "GET",
      headers: { Accept: "application/json" },
    };

    const response = options.fetcher
      ? await options.fetcher(endpoint, {
          ...requestOptions,
          headers: {
            ...requestOptions.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        })
      : await authenticatedApiRequest(endpoint, accessToken, requestOptions);

    if (!response.ok) {
      const code = mapFailure(response.status);
      return {
        success: false,
        code,
        message:
          code === "NOT_FOUND"
            ? "That customer no longer exists."
            : failureMessage(code),
      };
    }

    const data = (await response.json().catch(() => ({}))) as {
      user?: RawCustomer;
      bookings?: RawBooking[];
    };

    const bookings = (data.bookings ?? []).map(normalizeBooking);

    return {
      success: true,
      customer: normalizeCustomer(data.user ?? {}),
      bookings,
      counts: deriveCustomerBookingCounts(bookings),
    };
  } catch {
    return {
      success: false,
      code: "LOAD_FAILED",
      message: "That customer's bookings could not be loaded. Please try again.",
    };
  }
}
