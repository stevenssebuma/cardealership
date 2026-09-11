import type { AuthSession, LoginCredentials, RegisterCredentials, VerifySessionResult } from "../types";
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

export async function login(credentials: LoginCredentials): Promise<{ success: boolean; message: string }> {
  try {
    const result = await loginApi(credentials.email, credentials.password);
    if (result.success && result.token && result.user) {
      saveSession({ accessToken: result.token, user: result.user });
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

export async function register(credentials: RegisterCredentials): Promise<{ success: boolean; message: string }> {
  try {
    const result = await registerApi(credentials.name, credentials.email, credentials.password);
    if (result.success && result.token && result.user) {
      saveSession({ accessToken: result.token, user: result.user });
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
