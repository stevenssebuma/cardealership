import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/hooks";
import {
  cancelBookingRequest,
  loadBookingHistory,
} from "../services/bookingHistoryApi";
import type { BookingHistoryResult } from "../types";

/**
 * Loads the signed-in customer's test-drive history and cancels one of their
 * bookings. The list is re-read after a successful cancel so the row moves into
 * the "cancelled" group with the status the server actually stored.
 */
export function useBookingHistory() {
  const { accessToken, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] =
    useState<BookingHistoryResult | null>(null);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      const unauthorized: BookingHistoryResult = {
        success: false,
        code: "UNAUTHORIZED",
        message: "Your session has expired. Please sign in again.",
      };
      setResult(unauthorized);
      setIsLoading(false);
      return unauthorized;
    }

    setIsLoading(true);
    const response = await loadBookingHistory(accessToken);
    setResult(response);
    setIsLoading(false);

    if (response.success === false && response.code === "UNAUTHORIZED") {
      logout();
    }

    return response;
  }, [accessToken, logout]);

  /**
   * Resolves to `true` only when the booking was cancelled and the list has been
   * re-read, so the caller can move focus to a control that still exists.
   */
  const cancelBooking = useCallback(
    async (bookingId: string): Promise<boolean> => {
      setCancelError(null);
      setCancelNotice(null);

      if (!accessToken) {
        setCancelError("Your session has expired. Please sign in again.");
        return false;
      }

      setPendingCancelId(bookingId);
      const response = await cancelBookingRequest(bookingId, accessToken);
      setPendingCancelId(null);

      // Discriminants are compared explicitly: `strict` is off in
      // tsconfig.check.json, so a truthiness check would not narrow the union.
      if (response.success === true) {
        setCancelNotice(response.message);
        await refresh();
        return true;
      }

      // A rejected session is handled the same way as a failed load: end the
      // session rather than leaving a button that can never succeed.
      if (response.success === false && response.code === "UNAUTHORIZED") {
        logout();
        return false;
      }

      if (response.success === false) {
        setCancelError(response.message);
      }

      return false;
    },
    [accessToken, logout, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    isLoading,
    result,
    refresh,
    cancelBooking,
    pendingCancelId,
    cancelError,
    cancelNotice,
  };
}
