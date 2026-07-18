/**
 * Authentication seam — intentionally inert.
 *
 * No authentication exists today (see docs/frontend/API_INTEGRATION_PLAN.md §8).
 * The http client asks this provider for a token on every request; when auth is
 * introduced, a real provider is swapped in here and nothing else changes.
 */

export interface AuthTokenProvider {
  getToken(): string | null | Promise<string | null>
}

export const nullAuthTokenProvider: AuthTokenProvider = {
  getToken: () => null,
}
