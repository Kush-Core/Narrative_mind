/**
 * Runtime client configuration — the single boundary between `import.meta.env`
 * and the rest of the app (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.5).
 *
 * Three rules hold this together:
 *
 *  1. **Nothing else in the app reads `import.meta.env`.** Everything imports
 *     `appConfig`, so there is one place to see what the client is configured
 *     with and one place to change how it is read.
 *  2. **Validated at startup, not at first use.** A malformed
 *     `VITE_API_BASE_URL` fails immediately and loudly with a message naming the
 *     variable, rather than surfacing as a confusing 404 on the first request.
 *  3. **No secrets.** Everything here is embedded in the browser bundle at build
 *     time; only non-sensitive, `VITE_`-prefixed values may appear.
 *
 * Endpoint *paths* are not configured here — they belong to the backend
 * contract and live in `shared/api/endpoints.ts`. This module owns only where
 * the backend is and how the client behaves in a given environment.
 */

import { z } from "zod"

const DEFAULT_API_BASE_URL = "http://localhost:8000"

/**
 * Environment-dependent client behaviour. Development favours fast feedback
 * (short timeout, verbose failures); production favours resilience over a
 * slower or less reliable network.
 */
interface RuntimeProfile {
  /** Client-side deadline for a single request, in milliseconds. */
  requestTimeoutMs: number
  /**
   * Deadline for a request that waits on a language model, in milliseconds.
   *
   * A separate budget because the ordinary one is far too short for these: the
   * four `/ai/*` endpoints run an embedding call, Cypher, and/or a full LLM
   * generation with no streaming and no server-side timeout, and `/ai/extract`
   * does *constrained* decoding over a passage of up to 5000 characters. Local
   * Ollama routinely exceeds 15s on that; the general deadline would abort a
   * request that was going to succeed.
   *
   * Development is the more generous of the two because that is where the slow
   * local model runs — deployment uses Groq, and its ceiling is the serverless
   * platform's function limit rather than this value.
   */
  aiRequestTimeoutMs: number
  /** How often the status bar re-checks backend reachability, in milliseconds. */
  healthPollIntervalMs: number
  /** Log normalized API errors to the console as they are produced. */
  logApiErrors: boolean
}

const DEVELOPMENT_PROFILE: RuntimeProfile = {
  requestTimeoutMs: 15_000,
  aiRequestTimeoutMs: 120_000,
  healthPollIntervalMs: 30_000,
  logApiErrors: true,
}

const PRODUCTION_PROFILE: RuntimeProfile = {
  requestTimeoutMs: 30_000,
  aiRequestTimeoutMs: 60_000,
  healthPollIntervalMs: 60_000,
  logApiErrors: false,
}

/**
 * `VITE_API_BASE_URL` must be an absolute http(s) URL. A relative value would
 * silently resolve against whatever origin happens to serve the app, which is a
 * deployment bug that only shows up in production.
 */
const EnvSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => {
        try {
          const url = new URL(value)
          return url.protocol === "http:" || url.protocol === "https:"
        } catch {
          return false
        }
      },
      { message: "must be an absolute http(s) URL, for example http://localhost:8000" },
    )
    .default(DEFAULT_API_BASE_URL),
})

/** Trailing slashes are stripped so path joining is unambiguous everywhere else. */
function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function readEnv(source: ImportMetaEnv) {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ")
    throw new Error(
      `Invalid client configuration — ${detail}. Check your .env against .env.example.`,
    )
  }
  return result.data
}

const env = readEnv(import.meta.env)
const apiBaseUrl = stripTrailingSlash(env.VITE_API_BASE_URL)
const isDev = import.meta.env.DEV
const isTest = import.meta.env.MODE === "test"
const profile: RuntimeProfile = isDev
  ? // Tests deliberately provoke failures, so error logging is off there — the
    // assertions are the report, and a passing suite should be quiet.
    { ...DEVELOPMENT_PROFILE, logApiErrors: !isTest }
  : PRODUCTION_PROFILE

export const appConfig = {
  appName: "Narrative Mind",
  apiBaseUrl,
  /** FastAPI's interactive docs, useful during development. */
  apiDocsUrl: `${apiBaseUrl}/docs`,
  apiHost: new URL(apiBaseUrl).host,
  mode: import.meta.env.MODE,
  isDev,
  isProd: import.meta.env.PROD,
  ...profile,
} as const

export type AppConfig = typeof appConfig
