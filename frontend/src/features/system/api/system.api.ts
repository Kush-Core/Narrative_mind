/**
 * The system resource layer.
 *
 * This is the reference implementation of a slice's `api/` module: it builds a
 * request from `endpoints`, calls `httpClient`, and returns schema-validated
 * typed data. No React, no caching, no URL strings of its own.
 *
 * `/health` is not a CRUD collection, so it does not use `createEntityResource`
 * — a plain resource function is the right shape for a singleton read.
 */

import { type Health, HealthSchema } from "@/features/system/model/health.schema"
import { endpoints } from "@/shared/api/endpoints"
import { httpClient } from "@/shared/api/http-client"
import type { ResourceCallOptions } from "@/shared/api/resource"

export function getHealth(options?: ResourceCallOptions): Promise<Health> {
  return httpClient.get(endpoints.system.health(), {
    schema: HealthSchema,
    signal: options?.signal,
    // The status indicator should give up quickly and report "offline" rather
    // than hold a pending state for the full default deadline.
    timeoutMs: 5_000,
  })
}
