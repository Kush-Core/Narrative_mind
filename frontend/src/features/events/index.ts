/**
 * Public surface of the `events` slice.
 *
 * Other modules import from `@/features/events` and never from its
 * internals (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.3). Keeping the
 * surface this small is what lets the slice change shape without rippling.
 */

export { eventDescriptor } from "@/features/events/model/event.descriptor"
export type { Event, EventForm } from "@/features/events/model/event.schema"
export { EventDetailPage } from "@/features/events/pages/EventDetailPage"
export { EventListPage } from "@/features/events/pages/EventListPage"
