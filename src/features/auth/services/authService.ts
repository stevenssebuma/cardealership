import type { AuthError, AuthSession, AuthUser, LoginCredentials, RegisterCredentials, VerifySessionResult } from "../types";
import { clearStoredSession, getAuthToken, getAuthenticatedUser, getStoredSession, saveSession } from "./authStorage";
import { AuthApiError, verifySession as verifySessionRequest, login as loginApi, register as registerApi } from "./authApi";

export { clearStoredSession, getAuthenticatedUser, getAuthToken, getStoredSession, saveSession };

export function isAuthenticated(): boolean {
  return Boolean(getStoredSession());
}

export function clearAuthToken(): void {
  clearStoredSession();
}

export async function verifySession(token: string, options: Parameters<typeof verifySessionRequest>[1] = {}): Promise<VerifySessionResult> {
  const result = await verifySessionRequest(token, options);
  if (!result.valid) clearStoredSession();
  return result;
}

export async function restoreStoredSession(options: Parameters<typeof verifySessionRequest>[1] = {}): Promise<AuthSession | null> {
  const token = getAuthToken();
  if (!token) return null;
  const result = await verifySession(token, options);
  if (!result.valid) return null;
  const session = { accessToken: token, user: result.user };
  saveSession(session);
  return session;
}

export type AuthResult = {
  success: boolean;
  message: string;
  error?: AuthError;
  /**
   * Present when authentication succeeded. The caller (login/register form)
   * applies it to the AuthProvider so protected routes unlock immediately,
   * without waiting for a page reload or a second session request.
   */
  session?: AuthSession;
};

function toAuthSession(token: string, user: AuthUser): AuthSession {
  return { accessToken: token, user: { ...user, id: String(user.id) } };
}

function toAuthFailure(error: unknown, fallbackMessage: string): AuthResult {
  if (error instanceof AuthApiError) {
    return {
      success: false,
      message: error.message,
      error: { code: error.code, message: error.message, status: error.status },
    };
  }
  return {
    success: false,
    message: fallbackMessage,
    error: { code: "AUTH_REQUEST_FAILED", message: fallbackMessage },
  };
}

export async function login(credentials: LoginCredentials): Promise<AuthResult> {
  try {
    const result = await loginApi(credentials.email, credentials.password);
    if (result.success && result.token && result.user) {
      const session = toAuthSession(result.token, result.user);
      saveSession(session);
      return { success: true, message: result.message, session };
    }
    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    return toAuthFailure(error, "Login failed. Please try again.");
  }
}

export async function register(credentials: RegisterCredentials): Promise<AuthResult> {
  try {
    // The backend expects a single display name, while the registration form
    // collects a first and last name.
    const fullName = [credentials.firstName, credentials.lastName]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" ");

    const result = await registerApi(fullName, credentials.email, credentials.password);
    if (result.success && result.token && result.user) {
      const session = toAuthSession(result.token, result.user);
      saveSession(session);
      return { success: true, message: result.message, session };
    }
    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    return toAuthFailure(error, "Registration failed. Please try again.");
  }
}
