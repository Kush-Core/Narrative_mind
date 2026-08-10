import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"
import { Link, Navigate, useNavigate } from "react-router-dom"

import { AuthPageLayout } from "@/features/auth/components/AuthPageLayout"
import {
  EMPTY_REGISTER_FORM,
  type RegisterForm,
  RegisterFormSchema,
} from "@/features/auth/model/auth.schema"
import { useRegisterMutation } from "@/features/auth/queries/auth.queries"
import { paths } from "@/routes/paths"
import { getFieldErrors, toUserMessage } from "@/shared/api/error-presentation"
import { useSessionStore } from "@/shared/auth/session-store"
import { Button } from "@/shared/ui/button"
import { FormField } from "@/shared/ui/composite/FormField"
import { Input } from "@/shared/ui/input"

export function RegisterPage() {
  const isAuthenticated = useSessionStore((state) => state.token !== null)
  const navigate = useNavigate()
  const mutation = useRegisterMutation()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: EMPTY_REGISTER_FORM,
    mode: "onBlur",
  })

  if (isAuthenticated) return <Navigate to={paths.root()} replace />

  async function onSubmit(values: RegisterForm) {
    try {
      await mutation.mutateAsync(values)
      void navigate(paths.root(), { replace: true })
    } catch (error) {
      const fieldErrors = getFieldErrors(error)
      if (Object.keys(fieldErrors).length > 0) {
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (field === "email" || field === "password") {
            setError(field, { type: "server", message })
          }
        }
      } else {
        // A 409 (email taken) names no field — put it on email, the value
        // that actually conflicted.
        setError("email", { type: "server", message: toUserMessage(error) })
      }
    }
  }

  return (
    <AuthPageLayout
      title="Create an account"
      description="Start building your world."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={paths.auth.login()}
            className="rounded-sm text-foreground underline underline-offset-4 focus-ring"
          >
            Sign in
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
              autoComplete="new-password"
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              {...register("password")}
            />
          )}
        </FormField>

        <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              {...register("confirmPassword")}
            />
          )}
        </FormField>

        <Button type="submit" size="sm" disabled={mutation.isPending} className="mt-1">
          {mutation.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          Create account
        </Button>
      </form>
    </AuthPageLayout>
  )
}
