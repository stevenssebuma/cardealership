import { AUTH_STORAGE_KEYS, type AuthSession, type AuthUser } from "../types";

export interface AuthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getWindowStorage(kind: "localStorage" | "sessionStorage"): AuthStorage | null {
  if (typeof window === "undefined") return null;
  return window[kind] ?? null;
}

function getLocalStorageStore(): AuthStorage | null {
  return getWindowStorage("localStorage");
}

function getSessionStorageStore(): AuthStorage | null {
  return getWindowStorage("sessionStorage");
}

function getAvailableStores(): AuthStorage[] {
  return [getLocalStorageStore(), getSessionStorageStore()].filter(
    (store): store is AuthStorage => store !== null,
  );
}

function parseStoredUser(value: string | null): AuthUser | null {
  if (!value) return null;
  try {
    const user = JSON.parse(value) as AuthUser;
    return user && typeof user.id !== "undefined" && typeof user.email === "string" ? { ...user, id: String(user.id) } : null;
  } catch {
    return null;
  }
}

/**
 * Storage that should receive a new session for the requested persistence.
 *
 * `remember` keeps the session in localStorage (survives closing the browser),
 * otherwise it goes into sessionStorage (ends with the tab).
 */
export function getSessionTarget(remember: boolean): AuthStorage | null {
  return remember ? getLocalStorageStore() : getSessionStorageStore();
}

/**
 * Storage currently holding the signed-in session.
 *
 * `saveSession` keeps the session in exactly one store, so the first match is
 * unambiguous. Falls back to localStorage as the default write target.
 */
export function getActiveStorage(): AuthStorage | null {
  const localStore = getLocalStorageStore();
  if (localStore && getAuthToken(localStore)) return localStore;

  const sessionStore = getSessionStorageStore();
  if (sessionStore && getAuthToken(sessionStore)) return sessionStore;

  return localStore;
}

export function getAuthToken(storage: AuthStorage | null = getActiveStorage()): string | null {
  if (!storage) return null;
  const canonicalToken = storage.getItem(AUTH_STORAGE_KEYS.accessToken);
  if (canonicalToken) return canonicalToken;
  for (const key of AUTH_STORAGE_KEYS.legacyAccessTokens) {
    const legacyToken = storage.getItem(key);
    if (legacyToken) return legacyToken;
  }
  return null;
}

export function getAuthenticatedUser(storage: AuthStorage | null = getActiveStorage()): AuthUser | null {
  if (!storage) return null;
  return parseStoredUser(storage.getItem(AUTH_STORAGE_KEYS.user));
}

export function getStoredSession(storage: AuthStorage | null = getActiveStorage()): AuthSession | null {
  if (!storage) return null;
  const accessToken = getAuthToken(storage);
  const user = getAuthenticatedUser(storage);
  if (!accessToken || !user) return null;
  if (!storage.getItem(AUTH_STORAGE_KEYS.accessToken)) storage.setItem(AUTH_STORAGE_KEYS.accessToken, accessToken);
  return { accessToken, user };
}

function clearSessionKeys(storage: AuthStorage): void {
  storage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  storage.removeItem(AUTH_STORAGE_KEYS.user);
  AUTH_STORAGE_KEYS.legacyAccessTokens.forEach((key) => storage.removeItem(key));
  storage.removeItem(AUTH_STORAGE_KEYS.legacyRole);
  storage.removeItem(AUTH_STORAGE_KEYS.legacyIsAdmin);
}

export function saveSession(session: AuthSession, storage: AuthStorage | null = getActiveStorage()): void {
  if (!storage) return;

  // Keep the session in a single store, so "Keep me signed in" is truthful and
  // a stale token from a previous choice can never be picked up instead.
  getAvailableStores()
    .filter((availableStore) => availableStore !== storage)
    .forEach(clearSessionKeys);

  storage.setItem(AUTH_STORAGE_KEYS.accessToken, session.accessToken);
  storage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(session.user));
}

export function clearStoredSession(storage?: AuthStorage | null): void {
  if (storage === null) return;
  (storage ? [storage] : getAvailableStores()).forEach(clearSessionKeys);
}
