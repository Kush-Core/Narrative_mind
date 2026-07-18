/**
 * The MSW server instance and the helpers tests use to describe backend
 * behaviour.
 *
 * Handlers are declared per-test rather than as a global fixture set, because
 * what matters in this layer is the *shape of a specific response* — an empty
 * page, a domain 404, a FastAPI 422. Naming those shapes here keeps each test
 * about the behaviour it verifies rather than about JSON plumbing.
 */

import { http, type HttpHandler, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import { TEST_API_BASE_URL } from "@/test/constants"

export const server = setupServer()

/** Absolute URL for a backend path, matching what the client will request. */
export function apiUrl(path: string): string {
  return `${TEST_API_BASE_URL}${path}`
}

/* ------------------------------------------------------- response builders */

/** The backend's domain error envelope, from its registered exception handlers. */
export function domainError(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status })
}

/** FastAPI's request-validation shape — a *different* 422 from the above. */
export function validationError(
  issues: { loc: (string | number)[]; msg: string; type?: string }[],
) {
  return HttpResponse.json({ detail: issues }, { status: 422 })
}

/** A backend page, deliberately *without* `has_more` — as the real one is. */
export function pageResponse<T>(items: T[], total: number, limit = 20, offset = 0) {
  return HttpResponse.json({ items, total, limit, offset })
}

/* --------------------------------------------------------------- handlers */

export function getJson(path: string, resolver: Parameters<typeof http.get>[1]): HttpHandler {
  return http.get(apiUrl(path), resolver)
}

export function postJson(path: string, resolver: Parameters<typeof http.post>[1]): HttpHandler {
  return http.post(apiUrl(path), resolver)
}

export function patchJson(path: string, resolver: Parameters<typeof http.patch>[1]): HttpHandler {
  return http.patch(apiUrl(path), resolver)
}

export function deleteJson(path: string, resolver: Parameters<typeof http.delete>[1]): HttpHandler {
  return http.delete(apiUrl(path), resolver)
}
