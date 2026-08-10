/**
 * Auth mutations. Both write straight into `useSessionStore` on success rather
 * than through the query cache — a token is not server data the query layer
 * should own (see `shared/auth/session-store.ts`).
 *
 * Both suppress the shared mutation-error toast: a rejected login or a
 * duplicate-email register lands as a field error on the form the user is
 * looking at (docs/frontend/API_INTEGRATION_PLAN.md §4), which would be
 * redundant paired with a toast.
 */

import { useMutation } from "@tanstack/react-query"

import { authApi } from "@/features/auth/api/auth.api"
import type { LoginForm, RegisterForm } from "@/features/auth/model/auth.schema"
import { useSessionStore } from "@/shared/auth/session-store"

export function useLoginMutation() {
  const setSession = useSessionStore((state) => state.setSession)

  return useMutation({
    mutationFn: (form: LoginForm) => authApi.login(form),
    onSuccess: (token) => setSession(token.accessToken),
    meta: { suppressErrorToast: true },
  })
}

/**
 * Register, then immediately log in with the same credentials — the backend
 * issues no token on registration, and asking the user to retype what they
 * just typed would be a needless second step.
 */
export function useRegisterMutation() {
  const setSession = useSessionStore((state) => state.setSession)

  return useMutation({
    mutationFn: async (form: RegisterForm) => {
      await authApi.register(form)
      return authApi.login(form)
    },
    onSuccess: (token) => setSession(token.accessToken),
    meta: { suppressErrorToast: true },
  })
}
