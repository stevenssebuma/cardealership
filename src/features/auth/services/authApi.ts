import type { AuthErrorCode, AuthUser, VerifySessionResult } from "../types";
import { buildApiUrl } from "../../../api/client";

export const AUTH_SESSION_VERIFICATION_ENDPOINT = "/api/auth/session";
export const AUTH_LOGIN_ENDPOINT = "/api/auth/login";
export const AUTH_REGISTER_ENDPOINT = "/api/auth/register";

type FetchLike = typeof fetch;

type VerifySessionOptions = {
  endpoint?: string;
  fetcher?: FetchLike;
};

export type LoginResponse = {
  success: boolean;
  message: string;
  token?: string;
  user?: AuthUser;
};

export type RegisterResponse = {
  success: boolean;
  message: string;
  token?: string;
  user?: AuthUser;
};

function normalizeFailure(status: number, message: string): VerifySessionResult {
  const normalizedMessage = message.toLowerCase();
  let code: AuthErrorCode = "SESSION_VERIFICATION_FAILED";
  if (status === 401) {
    code = normalizedMessage.includes("expired") ? "TOKEN_EXPIRED" : normalizedMessage.includes("invalid") ? "INVALID_TOKEN" : "UNAUTHORIZED";
  }
  return { valid: false, code, message: "Your session could not be verified. Please sign in again." };
}

export function createAuthorizationHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  try {
    const response = await fetch(buildApiUrl(AUTH_LOGIN_ENDPOINT), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json().catch(() => ({}))) as LoginResponse;
    return {
      success: response.ok && data.success,
      message: data.message || "Login failed",
      token: data.token,
      user: data.user,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Authentication endpoint connection failed",
    };
  }
}

export async function register(name: string, email: string, password: string): Promise<RegisterResponse> {
  try {
    const response = await fetch(buildApiUrl(AUTH_REGISTER_ENDPOINT), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name, email, password }),
    });
    const data = (await response.json().catch(() => ({}))) as RegisterResponse;
    return {
      success: response.ok && data.success,
      message: data.message || "Registration failed",
      token: data.token,
      user: data.user,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Registration endpoint connection failed",
    };
  }
}

export async function verifySession(token: string, options: VerifySessionOptions = {}): Promise<VerifySessionResult> {
  const fetcher = options.fetcher ?? fetch;
    const endpoint = options.endpoint ?? AUTH_SESSION_VERIFICATION_ENDPOINT;
    const requestUrl = options.fetcher ? endpoint : buildApiUrl(endpoint);
  try {
    const response = await fetcher(requestUrl, {
      method: "GET",
      headers: createAuthorizationHeaders(token),
    });
    const data = (await response.json().catch(() => ({}))) as { valid?: boolean; user?: AuthUser; message?: string };
    if (response.ok && data.user) return { valid: true, user: { ...data.user, id: String(data.user.id) } };
    return normalizeFailure(response.status, data.message ?? "Session verification failed");
  } catch {
    return { valid: false, code: "SESSION_VERIFICATION_FAILED", message: "Session verification is temporarily unavailable." };
  }
}
