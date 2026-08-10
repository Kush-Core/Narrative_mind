/**
 * The auth resource layer.
 *
 * Not built on `createEntityResource` (`shared/api/resource.ts`): that factory
 * assumes the CRUD-and-list shape the four entity routers share, and `/auth`
 * has neither a list nor a `GET` — just two writes with their own response
 * shapes (docs/frontend/API_INTEGRATION_PLAN.md, auth contract).
 */

import {
  type LoginForm,
  RegisteredUserSchema,
  type RegisterForm,
  TokenSchema,
  toLoginBody,
  toRegisterBody,
} from "@/features/auth/model/auth.schema"
import { endpoints } from "@/shared/api/endpoints"
import { httpClient } from "@/shared/api/http-client"

export const authApi = {
  register(form: RegisterForm) {
    return httpClient.post(endpoints.auth.register(), toRegisterBody(form), {
      schema: RegisteredUserSchema,
    })
  },

  login(form: LoginForm) {
    return httpClient.post(endpoints.auth.login(), toLoginBody(form), {
      schema: TokenSchema,
    })
  },
}
