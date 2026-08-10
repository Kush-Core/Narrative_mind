/**
 * Authentication seam.
 *
 * The http client asks a provider for a token on every request and, on a 401,
 * tells it the token was rejected. `nullAuthTokenProvider` is the inert
 * default (used by bare `new HttpClient()` instances, mainly in tests);
 * `sessionAuthTokenProvider` is the real implementation backing the app-wide
 * `httpClient` singleton, reading and clearing `shared/auth/session-store.ts`.
 */

import { useSessionStore } from "@/shared/auth/session-store"

export interface AuthTokenProvider {
  getToken(): string | null | Promise<string | null>
  /** Called when a request comes back 401 — the token is gone or expired. */
  onUnauthorized?: () => void
}

export const nullAuthTokenProvider: AuthTokenProvider = {
  getToken: () => null,
}

export const sessionAuthTokenProvider: AuthTokenProvider = {
  getToken: () => useSessionStore.getState().token,
  onUnauthorized: () => useSessionStore.getState().clearSession(),
}
