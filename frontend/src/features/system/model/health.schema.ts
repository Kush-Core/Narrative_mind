/**
 * The `/health` contract (analysis §API Surface).
 *
 * Response: `{"status": "ok", "environment": "development"}`.
 *
 * `status` is parsed as a plain string rather than a literal `"ok"`: the backend
 * only ever returns `"ok"` today, but a future degraded state should be
 * *displayed*, not rejected as a contract violation by the client.
 */

import { z } from "zod"

export const HealthSchema = z
  .object({
    status: z.string(),
    environment: z.string(),
  })
  .transform((health) => ({
    status: health.status,
    environment: health.environment,
    isHealthy: health.status.toLowerCase() === "ok",
  }))

export type Health = z.infer<typeof HealthSchema>
