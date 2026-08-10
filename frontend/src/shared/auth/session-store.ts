/**
 * Session identity — the one piece of server-issued state that legitimately
 * lives outside TanStack Query (STATE_MANAGEMENT.md §4's "no server data in
 * Zustand" rule is about *entity* data; the access token itself is never
 * fetched or cached by the query layer, so it has nowhere else to live).
 *
 * Persisted so a reload does not sign the user out, and read from two
 * independent places that must agree without importing React: the HTTP
 * client's auth seam (`shared/api/auth.ts`) and the route guard
 * (`routes/guards/RequireAuth.tsx`).
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SessionState {
  token: string | null
  userId: string | null
  setSession: (token: string) => void
  clearSession: () => void
}

/**
 * Pulls `sub` out of the JWT payload without verifying the signature — the
 * backend is the only party that needs to trust this token; the client just
 * wants the user id for display, and an expired/tampered token still fails
 * every real request via the 401 path.
 */
function decodeUserId(token: string): string | null {
  const payload = token.split(".")[1]
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const json = atob(base64)
    const claims = JSON.parse(json) as { sub?: unknown }
    return typeof claims.sub === "string" ? claims.sub : null
  } catch {
    return null
  }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      setSession: (token) => set({ token, userId: decodeUserId(token) }),
      clearSession: () => set({ token: null, userId: null }),
    }),
    { name: "narrative-mind:session" },
  ),
)
