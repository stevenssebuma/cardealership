import type { ReactNode } from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom";
import { LoadingSpinner } from "../../../components/common/LoadingSpinner/LoadingSpinner";
import { useAuth } from "../../../features/auth/hooks";
import { getProtectedRouteDecision } from "./routeAccess";


interface User {
  role?: string;
}

interface ProtectedRouteProps {
  adminOnly?: boolean;
}

export default function ProtectedRoute({
  adminOnly = false,
}: ProtectedRouteProps) {
  const token = localStorage.getItem("token");
  const storedUser = localStorage.getItem("user");

  let user: User | null = null;

  if (storedUser) {
    try {
      user = JSON.parse(storedUser);
    } catch {
      user = null;
    }
  }

  // User is not logged in
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Admin page but user is not an admin
  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}