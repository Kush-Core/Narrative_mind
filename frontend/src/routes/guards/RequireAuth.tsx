import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"

import { paths } from "@/routes/paths"
import { useSessionStore } from "@/shared/auth/session-store"

/**
 * Gates every route under `WorkspaceLayout` on a session existing.
 *
 * Reads the session store directly rather than the auth slice, so the
 * workspace shell never imports `features/auth` — routing to the login screen
 * is a redirect, not a rendered component from that slice.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useSessionStore((state) => state.token !== null)
  const location = useLocation()

  if (!isAuthenticated) {
    return (
      <Navigate
        to={paths.auth.login()}
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  }

  return children
}
