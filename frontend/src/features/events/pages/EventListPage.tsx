import { eventDescriptor } from "@/features/events/model/event.descriptor"
import { EntityListPage } from "@/shared/entity-kit/EntityCrudPages"

/**
 * The Event list screen — the generic CRUD screen bound to the Event
 * descriptor. See `CharacterListPage` for the shape all entity lists share.
 *
 * A future timeline visualization is a *sibling* of this screen (a different
 * view of the same query), not a rewrite of it.
 */
export function EventListPage() {
  return <EntityListPage descriptor={eventDescriptor} />
}
