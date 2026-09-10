import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingSpinner } from "../../../components/common/LoadingSpinner/LoadingSpinner";
import { useAuth } from "../../../features/auth/hooks";
import { getProtectedRouteDecision } from "./routeAccess";

interface ProtectedRouteProps {
  adminOnly?: boolean;
  children?: ReactNode;
}

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { isAuthReady, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const decision = getProtectedRouteDecision(isAuthReady, isAuthenticated);

  if (decision === "loading") return <LoadingSpinner />;

  if (decision === "redirect-login") {
    const requestedPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(requestedPath)}`} replace />;
  }

  if (adminOnly && user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default ProtectedRoute;
