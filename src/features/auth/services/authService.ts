import type { AuthSession, AuthUser, LoginCredentials, RegisterCredentials, VerifySessionResult } from "../types";
import { clearStoredSession, getAuthToken, getAuthenticatedUser, getStoredSession, saveSession } from "./authStorage";
import { verifySession as verifySessionRequest, login as loginApi, register as registerApi } from "./authApi";

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
    return {
      success: false,
      message: error instanceof Error ? error.message : "Login failed",
    };
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
    return {
      success: false,
      message: error instanceof Error ? error.message : "Registration failed",
    };
  }
}
