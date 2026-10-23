export {
  clearAuthToken,
  clearStoredSession,
  getAuthenticatedUser,
  getAuthToken,
  getStoredSession,
  isAuthenticated,
  login,
  register,
  restoreStoredSession,
  saveSession,
  verifySession,
} from "./authService";

export { AUTH_LOGIN_ENDPOINT, AUTH_REGISTER_ENDPOINT, AUTH_SESSION_VERIFICATION_ENDPOINT, AuthApiError, createAuthorizationHeaders } from "./authApi";
export type { AuthStorage } from "./authStorage";
