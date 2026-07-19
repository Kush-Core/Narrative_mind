/**
 * Public surface of the `factions` slice.
 *
 * Other modules import from `@/features/factions` and never from its
 * internals (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.3). Keeping the
 * surface this small is what lets the slice change shape without rippling.
 */

export { factionDescriptor } from "@/features/factions/model/faction.descriptor"
export type { Faction, FactionForm } from "@/features/factions/model/faction.schema"
export { FactionDetailPage } from "@/features/factions/pages/FactionDetailPage"
export { FactionListPage } from "@/features/factions/pages/FactionListPage"
