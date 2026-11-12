import { useCallback, useEffect, useRef, useState } from "react";
import { loadBookingAvailability } from "../services/availabilityApi";
import type { AvailabilityState } from "../types/availability.types";

const IDLE_STATE: AvailabilityState = { status: "idle", result: null };

export type BookingAvailability = AvailabilityState & {
  /**
   * Re-runs the availability request for the current vehicle/date. Used when a
   * request fails so the customer can recover without reloading the page.
   */
  retry: () => void;
};

export function useBookingAvailability(
  vehicleId: string,
  date: string,
): BookingAvailability {
  const [state, setState] = useState<AvailabilityState>(IDLE_STATE);
  const [attempt, setAttempt] = useState(0);
  const requestIdRef = useRef(0);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!vehicleId || !date) {
      setState(IDLE_STATE);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setState({ status: "loading", result: null });

    void loadBookingAvailability(vehicleId, date, { signal: controller.signal }).then((result) => {
      if (requestId !== requestIdRef.current || result.success === false && result.code === "ABORTED") return;
      setState({ status: result.success ? "ready" : "error", result });
    });

    return () => controller.abort();
  }, [attempt, date, vehicleId]);

  return { ...state, retry };
}
