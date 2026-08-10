import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"

import { AuthPageLayout } from "@/features/auth/components/AuthPageLayout"
import {
  EMPTY_LOGIN_FORM,
  type LoginForm,
  LoginFormSchema,
} from "@/features/auth/model/auth.schema"
import { useLoginMutation } from "@/features/auth/queries/auth.queries"
import { paths } from "@/routes/paths"
import { getFieldErrors, toUserMessage } from "@/shared/api/error-presentation"
import { useSessionStore } from "@/shared/auth/session-store"
import { Button } from "@/shared/ui/button"
import { FormField } from "@/shared/ui/composite/FormField"
import { Input } from "@/shared/ui/input"

export function LoginPage() {
  const isAuthenticated = useSessionStore((state) => state.token !== null)
  const navigate = useNavigate()
  const location = useLocation()
  const mutation = useLoginMutation()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: EMPTY_LOGIN_FORM,
    mode: "onBlur",
  })

  // Already signed in — nothing for this screen to do. Honours the redirect
  // the guard sent the user here from, same as after a fresh login below.
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from ?? paths.root()
    return <Navigate to={from} replace />
  }

  async function onSubmit(values: LoginForm) {
    try {
      await mutation.mutateAsync(values)
      const from = (location.state as { from?: string } | null)?.from ?? paths.root()
      void navigate(from, { replace: true })
    } catch (error) {
      const fieldErrors = getFieldErrors(error)
      if (Object.keys(fieldErrors).length > 0) {
        for (const [field, message] of Object.entries(fieldErrors)) {
          setError(field as keyof LoginForm, { type: "server", message })
        }
      } else {
        // Wrong email/password has no field to attach to — it names neither
        // one, so it belongs on the password field as the closer prompt.
        setError("password", { type: "server", message: toUserMessage(error) })
      }
    }
  }

  return (
    <AuthPageLayout
      title="Sign in"
      description="Sign in to continue to your world."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            to={paths.auth.register()}
            className="rounded-sm text-foreground underline underline-offset-4 focus-ring"
          >
            Create one
          </Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4"
      >
        <FormField label="Email" error={errors.email?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              {...register("email")}
            />
          )}
        </FormField>

        <FormField label="Password" error={errors.password?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              {...register("password")}
            />
          )}
        </FormField>

        <Button type="submit" size="sm" disabled={mutation.isPending} className="mt-1">
          {mutation.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          Sign in
        </Button>
      </form>
    </AuthPageLayout>
  )
}
