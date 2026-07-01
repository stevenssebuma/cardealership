export type TestDriveBookingPayload = {
  vehicleId: string;
  vehicleName?: string;
  date: string;
  time: string;
  phone: string;
  notes?: string;
};

export const TEST_DRIVE_BOOKING_ENDPOINT = "/api/test-drives";

export function getAuthToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt")
  );
}

/**
 * TODO: Connect this helper to POST /api/test-drives once the active backend
 * structure and endpoint are confirmed by the team.
 *
 * Expected future request:
 * POST /api/test-drives
 *
 * Headers:
 * Authorization: Bearer <JWT_TOKEN>
 * Content-Type: application/json
 */
export async function submitTestDriveBookingDraft(
  payload: TestDriveBookingPayload
) {
  console.log("Prepared test drive booking payload:", {
    endpoint: TEST_DRIVE_BOOKING_ENDPOINT,
    payload,
  });

  return {
    success: true,
    message: "Booking payload prepared. Backend endpoint connection pending.",
  };
}

export const CARS_ENDPOINT = "/api/cars";

export type PaginatedCarsQuery = {
  page: number;
  limit: number;
};

/**
 * Future API contract for Ronald's paginated car endpoint.
 *
 * Expected backend route:
 * GET /api/cars?page=1&limit=12
 *
 * This helper only builds the URL for now.
 * The admin table still uses local vehicle data until the backend endpoint is confirmed.
 */
export function buildPaginatedCarsUrl({ page, limit }: PaginatedCarsQuery) {
  return `${CARS_ENDPOINT}?page=${page}&limit=${limit}`;
}
