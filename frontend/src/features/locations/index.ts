/**
 * Public surface of the `locations` slice.
 *
 * Other modules import from `@/features/locations` and never from its
 * internals (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.3). Keeping the
 * surface this small is what lets the slice change shape without rippling.
 */

export { locationDescriptor } from "@/features/locations/model/location.descriptor"
export type { Location, LocationForm } from "@/features/locations/model/location.schema"
export { LocationDetailPage } from "@/features/locations/pages/LocationDetailPage"
export { LocationListPage } from "@/features/locations/pages/LocationListPage"
