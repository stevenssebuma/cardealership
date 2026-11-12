import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/hooks";
import { loadAdminCustomers } from "../services/adminCustomersApi";
import type { AdminCustomersResult } from "../types";

/**
 * Customer directory for the admin console. Refreshed on demand — the panel
 * exposes a retry, and the page re-mounts the hook when it reloads its data.
 */
export function useAdminCustomers() {
  const { accessToken, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<AdminCustomersResult | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setResult({
        success: false,
        code: "UNAUTHORIZED",
        message: "Your session has expired. Please sign in again.",
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const response = await loadAdminCustomers(accessToken);
    setResult(response);
    setIsLoading(false);

    if (response.success === false && response.code === "UNAUTHORIZED") {
      logout();
    }
  }, [accessToken, logout]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isLoading, result, refresh };
}
