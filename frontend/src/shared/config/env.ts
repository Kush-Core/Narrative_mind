/**
 * Runtime client configuration, read from `import.meta.env` exactly once.
 * Everything else in the app imports `appConfig` — never `import.meta.env`.
 */

const DEFAULT_API_BASE_URL = "http://localhost:8000"

function normalizeBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() ? raw.trim() : DEFAULT_API_BASE_URL
  return value.endsWith("/") ? value.slice(0, -1) : value
}

const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)

export const appConfig = {
  appName: "Narrative Mind",
  apiBaseUrl,
  /** FastAPI's interactive docs, useful during development. */
  apiDocsUrl: `${apiBaseUrl}/docs`,
  apiHost: new URL(apiBaseUrl).host,
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
} as const

export type AppConfig = typeof appConfig
