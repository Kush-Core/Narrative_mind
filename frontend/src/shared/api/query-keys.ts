/**
 * Central query-key registry (docs/frontend/API_INTEGRATION_PLAN.md §2,
 * STATE_MANAGEMENT.md §2). Query keys are never written ad hoc — every key in
 * the app is produced here so invalidation is predictable and greppable.
 *
 * Entity slices register their key factories as they are implemented
 * (M2/M3); only the system domain exists at the foundation stage.
 */

export const queryKeys = {
  system: {
    root: ["system"] as const,
    health: ["system", "health"] as const,
  },
} as const
