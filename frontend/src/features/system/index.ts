/**
 * Public surface of the `system` slice.
 *
 * Other modules import from `@/features/system`, never from its internals —
 * the encapsulation rule in docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.3.
 */

export type { Health } from "@/features/system/model/health.schema"
export type { ConnectionStatus } from "@/features/system/queries/system.queries"
export { useHealthQuery } from "@/features/system/queries/system.queries"
