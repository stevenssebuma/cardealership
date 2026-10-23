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

type AuthRequestOptions = {
  endpoint?: string;
  fetcher?: FetchLike;
};

export type LoginResponse = {
  success: true;
  message: string;
  token: string;
  user: AuthUser;
};

export type RegisterResponse = {
  success: true;
  message: string;
  token: string;
  user: AuthUser;
};

type AuthResponsePayload = {
  success?: boolean;
  message?: string;
  token?: string;
  user?: { id?: string | number; email?: string; name?: string; role?: string; isAdmin?: boolean };
};

export class AuthApiError extends Error {
  readonly code: AuthErrorCode;
  readonly status?: number;

  constructor(code: AuthErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AuthApiError";
    this.code = code;
    this.status = status;
  }
}

function createAuthApiError(status: number, payload: AuthResponsePayload): AuthApiError {
  if (status === 401) {
    return new AuthApiError(
      "INVALID_CREDENTIALS",
      payload.message || "Invalid email or password.",
      status,
    );
  }
  if (status === 409) {
    return new AuthApiError(
      "EMAIL_ALREADY_EXISTS",
      payload.message || "An account with this email already exists.",
      status,
    );
  }
  if (status === 400) {
    return new AuthApiError(
      "VALIDATION_FAILED",
      payload.message || "Check the submitted information and try again.",
      status,
    );
  }
  if (status >= 500) {
    return new AuthApiError(
      "AUTH_SERVER_ERROR",
      "The authentication service is temporarily unavailable. Please try again.",
      status,
    );
  }
  return new AuthApiError(
    "AUTH_REQUEST_FAILED",
    payload.message || "Authentication could not be completed. Please try again.",
    status,
  );
}

async function submitAuthRequest(
  endpoint: string,
  body: Record<string, string>,
  fallbackMessage: string,
  options: AuthRequestOptions = {},
): Promise<LoginResponse> {
  const fetcher = options.fetcher ?? fetch;
  const requestUrl = options.fetcher ? options.endpoint ?? endpoint : buildApiUrl(options.endpoint ?? endpoint);

  let response: Response;
  try {
    response = await fetcher(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError(
      "AUTH_REQUEST_FAILED",
      "Unable to connect to the authentication service. Please try again.",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as AuthResponsePayload;
  if (!response.ok || !payload.success) {
    throw createAuthApiError(response.status, payload);
  }
  if (
    typeof payload.token !== "string" ||
    !payload.token ||
    !payload.user ||
    (typeof payload.user.id !== "string" && typeof payload.user.id !== "number") ||
    typeof payload.user.email !== "string"
  ) {
    throw new AuthApiError("AUTH_REQUEST_FAILED", fallbackMessage, response.status);
  }

  return {
    success: true,
    message: payload.message || fallbackMessage,
    token: payload.token,
    user: { ...payload.user, id: String(payload.user.id), email: payload.user.email },
  };
}

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

export async function login(
  email: string,
  password: string,
  options: AuthRequestOptions = {},
): Promise<LoginResponse> {
  return submitAuthRequest(
    AUTH_LOGIN_ENDPOINT,
    { email, password },
    "Login failed. Please try again.",
    options,
  );
}

export async function register(
  name: string,
  email: string,
  password: string,
  options: AuthRequestOptions = {},
): Promise<RegisterResponse> {
  return submitAuthRequest(
    AUTH_REGISTER_ENDPOINT,
    { name, email, password },
    "Registration failed. Please try again.",
    options,
  );
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
