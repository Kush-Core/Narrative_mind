/**
 * The auth contract — mirrors `backend/src/narrative_mind/domain/user.py`
 * (`UserCreate`, `UserLogin`, `User`, `Token`).
 *
 * The backend's `email` bound is Pydantic's `EmailStr` and `password` is an
 * unconstrained `str`; the 8-character minimum below is a client-side UX floor
 * with no backend counterpart, so a shorter password is *rejected by the form*
 * without the round trip, never *accepted here and refused by the server*.
 */

import { z } from "zod"

export const EmailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address")

export const NewPasswordSchema = z.string().min(8, "Password must be at least 8 characters")

/* -------------------------------------------------------------- form model */

export const LoginFormSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Password is required"),
})

export type LoginForm = z.infer<typeof LoginFormSchema>

export const EMPTY_LOGIN_FORM: LoginForm = { email: "", password: "" }

export const RegisterFormSchema = z
  .object({
    email: EmailSchema,
    password: NewPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((form) => form.password === form.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export type RegisterForm = z.infer<typeof RegisterFormSchema>

export const EMPTY_REGISTER_FORM: RegisterForm = { email: "", password: "", confirmPassword: "" }

/* -------------------------------------------------------------- read model */

/** `Token` — the login response. */
export const TokenSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string(),
  })
  .transform((wire) => ({ accessToken: wire.access_token, tokenType: wire.token_type }))

export type Token = z.infer<typeof TokenSchema>

/** `User` — the register response. */
export const RegisteredUserSchema = z.object({
  id: z.string(),
  email: z.string(),
})

export type RegisteredUser = z.infer<typeof RegisteredUserSchema>

/* ----------------------------------------------------------------- mappers */

export function toLoginBody(form: LoginForm) {
  return { email: form.email, password: form.password }
}

export function toRegisterBody(form: RegisterForm) {
  return { email: form.email, password: form.password }
}
