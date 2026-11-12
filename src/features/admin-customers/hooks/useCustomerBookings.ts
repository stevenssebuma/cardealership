import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/hooks";
import { loadCustomerBookings } from "../services/adminCustomersApi";
import type { CustomerBookingsResult } from "../types";

/**
 * Loads one customer's full history when the drawer opens. A request counter
 * discards the response of a customer the admin already navigated away from, so
 * a slow first request can never overwrite a newer selection.
 */
export function useCustomerBookings(userId: number | null) {
  const { accessToken } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CustomerBookingsResult | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (userId === null) {
      requestIdRef.current += 1;
      setResult(null);
      setIsLoading(false);
      return;
    }

    if (!accessToken) {
      setResult({
        success: false,
        code: "UNAUTHORIZED",
        message: "Your session has expired. Please sign in again.",
      });
      setIsLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);

    const response = await loadCustomerBookings(userId, accessToken);

    if (requestId !== requestIdRef.current) return;

    setResult(response);
    setIsLoading(false);
  }, [accessToken, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { isLoading, result, refresh: load };
}
